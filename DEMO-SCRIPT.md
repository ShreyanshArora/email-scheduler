# Demo recording — target 4 minutes 20 seconds

## Prepare before pressing Record

1. Use **http://localhost:5173/** for the restart demonstration. Your local Terminal does not stop the AWS deployment.
2. Docker Desktop must stay running. Run `npm run build` once after updates, then `npm run demo:run` in Terminal. This starts the API, worker and frontend together. Do not run a second `npm run dev` or worker.
3. Sign in to your account with Slack connected. Connect Slack from the profile menu and choose the channel where you will show the alert. Keep that Slack channel open in another tab.
4. Keep `demo-leads-with-duplicates.csv` ready: five rows become **three unique recipients**, with **two duplicate addresses removed**. Keep `demo-leads.csv` ready for the seven-recipient rate-limit example.
5. In Compose, select **one sender**, not “All senders (rotate)”, for the rate-limit example. Use a sender that has not already reached its limit this UTC hour. Alerts are sent once per sender/hour. Repeating the same test in that hour deliberately does not create another alert.
6. Run `cd /Users/shreyansh/Desktop/Developer/sde-outbox && npm run demo:stop && npm run demo:run` once in your recording Terminal; the command will then be in history. **Ctrl+C** stops API + worker + frontend gracefully. **Up arrow, Enter** starts them again. Leave Docker running; never use `docker compose down -v`.
7. Keep the repository README, hosted URL and queue dashboard ready. Record at normal browser zoom.

## 0:00–0:30 — Introduction and architecture

Say: “Hi, I’m Shreyansh. This is my full-stack email scheduler for the ReachInbox assignment. The frontend uses React and TypeScript. The Express API stores campaigns and email history in PostgreSQL. BullMQ uses Redis for persistent delayed jobs, and a separate worker sends through Ethereal SMTP. Elasticsearch indexes the messages for search. There are no cron jobs.”

Show the login and dashboard. Say: “Users can sign in with Google or email and password. Each account has its own mail history and optional Slack connection.”

## 0:30–1:15 — Compose, CSV and future delivery

Open Compose. Upload `demo-leads-with-duplicates.csv`. Show the three recipients and duplicate notice. Use subject **Restart demonstration**. Type a short body, select a few words, and click Italic. Leave the hourly limit at **200**, with a **2-second** delay.

Say: “CSV addresses are normalized and deduplicated. I can also add recipients manually, format the message and attach files up to five megabytes. Send starts delivery now; the clock selects a future start time.”

Choose a time **one minute ahead** using the clock, click **Done**, then **Send Later**. Briefly show the Scheduled list and timestamp.

## 1:15–2:25 — Restart persistence

Switch to Terminal and press **Ctrl+C** once. Wait until it says the app has stopped. Leave it stopped until the scheduled time has passed. While waiting, show the README architecture or explain:

“The API has already committed the campaign to PostgreSQL, and Redis holds the delayed jobs. Stopping the application does not delete either store. The worker drains any active send before shutdown. If the scheduled time passes while the worker is offline, delivery resumes when it comes back. Messages already sent cannot be claimed again.”

At or just after the due time, press **Up arrow, Enter** in Terminal. Wait for **Worker ready**. Return to the browser, refresh if it shows a connection error, and open Sent. Show the three messages. Open one and click **Open in Ethereal**.

Say: “These messages survived the restart and were sent after recovery. Ethereal captures the actual SMTP messages; it does not deliver them to real recipients’ inboxes.”

## 2:25–3:15 — Rate limit and live Slack alert

Compose another message using `demo-leads.csv`. Choose a different, unused **single sender**, hourly limit **2**, and delay **2**. Click **Send**.

Say: “The worker has configurable concurrency. Atomic Redis counters enforce a limit shared across workers. When the sender reaches two messages this hour, the rest stay scheduled for the next UTC hour. They are not discarded or permanently failed.”

Show the sent/scheduled counts and the actual Slack alert in the connected channel. Say: “This is the live webhook notification from the worker. It is deduplicated once per sender per hour. Slack is optional: email scheduling still works without a connection.”

## 3:15–3:50 — Dashboard and queue

Show search, select Scheduled and Sent together in Filters, click Clear filters. Open a message and briefly show Star, Archive and Trash. Open Queue dashboard from the profile menu; it opens in a new tab.

Say: “The dashboard supports search, combined filters and recoverable organization. The live BullMQ board shows waiting, delayed, active and completed jobs. The API protects each user’s data, and production queue administration is restricted to configured administrators.”

## 3:50–4:20 — Deployment and close

Show the hosted app and the latest green GitHub Actions deployment. Show README headings for setup, architecture and trade-offs.

Say: “The complete stack runs on AWS EC2 using Docker Compose, persistent volumes and HTTPS through Caddy. GitHub Actions builds every push and has a manual deployment workflow using AWS identity federation. The README includes setup, environment variables, architecture and verification. SMTP and PostgreSQL cannot share one transaction, so an interrupted send with an uncertain provider outcome is marked for review instead of being automatically resent. Thank you.”

## Submission fields

- Repository: https://github.com/ShreyanshArora/outbox-sde-
- Hosted assignment: https://65-2-236-100.sslip.io/
- README: https://github.com/ShreyanshArora/outbox-sde-/blob/main/README.md
- Video: record this walkthrough, upload to Loom or Drive, enable reviewer viewing, then paste that video's URL. The script is not a video.
- Reviewer access: Mitrajit is a collaborator; Yadav036 was invited and was pending acceptance at the final check.

### Project description

A persistent full-stack email scheduler built with React, TypeScript, Express, PostgreSQL, Redis and BullMQ. It supports Google OAuth, CSV lead imports, rich-text emails, attachments, delayed delivery, multiple senders, configurable concurrency and rate limits, Elasticsearch search, Slack rate-limit alerts and a live queue dashboard. Deployed on AWS EC2 with Docker Compose, HTTPS and GitHub Actions.
