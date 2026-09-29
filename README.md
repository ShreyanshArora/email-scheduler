# Outbox Labs · Email Scheduler

Express + TypeScript, React + TypeScript, PostgreSQL, Redis/BullMQ, Elasticsearch and Ethereal SMTP. The UI follows the supplied ONB Figma: login, Scheduled/Sent inbox, full-page compose, Send Later popover, and message detail. Custom CSS implements the design and responsive layouts.

## Start locally

Use Node.js 22+ and Docker Desktop.

```sh
npm install
cp apps/api/.env.example apps/api/.env  # only on first setup; preserve existing credentials
# Fill the OAuth, SMTP, and session values in apps/api/.env.
docker compose up -d
npm run db:migrate
npm run demo:seed
npm run dev
```

Open http://localhost:5173. Local demo login:

- Email: `demo-ui-check@example.test`
- Password: `TemporaryDemo!2026`

`demo:seed` is explicit, development-only, and refuses a remote database or `NODE_ENV=production`. It resets this one local demo account's password. It is never run by production startup. Create your own account with email/password or use Google login.

`npm run dev` starts the API on 4000, a separate worker, and Vite on 5173. For individual processes: `npm run dev -w @reachinbox/api`, `npm run worker -w @reachinbox/api`, and `npm run dev -w @reachinbox/web`.

## See a populated demo

With the API and worker running:

```sh
npm run demo:populate
```

This creates 53 real scheduled Ethereal test emails in the demo account: 15 welcome messages, 8 sales follow-ups with a limit of 3 per hour, and 30 messages for tomorrow. Calls are idempotent, so rerunning does not duplicate campaigns. The worker sends gradually and defers excess sales emails to the next UTC hour. The demo uses `example.test` recipients and configured From aliases.

Files for manual testing:

- [demo-leads.csv](demo-leads.csv): 7 unique recipients.
- [demo-leads-30.csv](demo-leads-30.csv): 30 unique recipients.
- [demo-attachment.txt](demo-attachment.txt): harmless attachment.

Ethereal is fake SMTP: it does **not** deliver to Gmail or other real inboxes. Open a Sent message and follow **Open Ethereal email preview** to inspect the actual SMTP message and attachments.

## Dashboard behavior

- Add a recipient and press **Enter**, comma, or Tab. It becomes a removable chip; keep adding more. Enter in this field never sends the form. CSV/text upload deduplicates addresses and displays the detected count.
- **Upload List** imports leads. The **paperclip** adds actual email attachments. Both accept up to 5 MB; email attachments have a combined 5 MB limit and a maximum of 20 files. The API validates decoded bytes, and Nginx permits the base64 request overhead.
- The rich-text editor supports undo/redo, font size, bold/italic/underline, alignment, lists, indent/outdent, quote and strikethrough. HTML is sanitized server-side and sent with a plain-text alternative.
- **Send** queues now. The clock opens **Send Later**; choose a future time, click **Done**, then **Send Later**. A successful submission shows Scheduled with confirmation, then rows move to Sent as delivery completes. Lists refresh every two seconds.
- The **filter icon** opens All emails, Scheduled, Sent, Archived and Trash, plus an optional Starred-only checkbox. It is not a star toggle. All emails includes archived mail and excludes Trash; Trash is a separate recoverable view.
- Message detail has Star, Archive/Unarchive, Trash/Restore, the user avatar, sender/recipient details, sanitized body, attachment download and delivery preview.
- Trashing a pending message cancels its delivery. Restoring it resumes pending delivery (immediately if overdue). Already-sent messages are never resent by restore. A message already in SMTP delivery cannot be cancelled mid-send.
- Archive only organizes the mailbox; an archived scheduled email still sends. Search and pagination work within the selected mailbox. Counts come from SQL aggregates and are not limited by page size.
- Slack connection, Google account linking, queue dashboard and Logout live in the account menu. Logout clears the session and mailbox UI state.

## Environment and OAuth

The existing local `apps/api/.env` is ignored by Git. Never commit secrets.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL` | Persistent backing services |
| `SESSION_SECRET`, `WEB_URL` | Session signing and frontend origin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Real Google OAuth |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_CALLBACK_URL` | Real Slack OAuth with incoming webhook |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Ethereal mailbox credentials |
| `SMTP_SENDERS` | Comma-separated From aliases using the default Ethereal account |
| `SMTP_ACCOUNTS_JSON` | Optional per-sender credentials, e.g. `{"sales@example.test":{"user":"…","pass":"…"}}` |
| `WORKER_CONCURRENCY` | Parallel jobs per worker, default 5 |
| `MIN_SEND_DELAY_MS` | Minimum global gap between SMTP starts, default 2000 ms |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-tenant/sender hourly ceiling, default 200 |

