import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

dotenv.config({ path: 'apps/api/.env' });
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const queue = new Queue('email-send', { connection: redis });
const api = `http://localhost:${process.env.PORT ?? 4000}`;
const tenantId = randomUUID();
const sid = randomUUID();
const secret = process.env.SESSION_SECRET;
const signed = `${sid}.${createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '')}`;
const cookie = `reachinbox.sid=${encodeURIComponent('s:' + signed)}`;
let emailId;
let passwordTenantId;
let webhookServer;
const notifications = [];

async function request(path, options = {}) {
  const response = await fetch(api + path, {
    ...options,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', ...options.headers }
  });
  const data = await response.json().catch(() => null);
  assert(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

try {
  const loginEmail = `auth-${randomUUID()}@example.test`;
  const password = `Smoke-${randomUUID()}`;
  const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail, name: 'Smoke Login', password }) });
  assert.equal(registered.status, 201);
  const registeredCookie = registered.headers.get('set-cookie')?.split(';')[0];
  assert(registeredCookie);
  const registeredProfile = await fetch(api + '/api/me', { headers: { Cookie: registeredCookie } });
  assert.equal(registeredProfile.status, 200);
  passwordTenantId = (await registeredProfile.json()).id;
  const rejected = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail, password: 'wrong-password' }) });
  assert.equal(rejected.status, 401);
  const loggedIn = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail, password }) });
  assert.equal(loggedIn.status, 200);
  console.log('PASS: email/password account creation, login, and invalid-password rejection');
  await db.query(
    'INSERT INTO tenants(id,email,name) VALUES($1,$2,$3)',
    [tenantId, `smoke-${tenantId}@example.test`, 'Smoke Test']
  );
  await redis.set(`reachinbox:session:${sid}`, JSON.stringify({
    cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000), httpOnly: true, sameSite: 'lax' },
    tenantId
  }), 'EX', 3600);
  const profile = await request('/api/me');
  assert.equal(profile.id, tenantId);
  const settings = await request('/api/settings');
  assert(settings.max_hourly_limit >= 1);
  assert(settings.senders.includes(process.env.SMTP_USER));
  const board = await fetch(api + '/admin/queues', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(board.status, 200);
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const google = await fetch(api + '/auth/google', { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(google.status, 302);
    const authorize = new URL(google.headers.get('location'));
    assert.equal(authorize.host, 'accounts.google.com');
    assert(authorize.searchParams.get('scope')?.includes('email'));
    console.log('PASS: Google OAuth authorization redirect');
  }
  if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
    const slack = await fetch(api + '/auth/slack', { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(slack.status, 302);
    const authorize = new URL(slack.headers.get('location'));
    assert.equal(authorize.host, 'slack.com');
    assert.equal(authorize.searchParams.get('scope'), 'incoming-webhook');
    console.log('PASS: Slack OAuth authorization redirect');
  }

  const subject = `Scheduler smoke ${tenantId.slice(0, 8)}`;
  const body = JSON.stringify({
    recipients: ['recipient@example.test'],
    subject,
    body: 'Ethereal-only scheduler verification.',
    sender: process.env.SMTP_USER,
    startsAt: new Date(Date.now() + 12000).toISOString(),
    delayMs: 0,
    hourlyLimit: Math.min(2, settings.max_hourly_limit)
  });
  const key = randomUUID();
  const first = await request('/api/emails/schedule', {
    method: 'POST', headers: { 'Idempotency-Key': key }, body
  });
  assert.equal(first.count, 1);
  emailId = first.emails[0].id;
  const repeated = await request('/api/emails/schedule', {
    method: 'POST', headers: { 'Idempotency-Key': key }, body
  });
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.emails[0].id, emailId);

  const scheduled = await request('/api/emails?status=scheduled&q=smoke');
  assert(scheduled.some(email => email.id === emailId));
  const indexedScheduled = await fetch(`${process.env.ELASTICSEARCH_URL}/emails/_doc/${emailId}`);
  assert.equal(indexedScheduled.status, 200);
  assert.equal((await indexedScheduled.json())._source.status, 'scheduled');
  console.log('PASS: authenticated API, delayed schedule, idempotency, and search');

  let final;
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(2000);
    const { rows: [email] } = await db.query(
      'SELECT status,error,smtp_message_id,preview_url FROM emails WHERE id=$1', [emailId]
    );
    if (email.status === 'sent' || email.status === 'failed') { final = email; break; }
  }
  assert(final, 'Email did not reach a terminal state within 50 seconds');
  assert.equal(final.status, 'sent', final.error ?? 'Delivery failed');
  assert(final.smtp_message_id);
  assert(final.preview_url?.startsWith('https://ethereal.email/message/'));
  let sentIndexStatus;
  for (let attempt = 0; attempt < 10; attempt++) {
    const indexedSent = await fetch(`${process.env.ELASTICSEARCH_URL}/emails/_doc/${emailId}`);
    if (indexedSent.ok) sentIndexStatus = (await indexedSent.json())._source.status;
    if (sentIndexStatus === 'sent') break;
    await sleep(200);
  }
  assert.equal(sentIndexStatus, 'sent');
  console.log('PASS: Ethereal SMTP delivery and durable sent record');

  webhookServer = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      notifications.push(JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });
  await new Promise(resolve => webhookServer.listen(0, '127.0.0.1', resolve));
  await db.query('UPDATE tenants SET slack_webhook_url=$1 WHERE id=$2', [
    `http://127.0.0.1:${webhookServer.address().port}/notify`, tenantId
  ]);

  const rateKey = randomUUID();
  const rateResponse = await request('/api/emails/schedule', {
    method: 'POST',
    headers: { 'Idempotency-Key': rateKey },
    body: JSON.stringify({
      recipients: ['rate-one@example.test', 'rate-two@example.test'],
      subject: `Rate limit smoke ${tenantId.slice(0, 8)}`,
      body: 'Ethereal-only rate-limit verification.',
      sender: process.env.SMTP_USER,
      startsAt: new Date(Date.now() + 4000).toISOString(),
      delayMs: 0,
      hourlyLimit: Math.min(2, settings.max_hourly_limit)
    })
  });
  assert.equal(rateResponse.count, 2);
  let statuses;
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(2000);
    const result = await db.query(
      'SELECT status,scheduled_at FROM emails WHERE id=ANY($1::uuid[])',
      [rateResponse.emails.map(email => email.id)]
    );
    statuses = result.rows;
    if (statuses.some(email => email.status === 'sent') &&
        statuses.some(email => email.status === 'scheduled' && new Date(email.scheduled_at).getTime() > Date.now() + 30000)) break;
  }
  if (settings.max_hourly_limit >= 2) {
    assert.equal(statuses.filter(email => email.status === 'sent').length, 1);
    assert.equal(statuses.filter(email => email.status === 'scheduled').length, 1);
    console.log('PASS: per-sender hourly limit defers excess work without dropping it');
    for (let attempt = 0; attempt < 10 && !notifications.length; attempt++) await sleep(200);
    assert.equal(notifications.length, 1, 'Expected one outbound Slack-style webhook POST');
    assert.match(notifications[0].text, /reached its hourly email limit/);
    console.log('PASS: rate-limit notification makes one real HTTP webhook POST');
  }
} finally {
  const { rows: testEmails } = await db.query('SELECT id,bull_job_id FROM emails WHERE tenant_id=$1', [tenantId]);
  for (const email of testEmails) {
    const job = email.bull_job_id && await queue.getJob(email.bull_job_id);
    if (job) await job.remove().catch(() => {});
    await fetch(`${process.env.ELASTICSEARCH_URL}/emails/_doc/${email.id}`, { method: 'DELETE' }).catch(() => {});
  }
  await db.query('DELETE FROM tenants WHERE id=$1', [tenantId]);
  if (passwordTenantId) await db.query('DELETE FROM tenants WHERE id=$1', [passwordTenantId]);
  await redis.del(`reachinbox:session:${sid}`);
  await queue.close();
  await redis.quit();
  await db.end();
  if (webhookServer) await new Promise(resolve => webhookServer.close(resolve));
}
