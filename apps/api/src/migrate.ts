import { db } from "./db";
async function main() {
  await db.query(`CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, avatar_url text, slack_access_token text, slack_team_id text, slack_webhook_url text, slack_channel text, created_at timestamptz DEFAULT now());
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slack_webhook_url text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slack_channel text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;
CREATE TABLE IF NOT EXISTS campaigns (id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, idempotency_key text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(tenant_id,idempotency_key));
CREATE TABLE IF NOT EXISTS emails (id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, sender text NOT NULL, hourly_limit integer NOT NULL DEFAULT 200, scheduled_at timestamptz NOT NULL, sent_at timestamptz, sending_started_at timestamptz, smtp_message_id text, status text NOT NULL CHECK(status IN ('scheduled','sending','sent','failed')), error text, bull_job_id text UNIQUE, created_at timestamptz DEFAULT now());
ALTER TABLE emails ADD COLUMN IF NOT EXISTS hourly_limit integer NOT NULL DEFAULT 200;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS sending_started_at timestamptz;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS smtp_message_id text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS preview_url text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS body_html text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS send_attempted_at timestamptz;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS send_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS mailbox text NOT NULL DEFAULT 'inbox' CHECK (mailbox IN ('inbox','archived','trash'));
CREATE INDEX IF NOT EXISTS emails_tenant_mailbox ON emails(tenant_id,mailbox);
CREATE INDEX IF NOT EXISTS emails_tenant_status_schedule ON emails(tenant_id,status,scheduled_at);`);
  console.log("Migration complete");
  await db.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
