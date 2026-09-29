# Verification record

Local verification performed September 30, 2026 (Asia/Kolkata). Machine-readable results are in `verification-results.json`, `worker-lifecycle-verification.json`, and `container-verification.json`. Container verification predates the latest small UI/worker changes; rerun it before final production release.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Express/TypeScript API and React UI | npm run build | Passed |
| Email/password authentication | smoke and full-check | Passed, including invalid password and logout |
| Google OAuth | Real authorization redirect tested | Consent/account login requires user completion |
| Persistent delayed BullMQ jobs | full-check and container-check | Passed; no cron delivery scheduler |
| Real Ethereal delivery | smoke, full-check, worker lifecycle | Passed with SMTP previews |
| Multiple sender limits | smoke and populated demo | Passed |
| Redis hourly counters and deferral | smoke | Passed |
| Global minimum spacing | full-check | Passed |
| Idempotency | smoke and duplicate-job test | Passed |
| 1,000 scheduled emails | full-check | Persisted and paginated; no 1,000-message SMTP blast claimed |
| Restart before due time | previous full-check/container-check | Passed |
| SIGTERM during SMTP | worker lifecycle | Drained, persisted sent, not resent |
| Queue waking before DB due time | worker lifecycle | Delayed again, delivered once when due |
| Elasticsearch scheduled/sent documents | smoke | Passed |
| Slack connect/disconnect | Authorization redirect and disconnect tested | Actual Slack workspace authorization pending |
| Slack notification | smoke uses a local HTTP webhook receiver | Exactly one real HTTP POST; not proof of a real Slack channel message |
| Attachments | full-check | 5 MiB accepted; one byte over rejected; actual SMTP and downloads passed |
| Archive, Trash, restore, star | full-check and browser | Passed; pending Trash items do not send |
| Tenant isolation | full-check | Cross-tenant access rejected |
| Compose recipients | Browser | Consecutive Enter-added recipients, CSV, rich text and Send tested |
| Figma | Browser and supplied screenshots | Layout, login, menus, compose and detail reviewed; no pixel-diff certification claimed |
| Production Compose | container-check | Built and sent real Ethereal mail; secure cookies and restart tested |
| Cloud deployment | Deferred by user | Not performed |
| GitHub Actions | Added; local build/Compose checks passed | Hosted workflow result must be checked after push |

## Repeat tests

Start the local API, worker, PostgreSQL, Redis and Elasticsearch, then run `npm run smoke` and `npm run verify:full`. These create and remove disposable test tenants. `npm run verify:containers` uses an isolated Compose project and removes only its own volumes.

To test worker lifecycle, identify the sole local worker PID and run `RESTART_WORKER_PID=<pid> npm run verify:worker`. This intentionally stops that worker, verifies early execution and in-flight shutdown, and leaves one replacement worker. Its PID is written to `/tmp/outbox-worker.pid`. Do not run against production or while another test owns the worker lifecycle.

## Honest limitations

Ethereal is a fake SMTP inbox; recipients do not receive real mail. SMTP and the relational database do not share a transaction, so no implementation can promise exactly-once delivery through every ambiguous provider/network failure. This app avoids automatic resend after an uncertain SMTP attempt and records a failure for inspection. Configured delays represent minimum pacing under normal worker operation, not an exact delivery-time SLA. Deferred jobs preserve approximate order, not a strict global order across workers.

Google consent, a real Slack channel alert, public HTTPS and hosted CI deployment remain external verification steps. No test of a local stand-in is presented as a successful provider OAuth flow.
