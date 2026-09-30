# Verification record

Local verification performed September 30, 2026 (Asia/Kolkata). Machine-readable results are in `verification-results.json`, `worker-lifecycle-verification.json`, and `container-verification.json`. The production containers were rebuilt and checked again after the UI/worker fixes, including required SMTP TLS.

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
| Slack connect/disconnect | Saved OAuth connection, redirect and disconnect tested | Connected to the user-selected channel |
| Slack notification | Live local worker rate-limit test, saved OAuth webhook for #all-outbox | Slack returned successful acknowledgement; worker logged alert delivered |
| Attachments | full-check | 5 MiB accepted; one byte over rejected; actual SMTP and downloads passed |
| Archive, Trash, restore, star | full-check and browser | Passed; pending Trash items do not send |
| Tenant isolation | full-check | Cross-tenant access rejected |
| Compose recipients | Browser | Consecutive Enter-added recipients, CSV, rich text and Send tested |
| Figma | Browser and supplied screenshots | Layout, login, menus, compose and detail reviewed; no pixel-diff certification claimed |
| Production Compose | container-check | Built and sent real Ethereal mail; secure cookies and restart tested |
| Cloud deployment | AWS EC2, Docker Compose, internal frontend/API health | Deployed successfully; health returned ok |
| GitHub Actions | CI and Deploy runs for 00d2388 | Both passed; deploy run 36722954576 |

## Repeat tests

Start the local API, worker, PostgreSQL, Redis and Elasticsearch, then run `npm run smoke` and `npm run verify:full`. These create and remove disposable test tenants. `npm run verify:containers` uses an isolated Compose project and removes only its own volumes.

To test worker lifecycle, identify the sole local worker PID and run `RESTART_WORKER_PID=<pid> npm run verify:worker`. This intentionally stops that worker, verifies early execution and in-flight shutdown, and leaves one replacement worker. Its PID is written to `/tmp/outbox-worker.pid`. Do not run against production or while another test owns the worker lifecycle.

## Honest limitations

Ethereal is a fake SMTP inbox; recipients do not receive real mail. SMTP and the relational database do not share a transaction, so no implementation can promise exactly-once delivery through every ambiguous provider/network failure. This app avoids automatic resend after an uncertain SMTP attempt and records a failure for inspection. Configured delays represent minimum pacing under normal worker operation, not an exact delivery-time SLA. Deferred jobs preserve approximate order, not a strict global order across workers.

The full Google consent/account chooser was not automated in this final pass. Verified-email linking is covered by a database integration test. Public browser verification of the deployed hostname was unavailable to the automation; server-side deployment and internal health checks passed.

## Final regression pass

- UI-created future email: scheduled at 19:07 IST, worker stopped before due time, still Scheduled with zero send attempts at 19:07:11, delivered at 19:07:16 after worker restart with exactly one attempt.
- Italic toolbar generated `<i>` markup, rendered italic, and retained that markup in the saved email.
- Multi-select Scheduled + Sent and Clear filters verified in the browser.
- CSV fixture reported 3 unique addresses and 2 duplicate addresses removed.
- `npm run build`, `npm run smoke`, `npm run verify:full`, and worker lifecycle tests passed in this pass.
- The initial failed release exposed stale Nginx upstream resolution. Docker DNS refresh and proxy recreation were added; the subsequent deployment passed.

The final account check found Slack connected locally but not on the deployed account. The owner must complete Connect Slack on the hosted app; the local webhook test does not prove a production account connection.

The complete API/worker/frontend demo runner was also stopped and restarted: the 19:15:36 IST job delivered at 19:15:48 with one SMTP attempt. See `final-restart-verification.json`. `demo:stop` and graceful Ctrl+C both passed.
