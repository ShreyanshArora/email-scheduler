# ReachInbox Scheduler demo — 4 minutes 30 seconds

Use the local app at http://localhost:5173/ for the restart demonstration. Start the recording with the local demo runner already running, Docker Desktop running, Google login available, and your Slack channel in another tab. Keep `demo-leads-with-duplicates.csv`, `demo-leads.csv`, the README, and the queue dashboard ready. Do not show passwords, `.env` files, OAuth codes, or webhook URLs.

Choose a scheduled time about **2 minutes after clicking Send Later**. Stop the local runner **before** that time, and restart it **just after** the time has passed. Do not hard-code 8:02; use the clock at recording time. PostgreSQL and Redis must remain running. The hosted AWS app is separate from the local process and will not stop when you press Ctrl+C.

## 0:00–0:25 — Sign in and overview

Show the login page and use Login with Google. Say: “This is ReachInbox Scheduler, a full-stack email scheduling app. I can sign in with Google or email and password. The sidebar shows my Scheduled and Sent messages, and each account has its own mail history.” Open the profile menu and point to the optional Slack connection, the read-only Queue dashboard, and Log out. Do not sign out.

## 0:25–1:25 — Compose and schedule

Open Compose. Upload `demo-leads-with-duplicates.csv` (five rows, **three unique recipients**, two duplicates removed). Show that a second address can also be typed and accepted with Enter, but remove it before sending if you want the three-row demonstration. Choose a single sender with available hourly quota. Keep the delay at **2 seconds** and the hourly limit at **200**.

Subject: **ReachInbox Scheduler | Product walkthrough**

Body:

> Hello team,
>
> I’m sharing a brief demonstration of the ReachInbox email scheduler. This message was imported from a CSV lead list, scheduled for future delivery, and processed by a persistent BullMQ worker.
>
> Best regards,  
> Shreyansh Arora

Select a few words and click Italic. Say: “The composer supports rich text, multiple recipients, CSV deduplication, and attachments up to five megabytes. Send starts the queue now; the clock schedules a future start.” Click the clock, choose a date/time **about 2 minutes ahead**, click Done, and then click **Send Later**. Show the three messages under Scheduled with their timestamps. Note the actual due time aloud.

## 1:25–2:00 — Inspect while running

Open the Queue dashboard in a new tab. Say: “BullMQ stores delayed jobs in Redis, while PostgreSQL stores the campaign and email records. The queue dashboard is read-only and shows jobs moving between delayed, active, and completed.” Return to Scheduled. Show search, multi-select filters, and Clear filters. Open a prior sent email and show recipient details, Star, Archive, Trash, and Open in Ethereal if a preview is available.

## 2:00–3:35 — Prove restart persistence

**Before the due time**, switch to the Terminal running `npm run demo:run` and press **Ctrl+C** once. Wait for the process to stop. Say: “I have stopped the frontend, API, and worker, but PostgreSQL and Redis remain running. The scheduled messages are persisted, so nothing is lost.”

While waiting for the due time, show the README architecture and the private GitHub repository. Say: “There is no cron polling for delivery. BullMQ holds delayed jobs, the worker has concurrency five, and Redis counters enforce the per-sender hourly limit. On startup, reconciliation repairs any missing jobs.”

**After the due time**, press **Up arrow, Enter** in that same Terminal. Wait for “Worker ready.” Refresh the local browser, open Sent, and show the three messages. Open one and choose Open in Ethereal. Say: “The worker resumed after the due time, and the messages were sent once. Ethereal captures SMTP previews; these example recipients do not receive real inbox mail.”

## 3:35–4:10 — Rate limit and Slack

If a live Slack alert is important, choose a **different single sender** that has not already triggered an alert this UTC hour. Compose to `demo-leads.csv` (seven recipients), set hourly limit to **2** and delay to **2 seconds**, and click **Send**. Say: “Two messages can send during this hour. The remaining five are deferred to the next hour rather than dropped. When Slack is connected, the worker posts one rate-limit alert for this sender and hour.” Show the Sent/Scheduled counts and your Slack channel. If an alert already exists for that sender/hour, show it and say that duplicate alerts are intentionally suppressed; do not claim a new alert was sent.

## 4:10–4:30 — Deployment and finish

Show the hosted link and README. Say: “The same stack is deployed on AWS EC2 with Docker Compose, persistent Postgres and Redis volumes, and HTTPS. GitHub Actions builds the project, and deployment uses an AWS Systems Manager workflow. The README covers local and production setup, Ethereal, persistence, concurrency, rate limiting, and trade-offs. Thank you.”

## Terminal controls

- Stop local app, API, and worker: **Ctrl+C** in the demo runner Terminal.
- Restart in the same Terminal: **Up arrow, Enter**. If the previous command is not in history: `cd /Users/shreyansh/Desktop/Developer/sde-outbox && npm run demo:run`.
- Never run `docker compose down -v` during this demonstration; it deletes persisted volumes.

## Submission links

- Repository: https://github.com/ShreyanshArora/outbox-sde-
- Hosted app: https://65-2-236-100.sslip.io/
- README: https://github.com/ShreyanshArora/outbox-sde-/blob/main/README.md
- Upload the recorded video to Loom or Google Drive and make it viewable by reviewers before placing its URL in the form.
