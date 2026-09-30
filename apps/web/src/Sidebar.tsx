import { useEffect, useRef, useState } from "react";
import { Brand } from "./Brand";
import { api, Avatar, Icon } from "./shared";
import type { User, Folder, View } from "./shared";
export function AccountMenu({
  user,
  logout,
  refreshUser,
  compact = false,
}: {
  user: User;
  logout: () => void;
  refreshUser: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function disconnect() {
    try {
      await api("/api/slack/disconnect", { method: "POST" });
      refreshUser();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not disconnect Slack",
      );
    }
  }
  return (
    <div className={`account-wrap ${compact ? "compact-account" : ""}`} ref={menuRef}>
      <button
        className="account-card"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={compact ? "Open profile menu" : undefined}
      >
        <Avatar user={user} />
        {!compact && <span className="account-copy">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </span>}
        {!compact && <Icon name="chevron" size={19} />}
      </button>
      {open && (
        <div className="account-menu">
          <div className="account-menu-heading">{user.email}</div>
          {user.slack_connected ? (
            <>
              <div className="slack-connected">
                Slack connected
                {user.slack_channel ? ` · ${user.slack_channel}` : ""}
              </div>
              <a href="/auth/slack"><Icon name="plug" size={18} /> Reconnect Slack</a>
              <button onClick={disconnect}><Icon name="plug" size={18} /> Disconnect Slack</button>
            </>
          ) : (
            <a href="/auth/slack"><Icon name="plug" size={18} /> Connect Slack</a>
          )}
          {user.queue_admin && <a href="/admin/queues/" target="_blank" rel="noopener noreferrer">
            <Icon name="queue" size={18} /> Queue dashboard
          </a>}
          <button onClick={logout}><Icon name="logout" size={18} /> Log out</button>
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
export function Sidebar({
  user,
  view,
  counts,
  navigate,
  logout,
  refreshUser,
}: {
  user: User;
  view: View;
  counts: Record<Folder, number>;
  navigate: (next: View) => void;
  logout: () => void;
  refreshUser: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="wordmark"><Brand /></div>
      <AccountMenu user={user} logout={logout} refreshUser={refreshUser} />
      <button className="compose-trigger" onClick={() => navigate("compose")}>
        Compose
      </button>
      <div className="nav-label">CORE</div>
      <nav className="side-nav" aria-label="Email folders">
        <button
          className={view === "scheduled" ? "selected" : ""}
          onClick={() => navigate("scheduled")}
        >
          <Icon name="clock" /> Scheduled <span>{counts.scheduled}</span>
        </button>
        <button
          className={view === "sent" ? "selected" : ""}
          onClick={() => navigate("sent")}
        >
          <Icon name="send" /> Sent <span>{counts.sent}</span>
        </button>
      </nav>
    </aside>
  );
}