For Google, register a Web OAuth client with `http://localhost:4000/auth/google/callback`. Login uses a real authorization code and verified ID token. An existing password account must explicitly sign in before linking Google.

For Slack, add **and save** `http://localhost:4000/auth/slack/callback` under the same app's **OAuth & Permissions → Redirect URLs**. A generic `https://ngrok-free.app/slack/oauth_redirect` is not equivalent. The app's client ID must match the credentials in `.env`. Add the `incoming-webhook` scope. Connect Slack lets the user pick a workspace/channel; the backend stores its returned webhook and makes a real HTTP POST when the hourly limit is reached. Disconnect clears the connection; reconnect takes effect without redeploying. No connected Slack means no notification and no crash.

After editing environment values, restart the API and worker. A Slack `redirect_uri` mismatch is a provider app configuration error; changing a frontend button cannot register the callback with Slack.

## Scheduling, persistence and rate limits

```text
Compose → Express → PostgreSQL campaign + email rows → BullMQ delayed jobs in Redis
                                                     → worker → Ethereal SMTP
                                                              → DB state + Elasticsearch
```

Each request requires an `Idempotency-Key`. A database uniqueness constraint returns the existing campaign for repeated submissions. Email rows commit in one transaction. Attachments are stored once per campaign, not copied for every recipient.

Workers atomically claim a scheduled row before sending. Duplicate queue jobs cannot claim an already-sending/sent row. Redis AOF and named PostgreSQL/Redis volumes survive restarts. Startup reconciliation and a 30-second recovery check repair committed emails whose Redis jobs are missing. That timer performs recovery only; delivery times are persisted BullMQ delayed jobs. There is no cron or cron library.

Failures before SMTP begins can safely return to Scheduled and be reconciled. A crash or error after SMTP begins can have an ambiguous outcome; such messages are not automatically resent, to avoid duplicates. Orphaned in-flight rows are marked Failed after their BullMQ job is no longer active. SMTP has no provider idempotency key, so exactly-once delivery at the SMTP acknowledgement crash boundary cannot be guaranteed.

An atomic Redis Lua counter is keyed by tenant, sender and UTC hour, shared across worker instances. Compose may choose a lower hourly limit. When exhausted, work stays scheduled for the next hour instead of failing. A second Lua reservation spaces SMTP starts globally. Worker concurrency is configurable. Initial campaign times also incorporate the chosen per-email delay; after congestion, the global minimum gap remains enforced. The order of equally due jobs can vary across workers.

For 1,000+ simultaneous emails, BullMQ retains all jobs while concurrency, spacing and hourly counters pace delivery. No in-memory counter decides the hourly limit. Failed mail remains visible in Sent. Elasticsearch indexes scheduled and completed rows; PostgreSQL text matching provides a fallback during indexing lag/outages.

Slack alerts are deduplicated per tenant/sender/hour. Webhook HTTP failure releases the deduplication marker so a later limit hit can retry. The webhook call has a ten-second timeout.

## Automated verification

```sh
npm run build
npm run smoke
npm run verify:full
```

`smoke` verifies email/password login, invalid-password rejection, Google/Slack authorization redirects, authenticated API access, idempotency, delayed scheduling, actual Elasticsearch documents, actual Ethereal delivery, hourly deferral and one outbound HTTP webhook POST to a local receiver.

`verify:full` verifies 5 MB boundary handling, archive/trash/restore, attachment download, tenant isolation, real HTML/attachment SMTP delivery, global spacing, duplicate-job protection, 1,000 queued jobs, pagination, counts, Slack disconnect and logout. It creates and removes a disposable test tenant and its jobs. It writes [verification-results.json](verification-results.json).

To include the controlled two-worker restart and automatic queue-repair tests, explicitly pass the PID of the sole local worker:

```sh
RESTART_WORKER_PID=<local-worker-pid> npm run verify:full
```

That mode replaces the specified worker with two temporary workers, restarts them before a future message is due, verifies one delivery, and leaves one replacement worker running. Its PID is saved to `/tmp/outbox-worker.pid`. Do not use this option against a shared or production service.

