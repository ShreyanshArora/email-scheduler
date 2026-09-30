import { readFileSync, writeFileSync, renameSync, chmodSync, chownSync, statSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("Usage: node deploy/provision-ethereal.mjs PATH_TO_PRIVATE_ENV");
const source = readFileSync(path, "utf8");
const env = Object.fromEntries(source.split(/\r?\n/).filter(line => line && !line.startsWith("#") && line.includes("=")).map(line => {
  const index = line.indexOf("=");
  const value = line.slice(index + 1);
  return [line.slice(0, index), /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value];
}));
if (!env.SMTP_USER || !env.SMTP_PASS) throw new Error("The first Ethereal SMTP account must already be configured.");
const existing = env.SMTP_ACCOUNTS_JSON ? JSON.parse(env.SMTP_ACCOUNTS_JSON) : {};
const accounts = { [env.SMTP_USER.toLowerCase()]: { user: env.SMTP_USER, pass: env.SMTP_PASS }, ...existing };
while (Object.keys(accounts).length < 3) {
  const response = await fetch("https://api.nodemailer.com/user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestor: "reachinbox-email-scheduler", version: "1" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Ethereal account API returned ${response.status}`);
  const created = await response.json();
  if (!created.user || !created.pass) throw new Error("Ethereal did not return SMTP credentials.");
  accounts[created.user.toLowerCase()] = { user: created.user, pass: created.pass };
}
const senders = Object.keys(accounts);
const updates = { SMTP_SENDERS: senders.slice(1).join(","), SMTP_ACCOUNTS_JSON: JSON.stringify(accounts) };
let content = source;
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}
const temp = `${path}.tmp-${process.pid}`;
const { uid, gid } = statSync(path);
writeFileSync(temp, content, { mode: 0o600 });
chmodSync(temp, 0o600);
if (process.getuid?.() === 0) chownSync(temp, uid, gid);
renameSync(temp, path);
console.log(`Configured ${senders.length} independent Ethereal SMTP accounts in ${path}. Credentials were not printed.`);
