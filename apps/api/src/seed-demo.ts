import "dotenv/config";
import { randomUUID } from "crypto";
import { db } from "./db";
import { config } from "./config";
import { hashPassword } from "./password";

const host = new URL(config.db).hostname;
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("The demo account can only be seeded into a local development database.");
}

const email = "demo-ui-check@example.test";
const password = "TemporaryDemo!2026";
async function main() {
  try {
    await db.query(
      `INSERT INTO tenants(id,email,name,password_hash)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash, name=EXCLUDED.name`,
      [randomUUID(), email, "Oliver Brown", await hashPassword(password)],
    );
    console.log(`Local demo login: ${email} / ${password}`);
  } finally {
    await db.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
