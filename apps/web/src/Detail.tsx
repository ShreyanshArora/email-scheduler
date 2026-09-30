import { useEffect, useRef } from "react";
import { Icon } from "./shared";
import type { Email, User } from "./shared";
import { AccountMenu } from "./Sidebar";
export function Detail({ email, user, close, star, move, error, logout, refreshUser }: {
  email: Email; user: User; close: () => void; star: (email: Email) => void;
  move: (email: Email, mailbox: Email["mailbox"]) => void; error: string; logout: () => void; refreshUser: () => void;
}) {
  const date = email.sent_at ?? email.scheduled_at;
  const headersRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (headersRef.current?.open && !headersRef.current.contains(event.target as Node)) headersRef.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && headersRef.current) headersRef.current.open = false; };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  return <main className="detail-page">
    <header className="detail-header">
      <button className="icon-button" onClick={close} aria-label="Back"><Icon name="back" size={25} /></button>
      <h1>{email.subject}</h1>
      <div className="detail-actions">
        <button className={`icon-button ${email.starred ? "starred" : ""}`} onClick={() => star(email)} title={email.starred ? "Unstar email" : "Star email"}><Icon name="star" /></button>
        {email.mailbox === "trash" ? <button className="icon-button" onClick={() => move(email, "inbox")} title="Restore email"><Icon name="restore" /></button> : <>
          <button className="icon-button" onClick={() => move(email, email.mailbox === "archived" ? "inbox" : "archived")} title={email.mailbox === "archived" ? "Unarchive email" : "Archive email"}><Icon name="archive" /></button>
          <button className="icon-button" onClick={() => move(email, "trash")} title="Move to Trash" disabled={email.status === "sending"}><Icon name="trash" /></button>
        </>}
        <span className="detail-divider" /><AccountMenu user={user} logout={logout} refreshUser={refreshUser} compact />
      </div>
    </header>
    {error && <div className="banner-error" role="alert">{error}</div>}
    <article className="detail-content">
      <div className="sender-avatar">{email.sender.charAt(0).toUpperCase()}</div>
      <div className="detail-message">
        <div className="detail-meta"><strong>{email.sender.split("@")[0]}</strong><span>&lt;{email.sender}&gt;</span><time>{new Date(date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}</time></div>
        <details ref={headersRef} className="detail-to"><summary>to {email.recipient}</summary><dl className="message-headers">
          <dt>from:</dt><dd>{email.sender}</dd><dt>to:</dt><dd>{email.recipient}</dd>
          {email.sent_at && <><dt>sent:</dt><dd>{new Date(email.sent_at).toLocaleString()}</dd></>}
          <dt>planned:</dt><dd>{new Date(email.scheduled_at).toLocaleString()}</dd>
          <dt>subject:</dt><dd>{email.subject}</dd>
          {email.smtp_message_id && <><dt>message ID:</dt><dd>{email.smtp_message_id}</dd></>}
          <dt>attempts:</dt><dd>{email.send_attempts}</dd>
          <dt>security:</dt><dd>SMTP transport security is separate from end-to-end encryption. This message is not end-to-end encrypted.</dd>
        </dl></details>
        <div className="detail-delivery-row"><span className="status-pill">{email.status === "sent" ? "Sent" : email.status === "failed" ? "Failed" : email.status === "sending" ? "Sending" : "Scheduled"}</span>{email.status === "sent" && <a className="preview-link" href={email.preview_url ?? "https://ethereal.email/"} target="_blank" rel="noopener noreferrer">{email.preview_url ? "Open in Ethereal" : "Open Ethereal inbox"} ↗</a>}</div>
        {email.body_html ? <div className="detail-body rich-message" dangerouslySetInnerHTML={{ __html: email.body_html }} /> : <div className="detail-body">{email.body}</div>}
        {!!email.attachments?.length && <div className="attachments">{email.attachments.map((file, index) => <a className="attachment-card" key={index} href={`/api/emails/${email.id}/attachments/${index}`} download={file.name}>
          {["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) ? <img src={`/api/emails/${email.id}/attachments/${index}?preview=1`} alt={file.name} /> : <div className="attachment-file"><Icon name="paperclip" size={30} /></div>}<div><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · Download</small></div>
        </a>)}</div>}
        <div className="delivery-info"><strong>{email.mailbox === "trash" && email.status === "scheduled" ? "Cancelled · In Trash" : email.status === "sent" ? "Sent" : email.status === "failed" ? "Failed" : "Scheduled"}</strong> · {new Date(date).toLocaleString()}
          {email.error && <p>{email.error}</p>}
        </div>
      </div>
    </article>
  </main>;
}
