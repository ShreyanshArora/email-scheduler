import { readFileSync, writeFileSync, renameSync, chmodSync, chownSync, statSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const envPath = process.argv[2];
if (!envPath) throw new Error("Usage: node deploy/rotate-ethereal.mjs PATH_TO_PRIVATE_ENV");
const require = createRequire(existsSync("/app/apps/api/package.json") ? "/app/apps/api/package.json" : new URL("../apps/api/package.json", import.meta.url));
const nodemailer = require("nodemailer");
const source = readFileSync(envPath, "utf8");
const env = Object.fromEntries(source.split(/\r?\n/).filter(line => line && !line.startsWith("#") && line.includes("=")).map(line => {
  const index = line.indexOf("=");
  const value = line.slice(index + 1);
  return [line.slice(0, index), /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value];
}));
const previous = env.SMTP_ACCOUNTS_JSON ? JSON.parse(env.SMTP_ACCOUNTS_JSON) : {};
const oldSenders = [...new Set([env.SMTP_USER, ...(env.SMTP_SENDERS ?? "").split(","), ...Object.keys(previous)].filter(Boolean).map(value => value.toLowerCase()))];
const fresh = [];
for (let index = 0; index < 3; index++) {
  const response = await fetch("https://api.nodemailer.com/user", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestor: "reachinbox-email-scheduler", version: "1" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Ethereal account API returned ${response.status}`);
  const account = await response.json();
  if (!account.user || !account.pass) throw new Error("Ethereal did not return SMTP credentials");
  const auth = { user: account.user, pass: account.pass };
  await nodemailer.createTransport({ host: env.SMTP_HOST || "smtp.ethereal.email", port: Number(env.SMTP_PORT || 587), secure: Number(env.SMTP_PORT || 587) === 465, requireTLS: env.SMTP_REQUIRE_TLS !== "false", auth, connectionTimeout: 15000 }).verify();
  fresh.push(auth);
}
const accounts = Object.fromEntries(fresh.map(account => [account.user.toLowerCase(), account]));
oldSenders.forEach((sender, index) => { accounts[sender] = fresh[index % fresh.length]; });
const updates = {
  SMTP_USER: fresh[0].user,
  SMTP_PASS: fresh[0].pass,
  SMTP_SENDERS: fresh.slice(1).map(account => account.user).join(","),
  SMTP_ACCOUNTS_JSON: JSON.stringify(accounts),
};
let content = source;
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}
const temporary = `${envPath}.tmp-${process.pid}`;
const { uid, gid } = statSync(envPath);
writeFileSync(temporary, content, { mode: 0o600 });
chmodSync(temporary, 0o600);
if (process.getuid?.() === 0) chownSync(temporary, uid, gid);
renameSync(temporary, envPath);
console.log(`Verified and configured ${fresh.length} new Ethereal accounts. ${oldSenders.length} previous sender addresses remain mapped for queued jobs. Credentials were not printed.`);