Google account consent and a **real Slack workspace notification** require the user's actual provider authorization. Redirect tests and a local webhook receiver do not substitute for that final provider check. See [VERIFICATION.md](VERIFICATION.md) for the checked and pending items.

## Deploy all services together

The YAML files run on the deployment server; they are not uploaded to a frontend-only host. A VPS with Docker Compose can host this entire stack. Use a machine with enough memory for Elasticsearch (4 GB RAM or more is a practical starting point), a domain pointing to its IP, and inbound ports 80/443.

1. Copy the repository to the server, and `.env.production.example` to `.env.production`.
2. Fill every production credential, a URL-safe strong `POSTGRES_PASSWORD`, a random `SESSION_SECRET` of at least 32 characters, and `PUBLIC_URL=https://your-domain`.
3. Register `https://your-domain/auth/google/callback` and `https://your-domain/auth/slack/callback` in the provider apps. Add the domain to Google authorized origins if required by your provider setup.
4. Run `npm run check:deploy` locally against that private env file if Node is available. It checks missing placeholders without printing secrets.
5. On the server run:

```sh
docker compose --env-file .env.production -f compose.production.yml --profile https up --build -d
docker compose --env-file .env.production -f compose.production.yml --profile https ps
```

This builds and runs PostgreSQL, Redis, Elasticsearch, the migration, API, worker, Nginx frontend and Caddy HTTPS proxy. Caddy obtains TLS certificates for the real domain. Migration completes before API/worker startup. Database, Redis, Elasticsearch and certificate data use named volumes. PostgreSQL/Redis/Elasticsearch ports are not public in this production configuration.

If your hosting platform already supplies HTTPS, omit `--profile https` and route its proxy to the web service. The host's port 8080 is bound to loopback for a local reverse proxy. API and worker must be long-lived processes; a frontend-only or request-only serverless deployment will not run persistent BullMQ workers.

Useful operations:

```sh
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 api worker
docker compose --env-file .env.production -f compose.production.yml restart api worker
```

Back up PostgreSQL and the volumes before upgrades. Do not run `down -v` on a deployment whose mail history you want to keep. Visit `/health`, sign in, schedule an Ethereal test, inspect its preview, connect Slack, and test the live alert before sharing a deployment URL.

## API reference

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | Password accounts and session lifecycle |
| `GET /auth/google`, `/auth/google/callback` | Google OAuth |
| `GET /auth/slack`, `/auth/slack/callback` | Slack OAuth |
| `POST /api/slack/disconnect` | Disconnect Slack |
| `GET /api/me`, `/api/settings`, `/api/email-counts` | Profile, defaults, uncapped folder counts |
| `POST /api/emails/schedule` | Schedule recipients with body/HTML, attachments, sender, time, gap and limit |
| `GET /api/emails?mailbox=all&status=sent&q=term&offset=0` | Search/filter and 100-row pagination |
| `PATCH /api/emails/:id/star` | Set `{starred:true/false}` |
| `PATCH /api/emails/:id/mailbox` | Set `{mailbox:"inbox"/"archived"/"trash"}` |
| `GET /api/emails/:id/attachments/:index` | Authenticated attachment download |
| `GET /admin/queues` | Session-protected live BullMQ board (production administrator allowlist) |

## Scope and remaining production trade-offs

This is an outgoing email scheduler, as required by the assignment. It does not ingest real incoming mail. Slack webhook credentials are stored in PostgreSQL; encrypting them with a managed key is recommended before multi-tenant public production use. The operations dashboard is restricted by `QUEUE_ADMIN_EMAILS` in production. Elasticsearch indexing failure falls back to SQL search; a durable search-index outbox would strengthen eventual reindexing guarantees. The design uses responsive equivalents on small screens instead of scaling a desktop frame down with browser zoom.

The assignment's private GitHub repository, collaborator invitations, demo recording and submission form are separate submission steps. Do not submit until the real Google and Slack provider flows and the deployed domain have been verified.

## Latest testing and delivery guide

See [TESTING.md](TESTING.md) for the CSV walkthrough, [VERIFICATION.md](VERIFICATION.md) for exact evidence and outstanding provider checks, and [deploy/OPERATIONS.md](deploy/OPERATIONS.md) for AWS preparation, GitHub Actions secrets and backups. CI runs on main pushes; deployment is manual through Actions. Worker containers have a 120-second shutdown grace period. `npm run verify:worker` tests early-fire recovery and active-send shutdown when passed the sole local worker PID via `RESTART_WORKER_PID`.
