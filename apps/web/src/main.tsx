import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, formatDate, Icon, recipientName } from "./shared";
import type { Email, Folder, Settings, User, View } from "./shared";
import { Login } from "./Login";
import { Sidebar } from "./Sidebar";
import { Compose } from "./Compose";
import { Detail } from "./Detail";
import "./style.css";

function App() {
  const [user, setUser] = useState<User | null | undefined>(),
    [settings, setSettings] = useState<Settings | null>(null),
    [view, setView] = useState<View>("scheduled"),
    [previous, setPrevious] = useState<Folder>("scheduled"),
    [selected, setSelected] = useState<Email | null>(null),
    [items, setItems] = useState<Email[]>([]),
    [counts, setCounts] = useState<Record<Folder, number>>({
      scheduled: 0,
      sent: 0,
    }),
    [search, setSearch] = useState(""),
    [starredOnly, setStarredOnly] = useState(false),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function refreshUser() {
    const profile = await api<User>("/api/me");
    setUser(profile);
    setSettings(await api<Settings>("/api/settings"));
  }
  useEffect(() => {
    refreshUser().catch((cause) => {
      if (cause instanceof Error && cause.message !== "Authentication required")
        setError(cause.message);
      setUser(null);
    });
  }, []);
  useEffect(() => {
    if (!user || (view !== "scheduled" && view !== "sent")) return;
    let cancelled = false;
    async function load() {
      try {
        const rows = await api<Email[]>(
          `/api/emails?status=${view === "scheduled" ? "scheduled,sending" : "sent,failed"}&q=${encodeURIComponent(search)}`,
        );
        if (!cancelled) {
          setItems(rows);
          setError("");
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Could not load emails.",
          );
          setLoading(false);
        }
      }
    }
    setLoading(true);
    const timer = setTimeout(load, search ? 250 : 0),
      interval = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [user?.id, view, search, refresh]);
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const rows = await api<Email[]>("/api/emails");
        setCounts({
          scheduled: rows.filter(
            (row) => row.status === "scheduled" || row.status === "sending",
          ).length,
          sent: rows.filter(
            (row) => row.status === "sent" || row.status === "failed",
          ).length,
        });
      } catch {
        /* List view reports errors. */
      }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [user?.id, refresh]);
  function navigate(next: View) {
    if (view === "scheduled" || view === "sent") setPrevious(view);
    setView(next);
    setSearch("");
    setSelected(null);
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setView("scheduled");
    setPrevious("scheduled");
    setSelected(null);
    setItems([]);
    setCounts({ scheduled: 0, sent: 0 });
    setSearch("");
    setStarredOnly(false);
    setError("");
    setUser(null);
  }
  async function toggleStar(email: Email) {
    try {
      const updated = await api<Email>(`/api/emails/${email.id}/star`, {
        method: "PATCH",
        body: JSON.stringify({ starred: !email.starred }),
      });
      setItems((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      if (selected?.id === updated.id) setSelected(updated);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not star email.",
      );
    }
  }
  if (user === undefined) return <div className="loading-screen">Loading…</div>;
  if (!user)
    return (
      <Login
        onLogin={() => refreshUser().catch((cause) => setError(String(cause)))}
        initialError={error}
      />
    );
  if (view === "compose")
    return settings ? (
      <Compose
        settings={settings}
        close={() => navigate(previous)}
        done={(folder) => {
          setRefresh((value) => value + 1);
          navigate(folder);
        }}
      />
    ) : (
      <div className="loading-screen">Loading settings…</div>
    );
  if (view === "detail" && selected)
    return (
      <Detail
        email={selected}
        close={() => navigate(previous)}
        star={toggleStar}
      />
    );
  const visible = starredOnly ? items.filter((row) => row.starred) : items;
  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        view={view}
        counts={counts}
        navigate={navigate}
        logout={logout}
        refreshUser={() =>
          refreshUser().catch((cause) => setError(String(cause)))
        }
      />
      <main className="inbox-main">
        <header className="inbox-toolbar">
          <label className="search-box">
            <Icon name="search" size={22} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              aria-label="Search emails"
            />
          </label>
          <button
            className={`icon-button ${starredOnly ? "active" : ""}`}
            title="Filter starred"
            onClick={() => setStarredOnly(!starredOnly)}
          >
            <Icon name="filter" />
          </button>
          <button
            className="icon-button"
            title="Refresh"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <Icon name="refresh" />
          </button>
        </header>
        {error && (
          <div className="banner-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="list-state">Loading emails…</div>
        ) : visible.length === 0 ? (
          <div className="list-state">
            <Icon name="mail" size={30} />
            <h2>No {starredOnly ? "starred" : view} emails yet</h2>
            <p>
              {view === "scheduled"
                ? "Your upcoming emails will appear here."
                : "Emails you send will appear here."}
            </p>
          </div>
        ) : (
          <div className="message-list">
            {visible.map((email) => (
              <div className="message-row" key={email.id}>
                <button
                  className="row-open"
                  onClick={() => {
                    setSelected(email);
                    setPrevious(view as Folder);
                    setView("detail");
                  }}
                >
                  <span className="row-to">
                    To: {recipientName(email.recipient)}
                  </span>
                  <span
                    className={`status-pill ${email.status === "scheduled" || email.status === "sending" ? "scheduled" : ""} ${email.status === "failed" ? "failed" : ""}`}
                  >
                    {email.status === "scheduled" ||
                    email.status === "sending" ? (
                      <>
                        <Icon name="clock" size={15} />{" "}
                        {formatDate(email.scheduled_at)}
                      </>
                    ) : email.status === "failed" ? (
                      "Failed"
                    ) : (
                      "Sent"
                    )}
                  </span>
                  <span className="row-subject">
                    <strong>{email.subject}</strong>
                    <span> - {email.body.replace(/\s+/g, " ")}</span>
                  </span>
                </button>
                <button
                  className={`icon-button row-star ${email.starred ? "starred" : ""}`}
                  title={email.starred ? "Unstar email" : "Star email"}
                  onClick={() => toggleStar(email)}
                >
                  <Icon name="star" size={22} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
