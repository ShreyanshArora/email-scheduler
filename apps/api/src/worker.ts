import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { db, EmailRow } from "./db";
import { config } from "./config";
import { connection, EmailJob, emailQueue } from "./queue";
import { indexEmail } from "./search";
import { reserveSend, reserveSendGap } from "./rate-limit";
import { reconcileScheduled } from "./reconcile";

type SmtpAccount = { user: string; pass: string };
const accounts: Record<string, SmtpAccount> = process.env.SMTP_ACCOUNTS_JSON
  ? JSON.parse(process.env.SMTP_ACCOUNTS_JSON)
  : {};
const transports = new Map<
  string,
  ReturnType<typeof nodemailer.createTransport>
>();

function smtpFor(sender: string) {
  const account =
    accounts[sender.toLowerCase()] ??
    (process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined);
  if (!account)
    throw new Error("No Ethereal SMTP account configured for this sender");
  const key = account.user;
  if (!transports.has(key)) {
    transports.set(
      key,
      nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.ethereal.email",
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: false,
        auth: account,
        connectionTimeout: 30000,
        socketTimeout: 60000,
      }),
    );
  }
  return transports.get(key)!;
}

async function notifyLimit(tenantId: string, sender: string) {
  const {
    rows: [tenant],
  } = await db.query("SELECT slack_webhook_url FROM tenants WHERE id=$1", [
    tenantId,
  ]);
  if (!tenant?.slack_webhook_url) return;
  const hour = new Date().toISOString().slice(0, 13);
  const key = `email-rate-alert:${tenantId}:${sender.toLowerCase()}:${hour}`;
  if (!(await connection.set(key, "1", "PX", 3600000, "NX"))) return;
  try {
    const response = await fetch(tenant.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `ReachInbox: ${sender} reached its hourly email limit. Remaining emails were deferred.`,
      }),
    });
    if (!response.ok || (await response.text()) !== "ok")
      throw new Error("Slack webhook rejected the notification");
  } catch (error) {
    await connection.del(key);
    console.error("Slack rate-limit notification failed:", error);
  }
}

async function processEmail(job: { data: EmailJob }) {
  const {
    rows: [claimed],
  } = await db.query<EmailRow>(
    "UPDATE emails SET status='sending', sending_started_at=now() WHERE id=$1 AND status='scheduled' AND scheduled_at<=now() RETURNING *",
    [job.data.emailId],
  );
  if (!claimed) return;

  try {
    const deferMs = await reserveSend(
      claimed.tenant_id,
      claimed.sender,
      claimed.hourly_limit,
    );
    if (deferMs > 0) {
      const nextAt = new Date(Date.now() + deferMs + 50);
      await db.query(
        "UPDATE emails SET status='scheduled',scheduled_at=$2,sending_started_at=NULL WHERE id=$1",
        [claimed.id, nextAt],
      );
      const deferred = await emailQueue.add(
        "send",
        { emailId: claimed.id },
        {
          jobId: `${claimed.id}-deferred-${nextAt.getTime()}`,
          delay: Math.max(0, nextAt.getTime() - Date.now()),
        },
      );
      await db.query("UPDATE emails SET bull_job_id=$2 WHERE id=$1", [
        claimed.id,
        deferred.id,
      ]);
      await notifyLimit(claimed.tenant_id, claimed.sender);
      return;
    }

    const waitMs = await reserveSendGap();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const info = await smtpFor(claimed.sender).sendMail({
      from: claimed.sender,
      to: claimed.recipient,
      subject: claimed.subject,
      text: claimed.body,
      headers: { "X-ReachInbox-Email-ID": claimed.id },
    });
    const {
      rows: [sent],
    } = await db.query<EmailRow>(
      "UPDATE emails SET status='sent',sent_at=now(),error=NULL,smtp_message_id=$2,preview_url=$3 WHERE id=$1 RETURNING *",
      [claimed.id, info.messageId, nodemailer.getTestMessageUrl(info) || null],
    );
    await indexEmail(sent);
    if (deferMs === -1) await notifyLimit(claimed.tenant_id, claimed.sender);
  } catch (error) {
    // A transport error can occur after SMTP accepted the message. Never auto-retry
    // an ambiguous send: that would risk delivering the same email twice.
    const {
      rows: [failed],
    } = await db.query<EmailRow>(
      "UPDATE emails SET status='failed',error=$2 WHERE id=$1 AND status='sending' RETURNING *",
      [claimed.id, error instanceof Error ? error.message : String(error)],
    );
    if (failed) await indexEmail(failed);
    throw error;
  }
}

async function recoverInterrupted() {
  const { rows } = await db.query<EmailRow>(
    "UPDATE emails SET status='failed',error='Delivery interrupted; outcome uncertain. Not retried automatically.' WHERE status='sending' AND (sending_started_at IS NULL OR sending_started_at<now()-interval '2 minutes') RETURNING *",
  );
  await Promise.all(rows.map(indexEmail));
}

async function main() {
  await recoverInterrupted();
  await reconcileScheduled();
  const worker = new Worker<EmailJob>("email-send", processEmail, {
    connection,
    concurrency: config.concurrency,
  });
  worker.on("ready", () =>
    console.log(`Worker ready (concurrency ${config.concurrency})`),
  );
  worker.on("failed", (job, error) =>
    console.error("Email job failed:", job?.id, error),
  );
  setTimeout(() => recoverInterrupted().catch(console.error), 130000).unref();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
