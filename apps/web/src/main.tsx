import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, formatDate, Icon, recipientName } from "./shared";
import type { Email, Folder, Settings, User, View } from "./shared";
import { Login } from "./Login";
import { Sidebar } from "./Sidebar";
import { Compose } from "./Compose";
import { Detail } from "./Detail";
import "./style.css";
const emptyCounts = { scheduled: 0, sent: 0, all: 0, archived: 0, trash: 0 };
const labels: Record<Folder, string> = { scheduled: "Scheduled", sent: "Sent", all: "All emails", archived: "Archived", trash: "Trash" };
const isFolder = (view: View): view is Folder => view in labels;
type CampaignProgress = { total: number; sent: number; sending: number; scheduled: number; failed: number; starts_at: string };
function savedFolder(): Folder { const value = localStorage.getItem("reachinbox:last-folder"); return value && value in labels ? value as Folder : "scheduled"; }
function App() {
  const [user, setUser] = useState<User | null | undefined>(), [settings, setSettings] = useState<Settings | null>(null),
    [view, setView] = useState<View>(savedFolder), [previous, setPrevious] = useState<Folder>(savedFolder),
    [selected, setSelected] = useState<Email | null>(null), [items, setItems] = useState<Email[]>([]),
    [counts, setCounts] = useState<Record<Folder, number>>(emptyCounts), [search, setSearch] = useState(""),
    [filterFolders, setFilterFolders] = useState<Folder[]>([]), [starredOnly, setStarredOnly] = useState(false), [filtersOpen, setFiltersOpen] = useState(false),
    [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState(""),
    [notice, setNotice] = useState(""), [limit, setLimit] = useState(100), [more, setMore] = useState(false),
    [campaignId, setCampaignId] = useState(() => sessionStorage.getItem("reachinbox:active-campaign")),
    [progress, setProgress] = useState<CampaignProgress | null>(null), filterRef = useRef<HTMLDivElement>(null);
  async function refreshUser() { const profile = await api<User>("/api/me"); setUser(profile); setSettings(await api<Settings>("/api/settings")); }
  useEffect(() => {
    const authError = new URLSearchParams(location.search).get("authError");
    if (authError) { setError(authError); history.replaceState(null, "", location.pathname); }
    refreshUser().catch(cause => { if (cause instanceof Error && cause.message !== "Authentication required") setError(cause.message); setUser(null); });
  }, []);
  useEffect(() => {
    if (!user || !isFolder(view)) return;
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams({ mailbox: view === "all" ? "all" : view === "archived" || view === "trash" ? view : "inbox", q: search, starred: String(starredOnly) });
        if (filterFolders.length) params.set("folders", filterFolders.join(","));
        if (!filterFolders.length && view === "scheduled") params.set("status", "scheduled,sending");
        if (!filterFolders.length && view === "sent") params.set("status", "sent,failed");
        const pages = await Promise.all(Array.from({ length: Math.ceil(limit / 100) }, (_, page) => api<Email[]>(`/api/emails?${params}&offset=${page * 100}`)));
        if (!cancelled) { setItems(pages.flat()); setMore(pages[pages.length - 1].length === 100); setLoading(false); }
      } catch (cause) { if (!cancelled) { setError(cause instanceof Error ? cause.message : "Could not load emails."); setLoading(false); } }
    }
    setLoading(true); const timer = setTimeout(load, search ? 250 : 0), interval = setInterval(load, 2000);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(interval); };
  }, [user?.id, view, search, starredOnly, filterFolders, refresh, limit]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => { try { const next = await api<Record<Folder, number>>("/api/email-counts"); if (!cancelled) setCounts(next); } catch { /* list reports API errors */ } };
    void load(); const timer = setInterval(load, 2000); return () => { cancelled = true; clearInterval(timer); };
  }, [user?.id, refresh]);
  useEffect(() => {
    if (!user || !campaignId) return;
    let cancelled = false;
    const load = async () => {
      try { const next = await api<CampaignProgress>(`/api/campaigns/${campaignId}/progress`); if (!cancelled) setProgress(next); }
      catch { if (!cancelled) { setCampaignId(null); setProgress(null); sessionStorage.removeItem("reachinbox:active-campaign"); } }
    };
    void load(); const timer = setInterval(load, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user?.id, campaignId]);
  useEffect(() => {
    if (!filtersOpen) return;
    const dismiss = (event: PointerEvent) => { if (!filterRef.current?.contains(event.target as Node)) setFiltersOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFiltersOpen(false); };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [filtersOpen]);
  function navigate(next: View) {
    if (isFolder(view)) setPrevious(view);
    if (isFolder(next)) localStorage.setItem("reachinbox:last-folder", next);
    setView(next); setSearch(""); setFilterFolders([]); setStarredOnly(false); setSelected(null); setFiltersOpen(false); setLimit(100); setError("");
  }
  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); localStorage.removeItem("reachinbox:last-folder"); sessionStorage.removeItem("reachinbox:active-campaign"); setCampaignId(null); setProgress(null); setView("scheduled"); setPrevious("scheduled"); setSelected(null); setItems([]); setCounts(emptyCounts); setSearch(""); setStarredOnly(false); setError(""); setNotice(""); setUser(null); }
    catch (cause) { setError(String(cause)); }
  }
  async function toggleStar(email: Email) {
    try {
      const updated = await api<Email>(`/api/emails/${email.id}/star`, { method: "PATCH", body: JSON.stringify({ starred: !email.starred }) });
      setItems(current => current.map(row => row.id === updated.id ? { ...row, ...updated } : row));
      setSelected(current => current?.id === updated.id ? { ...current, ...updated } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not star email."); }
  }
  async function move(email: Email, mailbox: Email["mailbox"]) {
    try {
      await api(`/api/emails/${email.id}/mailbox`, { method: "PATCH", body: JSON.stringify({ mailbox }) });
      setRefresh(value => value + 1); navigate(previous);
      setNotice(mailbox === "trash" ? "Moved to Trash. Pending delivery is cancelled. You can restore it from Filters → Trash." : mailbox === "archived" ? "Email archived. Find it under Filters → Archived." : "Email restored. Pending delivery resumes automatically.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not move email."); }
  }
  if (user === undefined) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Login onLogin={() => refreshUser().catch(cause => setError(String(cause)))} initialError={error} />;
  if (view === "compose") return settings ? <Compose settings={settings} close={() => navigate(previous)} done={folder => { setCampaignId(sessionStorage.getItem("reachinbox:active-campaign")); setProgress(null); setRefresh(value => value + 1); navigate(folder); setNotice(folder === "scheduled" ? "Email scheduled for the selected date and time." : "Sending started. Delivery progress is shown below."); }} /> : <div className="loading-screen">Loading settings…</div>;
  if (view === "detail" && selected) return <Detail email={selected} user={user} close={() => navigate(previous)} star={toggleStar} move={move} error={error} logout={logout} refreshUser={() => refreshUser().catch(cause => setError(String(cause)))} />;
  return <div className="app-shell">
    <Sidebar user={user} view={view} counts={counts} navigate={next => { setFilterFolders([]); setStarredOnly(false); setNotice(""); navigate(next); }} logout={logout} refreshUser={() => refreshUser().catch(cause => setError(String(cause)))} />
    <main className="inbox-main">
      <header className="inbox-toolbar">
        <label className="search-box"><Icon name="search" size={20} /><input value={search} onChange={event => { setSearch(event.target.value); setLimit(100); }} placeholder="Search" aria-label="Search emails" /></label>
        <div className="filter-wrap" ref={filterRef}>
          <button className={`icon-button ${filtersOpen || starredOnly || !["scheduled", "sent"].includes(view) ? "active" : ""}`} title="Filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter" size={20} /></button>
          {filtersOpen && <div className="filter-menu" role="dialog" aria-label="Email filters">
            <div className="filter-heading"><strong>Filters</strong><button className="icon-button" title="Close filters" onClick={() => setFiltersOpen(false)}><Icon name="close" size={16} /></button></div>
            {(Object.entries(labels) as [Folder, string][]).map(([folder, label]) => <label key={folder} className="filter-choice"><input type="checkbox" checked={filterFolders.includes(folder)} onChange={() => { setFilterFolders(current => current.includes(folder) ? current.filter(value => value !== folder) : [...current, folder]); setView("all"); setLimit(100); setNotice(""); }} />{label}<span>{counts[folder]}</span></label>)}
            <label className="star-filter"><input type="checkbox" checked={starredOnly} onChange={event => { setStarredOnly(event.target.checked); setLimit(100); }} /> Starred only</label>
            <button onClick={() => { setFilterFolders([]); setStarredOnly(false); setSearch(""); setLimit(100); }}>Clear filters</button>
            <button className="filter-done" onClick={() => setFiltersOpen(false)}>Done</button>
          </div>}
        </div>
        <button className="icon-button" title="Refresh" onClick={() => { setError(""); setRefresh(value => value + 1); }}><Icon name="refresh" size={20} /></button>
      </header>
      {isFolder(view) && !["scheduled", "sent"].includes(view) && <div className="folder-heading">{labels[view]} {starredOnly && "· Starred"}</div>}
      {notice && <div className="notice" role="status">{notice}<button className="icon-button" title="Dismiss notification" onClick={() => setNotice("")}><Icon name="close" size={16} /></button></div>}
      {progress && <div className="sending-progress" role="status" aria-live="polite">
        <div className="sending-progress-copy"><strong>{progress.sent + progress.failed === progress.total ? "Delivery complete" : new Date(progress.starts_at).getTime() > Date.now() ? "Scheduled to send" : "Sending emails"}</strong><span>{progress.sent} sent · {progress.sending} sending · {progress.scheduled} waiting{progress.failed ? ` · ${progress.failed} failed` : ""}</span><button className="icon-button" aria-label="Dismiss delivery progress" onClick={() => { sessionStorage.removeItem("reachinbox:active-campaign"); setCampaignId(null); setProgress(null); }}><Icon name="close" size={16} /></button></div>
        <div className="sending-progress-track"><span style={{ width: `${Math.round((progress.sent + progress.failed) / progress.total * 100)}%` }} /></div>
      </div>}
      {error && <div className="banner-error" role="alert">{error}</div>}
      {loading ? <div className="list-state">Loading emails…</div> : items.length === 0 ? <div className="list-state"><div className="empty-icon"><Icon name={view === "scheduled" ? "clock" : view === "sent" ? "send" : "mail"} size={27} /></div><h2>{search ? "No matching emails" : view === "scheduled" ? "No scheduled emails" : view === "sent" ? "No sent emails" : `No ${starredOnly ? "starred" : view} emails yet`}</h2><p>{view === "scheduled" ? "Emails you schedule appear here with the time they go out." : view === "trash" ? "Deleted emails appear here and can be restored." : "Your emails will appear here."}</p>{!search && (view === "scheduled" || view === "sent") && <button className="empty-compose" onClick={() => navigate("compose")}><Icon name="compose" size={18} /> Compose</button>}</div> : <div className="message-list">
        {items.map(email => <div className="message-row" key={email.id}>
          <button className="row-open" onClick={() => { setSelected(email); setPrevious(view as Folder); setView("detail"); setError(""); }}>
            <span className="row-to" title={email.recipient}>To: {recipientName(email.recipient)}</span>
            <span className={`status-pill ${["scheduled", "sending"].includes(email.status) ? "scheduled" : ""} ${email.status === "failed" ? "failed" : ""}`} title={new Date(email.sent_at ?? email.scheduled_at).toLocaleString()}>
              {email.mailbox === "trash" && email.status === "scheduled" ? "Cancelled" : email.status === "sending" ? <><span className="sending-spinner" />Sending</> : email.status === "scheduled" ? <><Icon name="clock" size={13} />{email.rate_limited && <strong>Rate-limited</strong>}{formatDate(email.scheduled_at)}</> : email.status === "failed" ? "Failed" : "Sent"}
            </span>
            <span className="row-subject"><strong>{email.subject}</strong><span> - {email.body.replace(/\s+/g, " ")}</span></span>
            {email.sent_at && <time className="row-time">{new Date(email.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>}
          </button>
          <button className={`icon-button row-star ${email.starred ? "starred" : ""}`} title={email.starred ? "Unstar email" : "Star email"} onClick={() => toggleStar(email)}><Icon name="star" size={19} /></button>
        </div>)}
        {more && <button className="load-more" onClick={() => setLimit(value => value + 100)}>Load more emails</button>}
      </div>}
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App />);
