# ReachInbox Email Scheduler

An Express/TypeScript API and React dashboard for scheduling fake SMTP email through BullMQ. PostgreSQL holds email state, Redis holds delayed jobs and sessions, and Elasticsearch indexes emails for search. The dashboard follows the supplied Outbox Labs Figma's inbox, sidebar, and compose layouts.

## Run locally

Requirements: Node.js 22+ and Docker Desktop. Google OAuth and Slack OAuth need their own app credentials for those optional sign-in/notification flows. Email/password sign-in works locally without either OAuth app.

1. Copy `apps/api/.env.example` to `apps/api/.env` and fill the credentials below. Use a random 32-byte `SESSION_SECRET`.
2. `docker compose up -d` starts PostgreSQL, Redis, and Elasticsearch. Redis uses append-only persistence.
3. `npm install`
4. `npm run db:migrate`
5. `npm run dev` starts the API, a separate BullMQ worker, and Vite.

Open [the dashboard](http://localhost:5173). Create an account with email/password or sign in with Google. For a reproducible local demo, run `npm run demo:seed` and use **demo-ui-check@example.test** / **TemporaryDemo!2026**. The seed command only accepts a local database and refuses production; rerun it after resetting the database. After signing in, [the live BullMQ board](http://localhost:4000/admin/queues) shows waiting, delayed, active, completed, and failed jobs. The board uses the same login session. `GET /health` checks PostgreSQL and Redis.

For separate processes, use `npm run start -w @reachinbox/api` after `npm run build`, `npm run worker -w @reachinbox/api`, and `npm run dev -w @reachinbox/web`. Keep the worker running to send due jobs.

## Deploy with Docker Compose

Copy [`.env.production.example`](.env.production.example) to `.env.production` and replace every placeholder with production values. Use a URL-safe strong `POSTGRES_PASSWORD`, a unique random `SESSION_SECRET`, a real `PUBLIC_URL` such as `https://outbox.example.com`, and Ethereal credentials. Register `${PUBLIC_URL}/auth/google/callback` and `${PUBLIC_URL}/auth/slack/callback` in the corresponding OAuth apps. Put an HTTPS reverse proxy in front of port `WEB_PORT` (default 8080); the application uses secure cookies in production. The production Compose file keeps PostgreSQL, Redis, and Elasticsearch on its private Docker network and persists their data in volumes.

Run:

```sh
docker compose --env-file .env.production -f compose.production.yml up --build -d
docker compose --env-file .env.production -f compose.production.yml ps
```

The one-shot migration runs before the API and worker. Nginx serves the built React app and forwards `/api`, `/auth`, `/admin`, and `/health` to Express. Test `https://outbox.example.com/health`, then create an account and run the manual walkthrough below. On any hosting platform, deploy the API and worker as separate long-lived processes using the same PostgreSQL and Redis instances. Do not scale the migration service as a worker.

## Credentials and senders

- **Email/password:** The login card also has a create-account link. Passwords are salted and hashed with scrypt; sessions are held in Redis. To link Google to an existing password account, sign in with the password first and choose **Connect Google** from the account menu. Google cannot silently take over an existing password account with the same email.
- **Google:** Create a Web OAuth client and register `http://localhost:4000/auth/google/callback`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`. Login uses Google's real authorization code and verified ID token. There is no mock login.
- **Ethereal:** Create a mailbox at [ethereal.email](https://ethereal.email). Set `SMTP_USER` and `SMTP_PASS`; this account can send fake test mail with different From addresses. For distinct Ethereal credentials per sender, set `SMTP_ACCOUNTS_JSON` to a JSON object keyed by lowercase sender address, for example `{"sales@example.test":{"user":"mailbox@ethereal.email","pass":"..."}}`. Ethereal never delivers to a real recipient inbox. Once Sent, open the message and click **Open Ethereal email preview** to verify its contents.
- **Slack:** Create a Slack app with the `incoming-webhook` OAuth scope, register `http://localhost:4000/auth/slack/callback`, and set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_CALLBACK_URL`. The user selects a channel during **Connect Slack**. The backend stores that workspace's webhook per user and POSTs to it when the sender's hourly limit is reached. Disconnect clears the stored connection; reconnecting takes effect without a restart. No connection means no notification and no send failure.

The local `.env` is ignored by Git. Do not commit OAuth secrets, Ethereal passwords, session secrets, or Slack webhooks.

## How scheduling works

```text
React compose → Express → PostgreSQL campaign + email rows → BullMQ delayed jobs in Redis
                                                           → worker → Ethereal SMTP
                                                                    → PostgreSQL state + Elasticsearch index
```

One row and one delayed job are created for each recipient. The API requires an `Idempotency-Key`; repeating the same request returns the existing campaign. The database transaction commits the campaign and rows together. If a process stops between that commit and queue insertion, worker startup reconciles missing jobs from PostgreSQL. Redis AOF and PostgreSQL volumes preserve data across service restarts. There is no cron job.

The worker atomically claims a scheduled row before sending. A second worker cannot claim that row, so duplicate queue jobs do not duplicate delivery. If a worker stops during SMTP, the result is ambiguous: after two minutes the row is marked failed and is **not automatically retried**. This favors no duplicate delivery over guaranteed delivery. Ethereal SMTP offers no provider-side idempotency key, so exactly-once delivery through a crash at the SMTP acknowledgment boundary cannot be guaranteed. Failed rows remain visible for manual investigation.

Elasticsearch indexes scheduled and completed email documents. Search queries Elasticsearch and also matches PostgreSQL text, so recently committed or temporarily unindexed rows remain discoverable. The search UI limits results to 500 rows per request.

## Throughput and limits

- `WORKER_CONCURRENCY` controls parallel BullMQ jobs (default 5).
- `MIN_SEND_DELAY_MS` reserves global send slots through atomic Redis Lua (default 2000 ms between starts of SMTP sends across all workers).
- `MAX_EMAILS_PER_HOUR_PER_SENDER` is the upper bound (default 200). Compose can choose a lower limit. A Redis counter is keyed by tenant, sender, and UTC hour; its atomic reservation is shared by all worker instances.
- On limit exhaustion, the email stays scheduled and gets a delayed job for the next UTC hour. The scheduled time shown in the UI updates. Reaching the configured limit posts once per tenant/sender/hour to the connected Slack webhook; an excess job can also trigger the alert if it races ahead of the last successful send.

For 1,000+ emails due together, BullMQ retains all jobs while worker concurrency, global send spacing, and hourly counters pace delivery. Parallel workers may change the exact order of emails due at the same time. Delayed and rate-limited jobs are not dropped.

## API and UI

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/register`, `POST /auth/login` | Real email/password account creation and login |
| `GET /auth/google`, `GET /auth/google/callback` | Google OAuth login |
| `POST /auth/logout` | Destroy Redis-backed login session |
| `GET /auth/slack`, `GET /auth/slack/callback` | Slack OAuth connection |
| `POST /api/slack/disconnect` | Remove Slack connection |
| `GET /api/me`, `GET /api/settings` | User profile and compose defaults |
| `POST /api/emails/schedule` | Schedule `{recipients,subject,body,sender,startsAt,delayMs,hourlyLimit}` with `Idempotency-Key` |
| `GET /api/emails?status=scheduled,sending&q=term` | Scheduled, sent, or failed rows with search |
| `PATCH /api/emails/:id/star` | Toggle the message star |

The dashboard provides Google and email/password login, user name/email/avatar, logout, Scheduled and Sent views, a full-page compose form, CSV/text lead parsing and counts, immediate Send and Send Later, search/filter/refresh, full-page message detail with Ethereal preview, loading and empty states, error messages, and Slack connect/disconnect inside the account menu.

## Manual test walkthrough

1. Sign in with the local demo account above or create your own account on the login page. Open **Compose**.
2. Click **Upload List** or the paperclip and choose [`demo-leads.csv`](demo-leads.csv). The To row should show seven detected addresses: three chips and `+4`. These `.test` addresses are deliberately non-deliverable; Ethereal still accepts them for preview.
3. Enter a subject and body. Keep the configured sender in **From**, set delay to 2 seconds and hourly limit to 2. Click **Send** for an immediate campaign. New rows may briefly show under Scheduled while the worker sends. They move to Sent automatically (up to 2 seconds between UI refreshes). Open a Sent row and follow its Ethereal preview URL.
4. Compose again, choose **Send Later** via the clock, select a future date and time, click **Done**, then click **Send Later** at the top. The Scheduled view shows the first three rows' dates and times. With an hourly limit of 2, subsequent jobs move to the next UTC hour; no jobs are discarded.
5. For the restart test, schedule at least five minutes ahead, stop the worker process, restart it before the due time, and watch the Scheduled row move to Sent. Open the account card to connect Slack and choose a workspace channel. The first sender hourly-limit hit posts a real Slack webhook message. The same menu has Disconnect and Reconnect.

If a recipient says they received nothing, that is expected from fake SMTP. Check the message's **Ethereal email preview** link in Sent. A missing preview or Failed status indicates a sender credential/SMTP problem.

## Verification and demo

After services and the worker are running, `npm run smoke` creates a disposable test tenant/session, checks password login and Google/Slack OAuth authorization redirects, schedules Ethereal messages through the real API, checks idempotency and Elasticsearch indexing, verifies SMTP delivery, and confirms that the per-sender hourly limit defers an excess email and makes an outbound webhook POST. It deletes its own test data and queue jobs. Live Google consent and a real Slack workspace/channel must be tested with your own accounts.

For a restart demo, schedule a message several minutes in the future, stop only the worker, restart it before the due time, and show the email moving from Scheduled to Sent. The worker reconciles any committed rows lacking Redis jobs on startup. To demonstrate Slack, connect a workspace, set a low hourly limit, schedule more messages than the limit, and show the actual message in the selected Slack channel. Record these steps in a video of five minutes or less for submission.

## Trade-offs

The scheduling path uses startup reconciliation instead of a transactional outbox consumer. A queue insertion failure while the worker remains running requires a worker restart or another request with the same idempotency key to repair the row. SMTP ambiguity is never auto-retried. Slack webhook URLs are stored in PostgreSQL; a production deployment should encrypt them at rest and add webhook revocation and audit controls. The Figma shows an incoming-message detail and a rich-text toolbar; this scheduler has outgoing-message detail and plain-text email, with lightweight text-formatting shortcuts in compose. The paperclip uploads recipient lists, not arbitrary email attachments.
