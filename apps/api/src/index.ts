import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import sanitizeHtml from "sanitize-html";
import session from "express-session";
import { randomUUID } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { config } from "./config";
import { db, EmailRow } from "./db";
import { connection, emailQueue } from "./queue";
import { indexEmails, searchIds } from "./search";
import { RedisSessionStore } from "./session-store";
import { hashPassword, verifyPassword } from "./password";
import { findOrCreateGoogleTenant } from "./google-account";

declare module "express-session" {
  interface SessionData {
    tenantId?: string;
    oauthState?: string;
    slackState?: string;
  }
}

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: config.webUrl, credentials: true }));
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  const origin = req.header("Origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && origin && origin !== new URL(config.webUrl).origin) {
    return res.status(403).json({ error: "Request origin is not allowed" });
  }
  next();
});
app.use(
  session({
    name: "reachinbox.sid",
    store: new RedisSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

function required(req: Request, res: Response, next: NextFunction) {
  if (req.session.tenantId) return next();
  res.status(401).json({ error: "Authentication required" });
}

const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: boardAdapter,
  options: { uiConfig: { boardTitle: "🎯 ReachInbox queues" } },
});
app.use("/admin/queues", required, async (req, res, next) => {
  try {
    const allowed = (process.env.QUEUE_ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
    // Local development remains convenient; production is deny-by-default.
    if (!allowed.length && process.env.NODE_ENV !== "production") return next();
    const { rows: [tenant] } = await db.query("SELECT email FROM tenants WHERE id=$1", [req.session.tenantId]);
    if (!tenant || !allowed.includes(tenant.email.toLowerCase())) return res.status(403).json({ error: "Queue administrator access required" });
    next();
  } catch (error) { next(error); }
}, boardAdapter.getRouter());

app.get("/health", async (_req, res) => {
  try {
    await Promise.all([db.query("SELECT 1"), connection.ping()]);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
}

async function signIn(req: Request, tenantId: string) {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  req.session.tenantId = tenantId;
  await saveSession(req);
}

app.post("/auth/register", async (req, res, next) => {
  try {
    const email = String(req.body.email ?? "")
      .trim()
      .toLowerCase();
    const name = String(req.body.name ?? "").trim();
    const password = String(req.body.password ?? "");
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      name.length < 2 ||
      name.length > 100 ||
      password.length < 8 ||
      password.length > 200
    )
      return res
        .status(400)
        .json({
          error:
            "Enter your name, a valid email, and a password of at least 8 characters.",
        });
    const result = await db.query(
      "INSERT INTO tenants(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id",
      [randomUUID(), email, name, await hashPassword(password)],
    );
    if (!result.rows.length)
      return res
        .status(409)
        .json({
          error: "An account with this email already exists. Please log in.",
        });
    await signIn(req, result.rows[0].id);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// The single email form signs in existing accounts and creates new ones.
// Google-only accounts stay Google-only unless the owner explicitly links a password.
app.post("/auth/email", async (req, res, next) => {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 200)
      return res.status(400).json({ error: "Enter a valid email and password." });
    const attemptKey = `login-attempt:${email}:${req.ip}`;
    const attempts = await connection.incr(attemptKey);
    if (attempts === 1) await connection.expire(attemptKey, 900);
    if (attempts > 10) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    const { rows: [existing] } = await db.query("SELECT id,password_hash FROM tenants WHERE email=$1", [email]);
    if (existing) {
      if (!existing.password_hash) return res.status(409).json({ error: "Use Login with Google for this account." });
      if (!(await verifyPassword(password, existing.password_hash)))
        return res.status(401).json({ error: "Incorrect password." });
      await connection.del(attemptKey);
      await signIn(req, existing.id);
      return res.json({ ok: true });
    }
    if (password.length < 8 || password.length > 200)
      return res.status(400).json({ error: "New accounts need a password of at least 8 characters." });
    const name = email.split("@")[0].slice(0, 100);
    const result = await db.query(
      "INSERT INTO tenants(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id",
      [randomUUID(), email, name, await hashPassword(password)],
    );
    if (!result.rows.length) return res.status(409).json({ error: "Account created in another request. Try again." });
    await connection.del(attemptKey);
    await signIn(req, result.rows[0].id);
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password ?? "");
    if (!email || !password)
      return res.status(400).json({ error: "Enter your email and password." });
    const attemptKey = `login-attempt:${email}:${req.ip}`;
    const attempts = await connection.incr(attemptKey);
    if (attempts === 1) await connection.expire(attemptKey, 900);
    if (attempts > 10)
      return res
        .status(429)
        .json({ error: "Too many login attempts. Try again in 15 minutes." });
    const {
      rows: [tenant],
    } = await db.query("SELECT id,password_hash FROM tenants WHERE email=$1", [
      email,
    ]);
    if (
      !tenant?.password_hash ||
      !(await verifyPassword(password, tenant.password_hash))
    )
      return res.status(401).json({ error: "Invalid email or password." });
    await connection.del(attemptKey);
    await signIn(req, tenant.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/auth/google", async (req, res, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
      return res.status(501).json({ error: "Google OAuth is not configured" });
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );
    const state = randomUUID();
    req.session.oauthState = state;
    await saveSession(req);
    res.redirect(
      client.generateAuthUrl({ scope: ["openid", "email", "profile"], state }),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/auth/google/callback", async (req, res, next) => {
  try {
    if (!req.session.oauthState || req.query.state !== req.session.oauthState)
      throw new Error("Invalid OAuth state");
    req.session.oauthState = undefined;
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );
    const { tokens } = await client.getToken(String(req.query.code));
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const profile = ticket.getPayload();
    if (!profile?.email || !profile.email_verified)
      throw new Error("A verified Google email is required");
    const tenantId = await findOrCreateGoogleTenant({
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    await signIn(req, tenantId);
    res.redirect(config.webUrl);
  } catch (error) {
    console.error("Google sign-in failed:", error);
    const url = new URL(config.webUrl);
    url.searchParams.set("authError", error instanceof Error && error.message === "This email is linked to a different Google account."
      ? error.message : "Google sign-in could not be completed. Please try again.");
    res.redirect(url.toString());
  }
});

app.post("/auth/logout", (req, res, next) =>
  req.session.destroy((error) => (error ? next(error) : res.status(204).end())),
);

app.get("/api/me", required, async (req, res, next) => {
  try {
    const {
      rows: [tenant],
    } = await db.query(
      "SELECT id,email,name,avatar_url,google_sub IS NOT NULL AS google_connected,slack_webhook_url IS NOT NULL AS slack_connected,slack_channel FROM tenants WHERE id=$1",
      [req.session.tenantId],
    );
    res.json(tenant);
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", required, (_req, res) => {
  let configuredSenders: string[] = [];
  try {
    configuredSenders = Object.keys(
      JSON.parse(process.env.SMTP_ACCOUNTS_JSON || "{}"),
    );
  } catch {
    /* Config validation happens in worker. */
  }
  const senders = Array.from(
    new Set(
      [process.env.SMTP_USER, ...(process.env.SMTP_SENDERS ?? "").split(",").map(value => value.trim()).filter(Boolean), ...configuredSenders].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  res.json({
    default_sender: senders[0] ?? "",
    senders,
    max_hourly_limit: config.hourlyLimit,
    min_send_delay_ms: config.minDelay,
  });
});

app.get("/auth/slack", required, async (req, res, next) => {
  try {
    if (
      !process.env.SLACK_CLIENT_ID ||
      !process.env.SLACK_CLIENT_SECRET ||
      !process.env.SLACK_CALLBACK_URL
    )
      return res.status(501).json({ error: "Slack OAuth is not configured" });
    const state = randomUUID();
    req.session.slackState = state;
    await saveSession(req);
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID);
    url.searchParams.set("scope", "incoming-webhook");
    url.searchParams.set("redirect_uri", process.env.SLACK_CALLBACK_URL);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  } catch (error) {
    next(error);
  }
});

app.get("/auth/slack/callback", required, async (req, res, next) => {
  try {
    if (!req.session.slackState || req.query.state !== req.session.slackState)
      throw new Error("Invalid Slack OAuth state");
    req.session.slackState = undefined;
    await saveSession(req);
    if (req.query.error) return res.redirect(`${config.webUrl}/?authError=${encodeURIComponent("Slack connection was cancelled or rejected. Try Connect Slack again.")}`);
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code: String(req.query.code),
      redirect_uri: process.env.SLACK_CALLBACK_URL!,
    });
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      access_token?: string;
      team?: { id: string };
      incoming_webhook?: { url: string; channel: string };
    };
    if (!data.ok || !data.incoming_webhook?.url)
      throw new Error(data.error ?? "Slack did not return an incoming webhook");
    await db.query(
      "UPDATE tenants SET slack_access_token=$1,slack_team_id=$2,slack_webhook_url=$3,slack_channel=$4 WHERE id=$5",
      [
        data.access_token,
        data.team?.id,
        data.incoming_webhook.url,
        data.incoming_webhook.channel,
        req.session.tenantId,
      ],
    );
    res.redirect(config.webUrl);
  } catch (error) {
    console.error("Slack OAuth:", error);
    res.redirect(`${config.webUrl}/?authError=${encodeURIComponent("Slack authorization failed. Check the registered callback URL and try connecting again.")}`);
  }
});

app.post("/api/slack/disconnect", required, async (req, res, next) => {
  try {
    await db.query(
      "UPDATE tenants SET slack_access_token=NULL,slack_team_id=NULL,slack_webhook_url=NULL,slack_channel=NULL WHERE id=$1",
      [req.session.tenantId],
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/emails/schedule", required, async (req, res, next) => {
  try {
    const {
      recipients,
      subject,
      body,
      sender,
      startsAt,
      delayMs = 0,
      hourlyLimit = config.hourlyLimit,
      bodyHtml,
      attachments = [],
    } = req.body;
    const key = req.header("Idempotency-Key");
    if (!key || key.length > 200)
      return res
        .status(400)
        .json({ error: "A valid Idempotency-Key header is required" });
    if (
      !Array.isArray(recipients) ||
      recipients.length < 1 ||
      recipients.length > 5000 ||
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof body !== "string" ||
      !body.trim() ||
      typeof sender !== "string" ||
      (sender !== "rotate" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) ||
      !startsAt
    )
      return res
        .status(400)
        .json({
          error:
            "Valid recipients, subject, body, sender, and startsAt are required",
        });
    if (
      recipients.some(
        (value: unknown) =>
          typeof value !== "string" ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      )
    )
      return res
        .status(400)
        .json({ error: "One or more recipient addresses are invalid" });
    const uniqueRecipients = Array.from(new Set((recipients as string[]).map(value => value.trim().toLowerCase())));
    const availableSenders = Array.from(new Set([
      process.env.SMTP_USER,
      ...(process.env.SMTP_SENDERS ?? "").split(",").map(value => value.trim()),
      ...Object.keys(process.env.SMTP_ACCOUNTS_JSON ? JSON.parse(process.env.SMTP_ACCOUNTS_JSON) : {}),
    ].filter((value): value is string => Boolean(value))));
    if (sender === "rotate" && !availableSenders.length)
      return res.status(400).json({ error: "No SMTP senders are configured." });
    const base = new Date(startsAt).getTime();
    const gap = Number(delayMs);
    const limit = Number(hourlyLimit);
    if (
      !Number.isFinite(base) ||
      !Number.isInteger(gap) ||
      gap < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > config.hourlyLimit ||
      base + (recipients.length - 1) * gap > 8640000000000000
    )
      return res
        .status(400)
        .json({ error: "Invalid start time, delay, or hourly limit" });

    const attachmentLimit = 5 * 1024 * 1024;
    if (!Array.isArray(attachments) || attachments.length > 20)
      return res.status(400).json({ error: "Choose at most 20 attachments, up to 5 MB total." });
    let totalBytes = 0;
    const safeAttachments = [];
    for (const file of attachments) {
      if (!file || typeof file.name !== "string" || !file.name.trim() || file.name.length > 255 ||
          typeof file.content !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content))
        return res.status(400).json({ error: "Invalid attachment." });
      const content = Buffer.from(file.content, "base64");
      totalBytes += content.length;
      if (totalBytes > attachmentLimit)
        return res.status(413).json({ error: "Attachments must be 5 MB or less in total." });
      safeAttachments.push({ name: file.name.replace(/[\\/\r\n]/g, "_"),
        type: typeof file.type === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : "application/octet-stream",
        size: content.length, content: content.toString("base64") });
    }
    if (typeof bodyHtml === "string" && bodyHtml.length > 200000)
      return res.status(400).json({ error: "Email body is too long." });
    const cleanHtml = typeof bodyHtml === "string" ? sanitizeHtml(bodyHtml, {
      allowedTags: ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "strike", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "a", "font"],
      allowedAttributes: { "*": ["style"], a: ["href"], font: ["size"] },
      allowedStyles: { "*": { "text-align": [/^(left|center|right|justify)$/], "font-size": [/^\d+(px|em|rem|%)$/] } },
      allowedSchemes: ["https", "http", "mailto"],
    }) : null;

    const client = await db.connect();
    let emails: EmailRow[] = [];
    let idempotent = false;
    try {
      await client.query("BEGIN");
      const campaignId = randomUUID();
      const inserted = await client.query(
        "INSERT INTO campaigns(id,tenant_id,idempotency_key,attachments) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id",
        [campaignId, req.session.tenantId, key, JSON.stringify(safeAttachments)],
      );
      if (!inserted.rows.length) {
        idempotent = true;
        const existing = await client.query<EmailRow>(
          "SELECT * FROM emails WHERE campaign_id=(SELECT id FROM campaigns WHERE tenant_id=$1 AND idempotency_key=$2) ORDER BY scheduled_at,id",
          [req.session.tenantId, key],
        );
        emails = existing.rows;
      } else {
        for (const [index, recipient] of uniqueRecipients.entries()) {
          const scheduledAt = new Date(base + index * gap);
          const {
            rows: [email],
          } = await client.query<EmailRow>(
            "INSERT INTO emails(id,tenant_id,campaign_id,recipient,subject,body,sender,hourly_limit,scheduled_at,status,body_html) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
            [
              randomUUID(),
              req.session.tenantId,
              campaignId,
              recipient,
              subject.trim(),
              body,
              (sender === "rotate" ? availableSenders[index % availableSenders.length] : sender).toLowerCase(),
              limit,
              scheduledAt,
              "scheduled",
              cleanHtml,
            ],
          );
          emails.push(email);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    for (const email of emails) {
      if (email.status !== "scheduled" || email.mailbox === "trash") continue;
      if (email.bull_job_id && (await emailQueue.getJob(email.bull_job_id)))
        continue;
      const job = await emailQueue.add(
        "send",
        { emailId: email.id },
        {
          jobId: email.id,
          delay: Math.max(
            0,
            new Date(email.scheduled_at).getTime() - Date.now(),
          ),
        },
      );
      await db.query("UPDATE emails SET bull_job_id=$2 WHERE id=$1", [
        email.id,
        job.id,
      ]);
    }
    if (!idempotent) await indexEmails(emails);
    res
      .status(idempotent ? 200 : 201)
      .json({ count: emails.length, emails, idempotent });
  } catch (error) {
    next(error);
  }
});

app.get("/api/campaigns/:id/progress", required, async (req, res, next) => {
  try {
    const { rows: [progress] } = await db.query(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status='sent')::int AS sent,
        count(*) FILTER (WHERE status='sending')::int AS sending,
        count(*) FILTER (WHERE status='scheduled')::int AS scheduled,
        count(*) FILTER (WHERE status='failed')::int AS failed,
        min(scheduled_at) AS starts_at
      FROM emails WHERE campaign_id=$1 AND tenant_id=$2`, [req.params.id, req.session.tenantId]);
    if (!progress?.total) return res.status(404).json({ error: "Campaign not found" });
    res.json(progress);
  } catch (error) { next(error); }
});

app.get("/api/emails", required, async (req, res, next) => {
  try {
    const statuses = String(req.query.status ?? "")
      .split(",")
      .filter(Boolean);
    if (
      statuses.some(
        (status) =>
          !["scheduled", "sending", "sent", "failed"].includes(status),
      )
    )
      return res.status(400).json({ error: "Invalid status filter" });
    const query = String(req.query.q ?? "")
      .trim()
      .slice(0, 200);
    const ids = query ? await searchIds(req.session.tenantId!, query) : [];
    const mailbox = String(req.query.mailbox ?? "inbox");
    if (!["inbox", "all", "archived", "trash"].includes(mailbox))
      return res.status(400).json({ error: "Invalid mailbox filter" });
    let sql = `SELECT emails.*, COALESCE((SELECT jsonb_agg(a - 'content') FROM campaigns c,
      jsonb_array_elements(c.attachments) a WHERE c.id=emails.campaign_id),'[]'::jsonb) AS attachments
      FROM emails WHERE tenant_id=$1`;
    const values: unknown[] = [req.session.tenantId];
    if (mailbox === "all") sql += " AND mailbox<> 'trash'";
    else { values.push(mailbox); sql += ` AND mailbox=$${values.length}`; }
    if (req.query.starred === "true") sql += " AND starred=true";
    if (statuses.length) {
      values.push(statuses);
      sql += ` AND status=ANY($${values.length})`;
    }
    if (query) {
      values.push(`%${query}%`);
      const textIndex = values.length;
      values.push(ids ?? []);
      sql += ` AND (id=ANY($${values.length}::uuid[]) OR recipient ILIKE $${textIndex} OR subject ILIKE $${textIndex} OR body ILIKE $${textIndex} OR sender ILIKE $${textIndex})`;
    }
    const offset = Math.max(0, Math.min(1000000, Number(req.query.offset) || 0));
    values.push(offset);
    sql += ` ORDER BY scheduled_at DESC,id LIMIT 100 OFFSET $${values.length}`;
    const { rows } = await db.query<EmailRow>(sql, values);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/email-counts", required, async (req, res, next) => {
  try {
    const { rows: [counts] } = await db.query(`SELECT
      count(*) FILTER (WHERE mailbox='inbox' AND status IN ('scheduled','sending'))::int AS scheduled,
      count(*) FILTER (WHERE mailbox='inbox' AND status IN ('sent','failed'))::int AS sent,
      count(*) FILTER (WHERE mailbox<>'trash')::int AS all,
      count(*) FILTER (WHERE mailbox='archived')::int AS archived,
      count(*) FILTER (WHERE mailbox='trash')::int AS trash
      FROM emails WHERE tenant_id=$1`, [req.session.tenantId]);
    res.json(counts);
  } catch (error) { next(error); }
});

app.patch("/api/emails/:id/mailbox", required, async (req, res, next) => {
  try {
    const mailbox = req.body.mailbox;
    if (!["inbox", "archived", "trash"].includes(mailbox))
      return res.status(400).json({ error: "Invalid mailbox." });
    const { rows: [email] } = await db.query<EmailRow>(
      "UPDATE emails SET mailbox=$1 WHERE id=$2 AND tenant_id=$3 AND ($1<>'trash' OR status<>'sending') RETURNING *",
      [mailbox, req.params.id, req.session.tenantId]);
    if (!email) return res.status(409).json({ error: "Email not found or currently sending. Refresh and try again." });
    if (mailbox === "trash") {
      const job = email.bull_job_id && await emailQueue.getJob(email.bull_job_id);
      if (job) await job.remove().catch(() => {});
    } else if (email.status === "scheduled") {
      // A restored scheduled email needs a new job if its original was cancelled.
      const existing = email.bull_job_id && await emailQueue.getJob(email.bull_job_id);
      const state = existing && await existing.getState();
      if (!state || ["completed", "failed", "unknown"].includes(state)) {
        const job = await emailQueue.add("send", { emailId: email.id }, {
          jobId: `${email.id}-restored-${randomUUID()}`,
          delay: Math.max(0, new Date(email.scheduled_at).getTime() - Date.now()),
        });
        await db.query("UPDATE emails SET bull_job_id=$2 WHERE id=$1", [email.id, job.id]);
      }
    }
    await indexEmails([email]);
    res.json(email);
  } catch (error) { next(error); }
});

app.get("/api/emails/:id/attachments/:index", required, async (req, res, next) => {
  try {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) return res.status(404).end();
    const { rows: [row] } = await db.query(
      "SELECT c.attachments FROM emails e JOIN campaigns c ON c.id=e.campaign_id WHERE e.id=$1 AND e.tenant_id=$2",
      [req.params.id, req.session.tenantId]);
    const file = row?.attachments[index];
    if (!file) return res.status(404).end();
    res.setHeader("Content-Type", file.type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    const disposition = req.query.preview === "1" && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.send(Buffer.from(file.content, "base64"));
  } catch (error) { next(error); }
});

app.patch("/api/emails/:id/star", required, async (req, res, next) => {
  try {
    if (typeof req.body.starred !== "boolean")
      return res.status(400).json({ error: "starred must be a boolean" });
    const {
      rows: [email],
    } = await db.query<EmailRow>(
      "UPDATE emails SET starred=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *",
      [req.body.starred, req.params.id, req.session.tenantId],
    );
    if (!email) return res.status(404).json({ error: "Email not found" });
    res.json(email);
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const status = (error as Error & { status?: number }).status;
  res.status(status === 413 ? 413 : 500).json({ error: status === 413 ? "Attachments must be 5 MB or less in total." : "Internal server error" });
});

async function main() {
  app.listen(config.port, () =>
    console.log(`API: http://localhost:${config.port}; queues: /admin/queues`),
  );
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
