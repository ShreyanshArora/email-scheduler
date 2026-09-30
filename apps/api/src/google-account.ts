import { randomUUID } from "crypto";
import { db } from "./db";

export type VerifiedGoogleProfile = { sub: string; email: string; name?: string; picture?: string };

// Google has verified control of this email address. Link it to the existing
// password account so both sign-in methods reach the same mailbox and history.
export async function findOrCreateGoogleTenant(profile: VerifiedGoogleProfile): Promise<string> {
  const email = profile.email.trim().toLowerCase();
  const existingGoogle = await db.query<{ id: string }>(
    "UPDATE tenants SET name=$2,avatar_url=$3 WHERE google_sub=$1 RETURNING id",
    [profile.sub, profile.name ?? profile.email, profile.picture ?? null],
  );
  if (existingGoogle.rows[0]) return existingGoogle.rows[0].id;

  const { rows: [tenant] } = await db.query<{ id: string }>(
    `INSERT INTO tenants(id,email,name,avatar_url,google_sub)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(email) DO UPDATE SET
       name=EXCLUDED.name, avatar_url=EXCLUDED.avatar_url, google_sub=EXCLUDED.google_sub
     WHERE tenants.google_sub IS NULL OR tenants.google_sub=EXCLUDED.google_sub
     RETURNING id`,
    [randomUUID(), email, profile.name ?? profile.email, profile.picture ?? null, profile.sub],
  );
  if (!tenant) throw new Error("This email is linked to a different Google account.");
  return tenant.id;
}
