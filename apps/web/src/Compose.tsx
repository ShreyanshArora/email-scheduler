import { useMemo, useRef, useState } from "react";
import { api, emailsFromText, Icon, localDateTime } from "./shared";
import type { Folder, Settings } from "./shared";
import { RichEditor } from "./RichEditor";
const MAX_BYTES = 5 * 1024 * 1024;
type Attachment = { name: string; type: string; size: number; content: string };
export function Compose({ settings, close, done }: { settings: Settings; close: () => void; done: (folder: Folder) => void }) {
  const [sender, setSender] = useState(settings.senders.length > 1 ? "rotate" : settings.default_sender), [draft, setDraft] = useState(""),
    [recipients, setRecipients] = useState<string[]>([]), [filename, setFilename] = useState(""),
    [subject, setSubject] = useState(""), [body, setBody] = useState(""), [bodyHtml, setBodyHtml] = useState(""),
    [attachments, setAttachments] = useState<Attachment[]>([]);
  const [delay, setDelay] = useState(String(Math.ceil(settings.min_send_delay_ms / 1000))),
    [limit, setLimit] = useState(String(settings.max_hourly_limit)), [expanded, setExpanded] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false), [laterAt, setLaterAt] = useState(localDateTime(new Date(Date.now() + 300000))),
    [selectedLater, setSelectedLater] = useState(false), [confirmedLaterAt, setConfirmedLaterAt] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID()), fileRef = useRef<HTMLInputElement>(null), attachmentRef = useRef<HTMLInputElement>(null);
  const allRecipients = useMemo(() => Array.from(new Set([...recipients, ...emailsFromText(draft)])), [recipients, draft]);
  function commitDraft() {
    if (!draft.trim()) return true;
    const parts = draft.trim().split(/[\s,;]+/).filter(Boolean);
    if (parts.some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
      setError("Enter a valid email address, then press Enter or comma."); return false;
    }
    setRecipients(current => Array.from(new Set([...current, ...parts.map(value => value.toLowerCase())])));
    setDraft(""); setError(""); return true;
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("Choose a CSV or text file of 5 MB or less.");
    const addresses = emailsFromText(await file.text());
    if (!addresses.length) return setError("No email addresses were found in this file.");
    setRecipients(current => Array.from(new Set([...current, ...addresses])));
    setFilename(`${file.name} · ${addresses.length} addresses detected`); setError("");
  }
  async function attach(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (selected.length + attachments.length > 20 || [...selected, ...attachments].reduce((sum, file) => sum + file.size, 0) > MAX_BYTES)
      return setError("Attachments must be 5 MB or less in total (up to 20 files).");
    const added = await Promise.all(selected.map(file => new Promise<Attachment>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = reject;
      reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, content: String(reader.result).split(",")[1] });
      reader.readAsDataURL(file);
    })));
    setAttachments(current => [...current, ...added]); setError("");
  }
  function preset(hour: number) { const next = new Date(); next.setDate(next.getDate() + 1); next.setHours(hour, 0, 0, 0); setLaterAt(localDateTime(next)); }
  async function send(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!commitDraft()) return;
    if (!allRecipients.length) return setError("Add at least one valid recipient or upload a list.");
    if (!body.trim()) return setError("Write an email body.");
    const start = selectedLater ? new Date(confirmedLaterAt) : new Date();
    if (!Number.isFinite(start.getTime()) || (selectedLater && start.getTime() <= Date.now())) return setError("Choose a future date and time.");
    setBusy(true);
    try {
      await api("/api/emails/schedule", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({
        recipients: allRecipients, subject, body, bodyHtml, attachments, sender, startsAt: start.toISOString(), delayMs: Number(delay) * 1000, hourlyLimit: Number(limit),
      }) });
      done(selectedLater ? "scheduled" : "all");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not schedule email."); }
    finally { setBusy(false); }
  }
  return <form className="compose-page" onSubmit={send}>
    <header className="compose-heading">
      <button type="button" className="icon-button back-button" onClick={close} aria-label="Back"><Icon name="back" size={25} /></button>
      <h1>Compose New Email</h1>
      <div className="compose-actions">
        <button type="button" className={`icon-button ${attachments.length ? "active" : ""}`} title="Attach files (5 MB maximum)" onClick={() => attachmentRef.current?.click()}>
          <Icon name="paperclip" size={24} />{attachments.length > 0 && <span className="attachment-count">{attachments.length}</span>}
        </button>
        <button type="button" className={`icon-button ${selectedLater ? "active" : ""}`} title="Choose send time" onClick={() => setLaterOpen(!laterOpen)}><Icon name="clock" size={24} /></button>
        <button className="send-button" disabled={busy}>{busy ? "Sending…" : selectedLater ? "Send Later" : "Send"}</button>
      </div>
    </header>
    {error && <p className="form-error compose-error" role="alert">{error}</p>}
    <div className="compose-content">
      <div className="compose-line from-line"><label htmlFor="from">From</label><select id="from" required value={sender} onChange={e => setSender(e.target.value)}>{settings.senders.length > 1 && <option value="rotate">All senders (rotate)</option>}{settings.senders.map(address => <option key={address}>{address}</option>)}</select></div>
      <div className="compose-line to-line">
        <label htmlFor="to">To</label>
        <div className="to-entry">
          <div className="recipient-chips">{(expanded ? recipients : recipients.slice(0, 3)).map(value => <span key={value}>{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => setRecipients(current => current.filter(email => email !== value))}>×</button></span>)}
            {!expanded && recipients.length > 3 && <button type="button" className="more-recipients" onClick={() => setExpanded(true)}>+{recipients.length - 3}</button>}
          </div>
          <input id="to" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commitDraft}
            onKeyDown={event => { if (["Enter", ",", ";"].includes(event.key)) { event.preventDefault(); commitDraft(); } else if (event.key === "Tab" && draft.trim()) commitDraft(); }}
            placeholder={recipients.length ? "Add another email" : "recipient@example.com"} />
        </div>
        <button type="button" className="upload-link" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Upload List</button>
      </div>
      <input ref={fileRef} className="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={event => { void upload(event.target.files?.[0]).catch(() => setError("Could not read this recipient list.")); event.target.value = ""; }} />
      <input ref={attachmentRef} className="visually-hidden" type="file" multiple aria-label="Email attachments" onChange={event => { void attach(event.target.files).catch(() => setError("Could not read attachment.")); event.target.value = ""; }} />
      {filename && <div className="file-indicator">{filename}</div>}
      <div className="compose-line subject-line"><label htmlFor="subject">Subject</label><input id="subject" required value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" /></div>
      <div className="compose-options">
        <label htmlFor="delay">Delay between 2 emails</label><input id="delay" type="number" min="0" step="1" required value={delay} onChange={e => setDelay(e.target.value)} />
        <label htmlFor="limit">Hourly Limit</label><input id="limit" type="number" min="1" max={settings.max_hourly_limit} required value={limit} onChange={e => setLimit(e.target.value)} />
        <span className="option-hint">seconds · {allRecipients.length} recipients</span>
      </div>
      <RichEditor onChange={(text, html) => { setBody(text); setBodyHtml(html); }} />
      {attachments.length > 0 && <div className="attachments">{attachments.map((file, index) => <div className="attachment-card" key={`${file.name}-${index}`}>
        {file.type.startsWith("image/") && file.type !== "image/svg+xml" ? <img src={`data:${file.type};base64,${file.content}`} alt={file.name} /> : <div className="attachment-file"><Icon name="paperclip" size={30} /></div>}
        <div><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB</small></div>
        <button type="button" className="icon-button attachment-remove" aria-label={`Remove attachment ${file.name}`} onClick={() => setAttachments(current => current.filter((_, i) => i !== index))}><Icon name="close" size={16} /></button>
      </div>)}</div>}
      {selectedLater && <p className="scheduled-note">Scheduled to start {new Date(confirmedLaterAt).toLocaleString()} <button type="button" onClick={() => setSelectedLater(false)}>Send now instead</button></p>}
    </div>
    {laterOpen && <div className="send-later-popover" role="dialog" aria-label="Send Later">
      <h2>Send Later</h2><label className="date-picker"><input aria-label="Pick date and time" type="datetime-local" value={laterAt} onChange={e => setLaterAt(e.target.value)} /><Icon name="calendar" size={18} /></label>
      <button type="button" onClick={() => setLaterAt(localDateTime(new Date(Date.now() + 300000)))}>In 5 minutes</button><button type="button" onClick={() => preset(10)}>Tomorrow, 10:00 AM</button><button type="button" onClick={() => preset(11)}>Tomorrow, 11:00 AM</button><button type="button" onClick={() => preset(15)}>Tomorrow, 3:00 PM</button>
      <div className="popover-actions"><button type="button" onClick={() => setLaterOpen(false)}>Cancel</button><button type="button" className="send-button" onClick={() => {
        if (!Number.isFinite(new Date(laterAt).getTime()) || new Date(laterAt).getTime() <= Date.now()) return setError("Choose a future date and time.");
        setConfirmedLaterAt(laterAt); setSelectedLater(true); setLaterOpen(false);
      }}>Done</button></div>
    </div>}
  </form>;
}
