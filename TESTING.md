# Try the local demo

Open http://localhost:5173 and log in with `demo-ui-check@example.test` / `TemporaryDemo!2026`. This account is for local testing only; do not seed it on a public deployment.

`demo-leads.csv` contains seven test recipients; `demo-leads-30.csv` contains thirty. All use example.test addresses. The project sends through Ethereal, which captures mail without contacting recipients' real inboxes.

1. Click Compose. Select a sender and use Upload List to choose either CSV. Verify the detected count. You can also type an address and press Enter, then type another; each becomes a removable chip.
2. Enter a subject and body. The delay is in seconds. The hourly limit applies per account and sender, with a server-configured ceiling. The paperclip adds actual attachments (5 MB total); it is separate from Upload List.
3. Click Send for immediate queue processing. It may briefly show Scheduled while the worker sends; the list refreshes automatically and Sent increases. Hourly throttling can leave excess recipients scheduled for the next hour.
4. For future delivery, click the clock, choose a time, then Done. The action changes to Send Later. Cancel does not apply changes. Click Send Later to create the jobs.
5. Open a sent message and click Open Ethereal email preview. Ethereal's external preview has its own design; the application's message reader follows the supplied layout.
6. Use the funnel beside Refresh to select All emails, Scheduled, Sent, Archived or Trash. Star filtering is optional. Open a message to archive, star or move it to Trash. Restoring pending mail requeues it; restoring sent mail does not send it again.
7. For Slack, connect from the profile menu, select a channel and approve the OAuth flow. Use an unused sender/hour with limit 2 and six recipients. Expect two sends, four deferred messages and one channel alert. Existing activity in the same sender/hour counts toward the limit.

The scheduled badge uses your browser's local time and includes weekday, seconds and AM/PM. The database stores timestamps with time zones. SMTP transport encryption is not end-to-end encryption.

Run automated checks as documented in VERIFICATION.md. The populated demo has both scheduled and sent messages already; counts change as due jobs finish.
