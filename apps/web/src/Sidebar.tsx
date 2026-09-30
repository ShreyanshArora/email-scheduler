import { useState } from "react";
import { Brand } from "./Brand";
import { api, Avatar, Icon } from "./shared";
import type { User, Folder, View } from "./shared";
function AccountMenu({
  user,
  logout,
  refreshUser,
}: {
  user: User;
  logout: () => void;
  refreshUser: () => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
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
    <div className="account-wrap">
      <button
        className="account-card"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Avatar user={user} />
        <span className="account-copy">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </span>
        <Icon name="chevron" size={19} />
      </button>
      {open && (
        <div className="account-menu">
          <div className="account-menu-heading">{user.email}</div>
          {!user.google_connected && <a href="/auth/google">Connect Google</a>}
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
          <a href="/admin/queues/">
            <Icon name="queue" size={18} /> Queue dashboard
          </a>
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
