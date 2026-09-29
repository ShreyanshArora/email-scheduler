# ReachInbox Email Scheduler

A full-stack email scheduler using TypeScript, Express, PostgreSQL, Redis/BullMQ, Ethereal SMTP, Elasticsearch, and a React dashboard.

## Run it

1. Copy `apps/api/.env.example` to `apps/api/.env` and configure the integrations.
2. Start infrastructure: `docker compose up -d`
3. Install dependencies: `npm install`
4. Create the tables: `npm run db:migrate`
5. Start API, worker, and UI: `npm run dev`

Visit `http://localhost:5173`. The live BullMQ dashboard is at `http://localhost:4000/admin/queues`.

For production, run API instances (`npm run start -w @reachinbox/api`) separately from workers (`npm run worker -w @reachinbox/api`). The API starts one worker in development for a one-command demo.

## Integrations

Create a free Ethereal mailbox at [ethereal.email](https://ethereal.email) and put its credentials in `SMTP_USER` / `SMTP_PASS`.

For real Google login, create a Google Cloud Web OAuth client, add `http://localhost:4000/auth/google/callback` as a redirect URI, then configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`. There is intentionally no mock login.

For Slack, make an app with `chat:write`, add `http://localhost:4000/auth/slack/callback`, and configure its client values. **Connect Slack** invokes actual OAuth and stores the tenant’s token. When an hourly sender limit is hit the worker calls Slack `chat.postMessage`; an absent connection is simply skipped, and reconnecting updates the token without redeploying.

## Architecture

```
React dashboard → Express schedule API → PostgreSQL email row → BullMQ delayed job (Redis)
                                                               ↓
                                        Worker → Ethereal SMTP → PostgreSQL + Elasticsearch
```

Each recipient is persisted before a delayed BullMQ job is added. Job IDs use the durable email UUID, and the worker no-ops if an email is already sent, preventing duplicate delivery. Redis keeps BullMQ delayed jobs through API/worker restarts; when a worker returns, it processes jobs at their original due time. No cron or polling scheduler is used. BullMQ retry/backoff addresses transient SMTP failures.

## Throughput controls

- `WORKER_CONCURRENCY` controls BullMQ worker concurrency (default `5`).
- `MIN_SEND_DELAY_MS` is a global minimum gap between sends (default `2000`). An atomic Redis Lua reservation makes it apply across worker processes/instances.
- `MAX_EMAILS_PER_HOUR_PER_SENDER` defaults to `200`. An atomic Redis counter is keyed by sender and UTC-hour. On exhaustion the job is preserved and re-added as a delayed job for the next window; a Slack notification is sent once jobs encounter that limit.

This absorbs 1,000+ simultaneous schedules as Redis delayed jobs while paced delivery intentionally defers excess work. Ordering is approximate under parallel workers, a deliberate throughput trade-off. Elasticsearch indexes email creation/completion for search; PostgreSQL `ILIKE` is the safe fallback if ES is temporarily down.

## API

- `POST /api/emails/schedule` — `{ recipients, subject, body, sender, startsAt, delayMs }`
- `GET /api/emails?status=scheduled|sent|failed&q=...`
- `GET /api/me`, `POST /auth/logout`, `GET /auth/google`, `GET /auth/slack`

## Demo sequence

Schedule a CSV a minute in the future, see it under Scheduled, restart the API process, then see it move to Sent without resubmission. For rate limiting, set the hourly maximum to `2`, schedule three recipients using the same sender, and connect Slack before the third job runs.

## Trade-offs

The compact assignment uses deterministic job IDs rather than a transactional outbox for the database-to-Redis boundary; a production deployment would include outbox reconciliation. Slack posts to `#general` because a channel picker would need an additional scope and UI; production should store a user-selected channel ID.
