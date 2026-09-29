import type { ReactNode } from "react";
export type User = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  google_connected: boolean;
  slack_connected: boolean;
  slack_channel: string | null;
};
export type Settings = {
  default_sender: string;
  senders: string[];
  max_hourly_limit: number;
  min_send_delay_ms: number;
};
export type Email = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  body_html: string | null;
  mailbox: "inbox" | "archived" | "trash";
  attachments: { name: string; size: number; type: string }[];
  sender: string;
  scheduled_at: string;
  sent_at: string | null;
  status: "scheduled" | "sending" | "sent" | "failed";
  error: string | null;
  preview_url: string | null;
  starred: boolean;
};
export type Folder = "scheduled" | "sent" | "all" | "archived" | "trash";
export type View = Folder | "compose" | "detail";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

type IconName =
  | "clock"
  | "send"
  | "search"
  | "back"
  | "upload"
  | "mail"
  | "paperclip"
  | "chevron"
  | "filter"
  | "refresh"
  | "star"
  | "calendar"
  | "archive"
  | "trash"
  | "restore"
  | "close";
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const shapes: Record<IconName, ReactNode> = {
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 2" />
      </>
    ),
    send: (
      <>
        <path d="m21 3-8 18-2.5-7.5L3 11z" />
        <path d="M10.5 13.5 21 3" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    back: <path d="M20 12H4m7-7-7 7 7 7" />,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    paperclip: (
      <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.5-9.5a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9" />
    ),
    chevron: <path d="m5 9 7 7 7-7" />,
    filter: <path d="M3 4h18l-7 8v7l-4 2v-9z" />,
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.4 9a7 7 0 0 1 12-2L20 12M4 12l2.6 5a7 7 0 0 0 12-2" />
      </>
    ),
    star: <path d="m12 2 3.1 6.4 7 .9-5 5 .9 7-6-3.3-6 3.3.9-7-5-5 7-.9z" />,
    archive: <><path d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    restore: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}
export function Avatar({ user }: { user: User }) {
  return user.avatar_url ? (
    <img
      className="avatar"
      src={user.avatar_url}
      alt=""
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="avatar avatar-fallback">
      {user.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
export function recipientName(email: string) {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}
export function emailsFromText(text: string) {
  return Array.from(
    new Set(
      (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map(
        (value) => value.toLowerCase(),
      ),
    ),
  );
}
export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
