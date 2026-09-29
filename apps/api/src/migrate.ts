import { db } from './db';
async function main() { await db.query(`CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, avatar_url text, slack_access_token text, slack_team_id text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS emails (id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, sender text NOT NULL, hourly_limit integer NOT NULL DEFAULT 200, scheduled_at timestamptz NOT NULL, sent_at timestamptz, status text NOT NULL CHECK(status IN ('scheduled','sending','sent','failed')), error text, bull_job_id text UNIQUE, created_at timestamptz DEFAULT now());
ALTER TABLE emails ADD COLUMN IF NOT EXISTS hourly_limit integer NOT NULL DEFAULT 200;
CREATE INDEX IF NOT EXISTS emails_tenant_status_schedule ON emails(tenant_id,status,scheduled_at);`); console.log('Migration complete'); await db.end(); }
main().catch(e => { console.error(e); process.exit(1); });
