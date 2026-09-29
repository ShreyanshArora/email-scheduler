import { Avatar, Icon } from "./shared";
import type { Email, User } from "./shared";
export function Detail({ email, user, close, star, move, error }: {
  email: Email; user: User; close: () => void; star: (email: Email) => void;
  move: (email: Email, mailbox: Email["mailbox"]) => void; error: string;
}) {
  const date = email.sent_at ?? email.scheduled_at;
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
        <span className="detail-divider" /><Avatar user={user} />
      </div>
    </header>
    {error && <div className="banner-error" role="alert">{error}</div>}
    <article className="detail-content">
      <div className="sender-avatar">{email.sender.charAt(0).toUpperCase()}</div>
      <div className="detail-message">
        <div className="detail-meta"><strong>{email.sender.split("@")[0]}</strong><span>&lt;{email.sender}&gt;</span><time>{new Date(date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>
        <details className="detail-to"><summary>to {email.recipient}</summary><dl className="message-headers">
          <dt>from:</dt><dd>{email.sender}</dd><dt>to:</dt><dd>{email.recipient}</dd>
          <dt>date:</dt><dd>{new Date(date).toLocaleString()}</dd><dt>subject:</dt><dd>{email.subject}</dd>
          <dt>security:</dt><dd>SMTP transport security is separate from end-to-end encryption. This message is not end-to-end encrypted.</dd>
        </dl></details>
        {email.body_html ? <div className="detail-body rich-message" dangerouslySetInnerHTML={{ __html: email.body_html }} /> : <div className="detail-body">{email.body}</div>}
        {!!email.attachments?.length && <div className="attachments">{email.attachments.map((file, index) => <a className="attachment-card" key={index} href={`/api/emails/${email.id}/attachments/${index}`} download={file.name}>
          {["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) ? <img src={`/api/emails/${email.id}/attachments/${index}?preview=1`} alt={file.name} /> : <div className="attachment-file"><Icon name="paperclip" size={30} /></div>}<div><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · Download</small></div>
        </a>)}</div>}
        <div className="delivery-info"><strong>{email.mailbox === "trash" && email.status === "scheduled" ? "Cancelled · In Trash" : email.status === "sent" ? "Sent" : email.status === "failed" ? "Failed" : "Scheduled"}</strong> · {new Date(date).toLocaleString()}
          {email.error && <p>{email.error}</p>}{email.preview_url && <p><a href={email.preview_url} target="_blank" rel="noreferrer">Open Ethereal email preview ↗</a></p>}
        </div>
      </div>
    </article>
  </main>;
}
