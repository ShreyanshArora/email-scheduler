import { useMemo, useRef, useState } from "react";
import { api, emailsFromText, Icon, localDateTime } from "./shared";
import type { Folder, Settings } from "./shared";
export function Compose({
  settings,
  close,
  done,
}: {
  settings: Settings;
  close: () => void;
  done: (folder: Folder) => void;
}) {
  const [sender, setSender] = useState(settings.default_sender),
    [to, setTo] = useState(""),
    [uploaded, setUploaded] = useState<string[]>([]),
    [filename, setFilename] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState("");
  const [delay, setDelay] = useState(
      String(Math.ceil(settings.min_send_delay_ms / 1000)),
    ),
    [limit, setLimit] = useState(String(settings.max_hourly_limit));
  const [laterOpen, setLaterOpen] = useState(false),
    [laterAt, setLaterAt] = useState(
      localDateTime(new Date(Date.now() + 3600000)),
    ),
    [selectedLater, setSelectedLater] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID()),
    fileRef = useRef<HTMLInputElement>(null),
    bodyRef = useRef<HTMLTextAreaElement>(null);
  const recipients = useMemo(
    () => Array.from(new Set([...emailsFromText(to), ...uploaded])),
    [to, uploaded],
  );
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000)
      return setError("Choose a CSV or text file smaller than 2 MB.");
    const addresses = emailsFromText(await file.text());
    if (!addresses.length)
      return setError("No email addresses were found in this file.");
    setUploaded(addresses);
    setFilename(file.name);
    setError("");
  }
  function preset(hour: number) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(hour, 0, 0, 0);
    setLaterAt(localDateTime(next));
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!recipients.length)
      return setError("Add at least one valid recipient or upload a list.");
    if (!body.trim()) return setError("Write an email body.");
    const start = selectedLater ? new Date(laterAt) : new Date();
    if (
      Number.isNaN(start.getTime()) ||
      (selectedLater && start.getTime() <= Date.now())
    )
      return setError("Choose a future date and time.");
    setBusy(true);
    try {
      await api("/api/emails/schedule", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          recipients,
          subject,
          body,
          sender,
          startsAt: start.toISOString(),
          delayMs: Number(delay) * 1000,
          hourlyLimit: Number(limit),
        }),
      });
      done(selectedLater ? "scheduled" : "sent");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send email.",
      );
    } finally {
      setBusy(false);
    }
  }
  function editBody(before: string, after = before) {
    const input = bodyRef.current;
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    setBody(
      body.slice(0, start) +
        before +
        body.slice(start, end) +
        after +
        body.slice(end),
    );
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, end + before.length);
    });
  }
  return (
    <form className="compose-page" onSubmit={send}>
      <header className="compose-heading">
        <button
          type="button"
          className="icon-button back-button"
          onClick={close}
          aria-label="Back"
        >
          <Icon name="back" size={29} />
        </button>
        <h1>Compose New Email</h1>
        <div className="compose-actions">
          <button
            type="button"
            className="icon-button"
            title="Upload recipient list"
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="paperclip" size={28} />
            {filename && <span className="attachment-count">1</span>}
          </button>
          <button
            type="button"
            className={`icon-button ${selectedLater ? "active" : ""}`}
            title="Send Later"
            onClick={() => setLaterOpen(!laterOpen)}
          >
            <Icon name="clock" size={28} />
          </button>
          <button className="send-button" disabled={busy}>
            {busy ? "Working…" : selectedLater ? "Send Later" : "Send"}
          </button>
        </div>
      </header>
      <div className="compose-content">
        <div className="compose-line from-line">
          <label htmlFor="from">From</label>
          <select
            id="from"
            required
            value={sender}
            onChange={(event) => setSender(event.target.value)}
          >
            {settings.senders.map((address) => (
              <option key={address} value={address}>
                {address}
              </option>
            ))}
          </select>
        </div>
        <div className="compose-line to-line">
          <label htmlFor="to">To</label>
          <div className="to-entry">
            {recipients.length > 0 && (
              <div className="recipient-chips">
                {recipients.slice(0, 3).map((value) => (
                  <span key={value}>{value}</span>
                ))}
                {recipients.length > 3 && <span>+{recipients.length - 3}</span>}
              </div>
            )}
            <input
              id="to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder={
                recipients.length
                  ? "Add more recipients"
                  : "recipient@example.com"
              }
            />
          </div>
          <button
            type="button"
            className="upload-link"
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="upload" size={21} /> Upload List
          </button>
        </div>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(event) => upload(event.target.files?.[0])}
        />
        {filename && (
          <div className="file-indicator">
            {filename} · {uploaded.length} addresses detected{" "}
            <button
              type="button"
              onClick={() => {
                setUploaded([]);
                setFilename("");
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Remove
            </button>
          </div>
        )}
        <div className="compose-line subject-line">
          <label htmlFor="subject">Subject</label>
          <input
            id="subject"
            required
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
          />
        </div>
        <div className="compose-options">
          <label htmlFor="delay">Delay between 2 emails</label>
          <input
            id="delay"
            type="number"
            min="0"
            step="1"
            required
            value={delay}
            onChange={(event) => setDelay(event.target.value)}
            placeholder="00"
          />
          <label htmlFor="limit">Hourly Limit</label>
          <input
            id="limit"
            type="number"
            min="1"
            max={settings.max_hourly_limit}
            required
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="00"
          />
          <span className="option-hint">
            seconds · {recipients.length} recipients
          </span>
        </div>
        <div className="editor-shell">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Type Your Reply..."
            aria-label="Email body"
            required
          />
          <div className="editor-toolbar" aria-label="Formatting toolbar">
            <button type="button" onClick={() => editBody("**")} title="Bold">
              B
            </button>
            <button type="button" onClick={() => editBody("_")} title="Italic">
              <i>I</i>
            </button>
            <button
              type="button"
              onClick={() => editBody("__")}
              title="Underline"
            >
              <u>U</u>
            </button>
            <span />
            <button
              type="button"
              onClick={() => editBody("• ", "")}
              title="Bullet list"
            >
              ☷
            </button>
            <button
              type="button"
              onClick={() => editBody("1. ", "")}
              title="Numbered list"
            >
              1≡
            </button>
            <button
              type="button"
              onClick={() => editBody("> ", "")}
              title="Quote"
            >
              ❝
            </button>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {selectedLater && (
          <p className="scheduled-note">
            Scheduled to start {new Date(laterAt).toLocaleString()}
          </p>
        )}
      </div>
      {laterOpen && (
        <div className="send-later-popover">
          <h2>Send Later</h2>
          <label className="date-picker">
            Pick date &amp; time{" "}
            <input
              type="datetime-local"
              value={laterAt}
              onChange={(event) => setLaterAt(event.target.value)}
            />
            <Icon name="calendar" size={21} />
          </label>
          <button type="button" onClick={() => preset(9)}>
            Tomorrow
          </button>
          <button type="button" onClick={() => preset(10)}>
            Tomorrow, 10:00 AM
          </button>
          <button type="button" onClick={() => preset(11)}>
            Tomorrow, 11:00 AM
          </button>
          <button type="button" onClick={() => preset(15)}>
            Tomorrow, 3:00 PM
          </button>
          <div className="popover-actions">
            <button type="button" onClick={() => setLaterOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="send-button"
              onClick={() => {
                if (new Date(laterAt).getTime() <= Date.now())
                  return setError("Choose a future date and time.");
                setSelectedLater(true);
                setLaterOpen(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
