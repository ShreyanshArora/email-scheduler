# Assignment demo video (target: 4 minutes 30 seconds)

Record only after the local app is healthy and Google and Slack have been connected in your own browser. Keep credentials, OAuth URLs containing `code` or `state`, `.env` files, and webhook URLs out of the recording. Ethereal previews are fake SMTP captures; messages do not reach the example.test recipients.

| Time | Screen and narration |
| --- | --- |
| 0:00–0:35 | Show the Figma-inspired login, sign in with Google, and point out the account name, email, avatar and Logout in the profile menu. If Google consent cannot be completed, use the real email/password login and state clearly that Google is unverified. |
| 0:35–1:15 | Show Scheduled and Sent, the search bar and filter menu. Open a sent message; expand recipient details, show archive/star/Trash controls and the Ethereal preview. |
| 1:15–2:05 | Click Compose. Upload `demo-leads.csv` (seven distinct addresses); show the count. Type one additional address and press Enter. Add a subject, body, optionally a small attachment, set a short delay and an hourly limit. Explain that the attachment cap is 5 MB. |
| 2:05–2:35 | Use the clock → choose a time a few minutes ahead → Done → Send Later. Show the new rows in Scheduled and Bull Board at `/admin/queues`. |
| 2:35–3:10 | Compose a separate one-recipient message and press Send. The worker processes it now; it may briefly appear under Scheduled. Show it moving to Sent and open its Ethereal preview. |
| 3:10–3:50 | With a future job still queued, stop only the worker, then restart it. Show that the job remains scheduled in the database and Bull Board and sends once when due. Have the restart commands ready before recording. Never use `docker compose down -v`. |
| 3:50–4:20 | If Slack is connected, use a sender with available hourly quota, schedule more recipients than a low hourly limit, and show one real Slack channel alert plus deferred rows. If Slack authorization is blocked, say so and show the local HTTP webhook test result as a test, without calling it a real Slack alert. |
| 4:20–4:30 | Show the private GitHub repository, README and passing CI run. Mention Postgres persistence, Redis/BullMQ delayed jobs, Elasticsearch search and Ethereal delivery. |

## Recording notes

Prepare the queue and provider logins beforehand; waiting for OAuth, Docker builds or a full hourly rollover wastes the five-minute limit. The demo account and CSVs are for local development. Reviewer invitations must be accepted for a private repository to be visible to them. The assignment form needs the repository and video links and must be submitted by the candidate.

For local worker restart, get the sole worker PID from `/tmp/outbox-worker.pid`, stop it with `kill -TERM <pid>`, then run `npm run worker -w @reachinbox/api` in a terminal. The worker has graceful shutdown and the startup reconciliation restores missing Redis jobs. Stop any extra worker instances before this demonstration so the expected pause is visible.
