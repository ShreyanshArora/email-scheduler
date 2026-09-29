import { Icon } from "./shared";
import type { Email } from "./shared";
export function Detail({
  email,
  close,
  star,
}: {
  email: Email;
  close: () => void;
  star: (email: Email) => void;
}) {
  const date = email.sent_at ?? email.scheduled_at;
  return (
    <main className="detail-page">
      <header className="detail-header">
        <button className="icon-button" onClick={close} aria-label="Back">
          <Icon name="back" size={29} />
        </button>
        <h1>{email.subject}</h1>
        <button
          className={`icon-button detail-star ${email.starred ? "starred" : ""}`}
          onClick={() => star(email)}
          title={email.starred ? "Unstar email" : "Star email"}
        >
          <Icon name="star" size={27} />
        </button>
      </header>
      <article className="detail-content">
        <div className="sender-avatar">
          {email.sender.charAt(0).toUpperCase()}
        </div>
        <div className="detail-message">
          <div className="detail-meta">
            <strong>{email.sender.split("@")[0]}</strong>{" "}
            <span>&lt;{email.sender}&gt;</span>
            <time>{new Date(date).toLocaleString()}</time>
          </div>
          <div className="detail-to">to {email.recipient}</div>
          <div className="detail-body">{email.body}</div>
          <div className="delivery-info">
            <strong>
              {email.status === "sent"
                ? "Sent"
                : email.status === "failed"
                  ? "Failed"
                  : "Scheduled"}
            </strong>{" "}
            · {new Date(date).toLocaleString()}
            {email.error && <p>{email.error}</p>}
            {email.preview_url && (
              <p>
                <a href={email.preview_url} target="_blank" rel="noreferrer">
                  Open Ethereal email preview ↗
                </a>
              </p>
            )}
          </div>
        </div>
      </article>
    </main>
  );
}
