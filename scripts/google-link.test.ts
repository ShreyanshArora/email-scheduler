import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../apps/api/src/db";
import { findOrCreateGoogleTenant } from "../apps/api/src/google-account";

async function main() {
  const passwordId = randomUUID();
  const email = `google-link-${passwordId}@example.test`;
  const googleOnlyEmail = `google-only-${passwordId}@example.test`;
  try {
  await db.query("INSERT INTO tenants(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
    [passwordId, email, "Password Owner", "existing-password-hash"]);
  const linked = await findOrCreateGoogleTenant({ sub: `google-${passwordId}`, email, name: "Verified Owner" });
  assert.equal(linked, passwordId, "verified Google email must keep the existing account and mailbox");
  const { rows: [account] } = await db.query("SELECT google_sub,password_hash FROM tenants WHERE id=$1", [passwordId]);
  assert.equal(account.google_sub, `google-${passwordId}`);
  assert.equal(account.password_hash, "existing-password-hash", "password sign-in must remain available");
  assert.equal(await findOrCreateGoogleTenant({ sub: `google-${passwordId}`, email }), passwordId);
  await assert.rejects(findOrCreateGoogleTenant({ sub: `other-google-${passwordId}`, email }),
    /different Google account/);
  const googleOnlyId = await findOrCreateGoogleTenant({ sub: `new-google-${passwordId}`, email: googleOnlyEmail });
  assert.notEqual(googleOnlyId, passwordId);
  console.log("PASS: verified Google email links an existing password account, keeps its password, and protects a different Google identity");
  } finally {
    await db.query("DELETE FROM tenants WHERE email=ANY($1::text[])", [[email, googleOnlyEmail]]);
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
