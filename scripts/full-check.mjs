import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
dotenv.config({path:'apps/api/.env'});
const db = new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis = new Redis(process.env.REDIS_URL);
const queue = new Queue('email-send',{connection:redis});
const base = `http://localhost:${process.env.PORT||4000}`;
const report=[]; const passed=message=>{report.push(message); console.log(`PASS: ${message}`);};
const tenants=[]; let cookie; let workerPids=[]; let restartManaged=false; let successful=false;
const workerLog=openSync('/tmp/outbox-full-check-worker.log','a');
function startWorker() {
  const child=spawn(process.execPath,['dist/worker.js'],{cwd:new URL('../apps/api/',import.meta.url),detached:true,stdio:['ignore',workerLog,workerLog]});
  child.unref(); return child.pid;
}
async function register() {
  const response=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Full integration check',email:`verify-${randomUUID()}@example.test`,password:`Test-${randomUUID()}`})});
  assert.equal(response.status,201); const token=response.headers.get('set-cookie').split(';')[0];
  const profile=await fetch(base+'/api/me',{headers:{Cookie:token}}).then(r=>r.json()); tenants.push(profile.id); return token;
}
async function request(path,options={}) {
  const response=await fetch(base+path,{...options,headers:{Cookie:cookie,'Content-Type':'application/json',...options.headers}});
  const body=await response.json().catch(()=>null); assert(response.ok,`${path}: ${response.status} ${JSON.stringify(body)}`); return body;
}
async function schedule(overrides={}) {
  return request('/api/emails/schedule',{method:'POST',headers:{'Idempotency-Key':randomUUID()},body:JSON.stringify({recipients:['recipient@example.test'],subject:'Full integration check',body:'Safe Ethereal-only verification.',sender:process.env.SMTP_USER,startsAt:new Date(Date.now()+3600000).toISOString(),delayMs:0,hourlyLimit:200,...overrides})});
}
async function terminal(ids) {
  for(let i=0;i<60;i++) {const {rows}=await db.query('SELECT * FROM emails WHERE id=ANY($1::uuid[])',[ids]);
    if(rows.every(r=>['sent','failed'].includes(r.status))) {assert(rows.every(r=>r.status==='sent'),JSON.stringify(rows.map(r=>({status:r.status,error:r.error}))));return rows;} await sleep(1000);}
  throw new Error('Timed out waiting for delivery');
}
try {
  if(process.env.RESTART_WORKER_PID) {
    process.kill(Number(process.env.RESTART_WORKER_PID),'SIGTERM'); restartManaged=true;
    await sleep(600); workerPids=[startWorker(),startWorker()]; await sleep(1200);
  }
  cookie=await register(); const tenant=tenants[0]; const secondCookie=await register();
  assert.equal((await fetch(base+'/api/emails')).status,401);
  passed('unauthenticated mailbox access is rejected');
  const boundary={name:'boundary.txt',type:'text/plain',content:Buffer.alloc(5*1024*1024,65).toString('base64')};
  const exact=await schedule({attachments:[boundary]}); assert.equal(exact.count,1);
  const tooLarge=await fetch(base+'/api/emails/schedule',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({recipients:['test@example.test'],subject:'Too large',body:'Size check',sender:process.env.SMTP_USER,startsAt:new Date().toISOString(),attachments:[{...boundary,content:Buffer.alloc(5*1024*1024+1).toString('base64')}]})});
  assert.equal(tooLarge.status,413); passed('5 MB attachment accepted; 5 MB + 1 byte rejected');
  const id=exact.emails[0].id;
  await request(`/api/emails/${id}/mailbox`,{method:'PATCH',body:JSON.stringify({mailbox:'archived'})});
  assert((await request('/api/emails?mailbox=archived')).some(e=>e.id===id));
  assert(!(await request('/api/emails')).some(e=>e.id===id));
  await request(`/api/emails/${id}/mailbox`,{method:'PATCH',body:JSON.stringify({mailbox:'trash'})});
  assert((await request('/api/emails?mailbox=trash')).some(e=>e.id===id));
  const {rows:[trashed]}=await db.query('SELECT bull_job_id FROM emails WHERE id=$1',[id]);
  assert.equal(await queue.getJob(trashed.bull_job_id),undefined);
  await request(`/api/emails/${id}/mailbox`,{method:'PATCH',body:JSON.stringify({mailbox:'inbox'})});
  const {rows:[restored]}=await db.query('SELECT bull_job_id FROM emails WHERE id=$1',[id]);
  assert.equal(await (await queue.getJob(restored.bull_job_id)).getState(),'delayed');
  await request(`/api/emails/${id}/star`,{method:'PATCH',body:JSON.stringify({starred:true})});
  assert.equal((await request('/api/emails?mailbox=all&starred=true')).length,1);
  assert.equal((await fetch(base+`/api/emails/${id}/attachments/0`,{headers:{Cookie:secondCookie}})).status,404);
  passed('archive, trash cancellation, restore/requeue, starred filtering and tenant isolation');
  const file={name:'verification.txt',type:'text/plain',content:Buffer.from('Verified attachment bytes').toString('base64')};
  const sent=await schedule({recipients:['one@example.test','two@example.test','three@example.test'],startsAt:new Date(Date.now()+3000).toISOString(),bodyHtml:'<p><b>Formatted email</b></p><script>alert(1)</script>',attachments:[file]});
  const sentRows=await terminal(sent.emails.map(e=>e.id));
  assert(sentRows.every(e=>e.preview_url&&e.send_attempts===1&&!e.body_html.includes('<script')));
  const download=await fetch(base+`/api/emails/${sentRows[0].id}/attachments/0`,{headers:{Cookie:cookie}});
  assert.equal(await download.text(),'Verified attachment bytes');
  const starts=sentRows.map(e=>new Date(e.send_attempted_at).getTime()).sort((a,b)=>a-b);
  for(let i=1;i<starts.length;i++) assert(starts[i]-starts[i-1]>=Number(process.env.MIN_SEND_DELAY_MS||2000)-250,'Global send spacing was violated');
  passed('real HTML + attachment SMTP delivery, sanitized HTML, download, and cross-worker spacing');
  const duplicate=sentRows[0];
  await queue.add('send',{emailId:duplicate.id},{jobId:`${duplicate.id}-duplicate-check`}); await sleep(2000);
  assert.equal((await db.query('SELECT send_attempts FROM emails WHERE id=$1',[duplicate.id])).rows[0].send_attempts,1);
  passed('duplicate queue job does not trigger a second SMTP attempt');
  if(restartManaged) {
    const future=await schedule({startsAt:new Date(Date.now()+9000).toISOString(),sender:'sales@example.test',subject:'Restart survival'});
    for(const pid of workerPids) process.kill(pid,'SIGTERM'); workerPids=[]; await sleep(1500);
    assert.equal((await db.query('SELECT status FROM emails WHERE id=$1',[future.emails[0].id])).rows[0].status,'scheduled');
    workerPids=[startWorker(),startWorker()]; const rows=await terminal([future.emails[0].id]); assert.equal(rows[0].send_attempts,1);
    passed('two-worker restart preserves future job and sends once from a second sender');
  }
  if (restartManaged) {
    const orphan = await schedule({ subject: 'Queue insertion recovery', startsAt: new Date(Date.now()+120000).toISOString() });
    const orphanId = orphan.emails[0].id;
    await (await queue.getJob(orphanId)).remove();
    await db.query('UPDATE emails SET bull_job_id=NULL WHERE id=$1',[orphanId]);
    let repaired;
    for(let i=0;i<40;i++) {
      const {rows:[row]}=await db.query('SELECT bull_job_id FROM emails WHERE id=$1',[orphanId]);
      repaired=row.bull_job_id && await queue.getJob(row.bull_job_id);
      if(repaired)break; await sleep(1000);
    }
    assert(repaired,'Missing queue job was not repaired by maintenance');
    assert.equal(await repaired.getState(),'delayed');
    passed('committed email with missing Redis job repairs automatically without a restart');
  }
  const started=Date.now();
  const load=await schedule({recipients:Array.from({length:1000},(_,i)=>`load${i}@example.test`),subject:'1000-job load check',startsAt:new Date(Date.now()+7200000).toISOString()});
  assert.equal(load.count,1000);
  const rows=await db.query('SELECT count(*)::int AS count FROM emails WHERE tenant_id=$1 AND subject=$2',[tenant,'1000-job load check']); assert.equal(rows.rows[0].count,1000);
  assert.equal(await (await queue.getJob(load.emails[999].id)).getState(),'delayed');
  const counts=await request('/api/email-counts'); assert(counts.scheduled>=1000);
  assert.equal((await request('/api/emails?offset=900')).length,100);
  passed(`1000 delayed jobs persisted, paginated and counted in ${Date.now()-started} ms`);
  await request('/api/slack/disconnect',{method:'POST'});
  assert.equal((await request('/api/me')).slack_connected,false);
  await request('/auth/logout',{method:'POST'}); assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,401);
  passed('Slack disconnect and logout revoke local connection/session'); successful=true;
} finally {
  const {rows}=await db.query('SELECT id,bull_job_id FROM emails WHERE tenant_id=ANY($1::uuid[])',[tenants]);
  for(let offset=0;offset<rows.length;offset+=40) await Promise.all(rows.slice(offset,offset+40).map(async e=>{
    for(const jobId of [e.bull_job_id,`${e.id}-duplicate-check`]) {const job=jobId&&await queue.getJob(jobId); if(job)await job.remove().catch(()=>{});}
  }));
  if(rows.length) await fetch(`${process.env.ELASTICSEARCH_URL}/_bulk`,{method:'POST',headers:{'Content-Type':'application/x-ndjson'},body:rows.map(e=>JSON.stringify({delete:{_index:'emails',_id:e.id}})).join('\n')+'\n'});
  await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
  if(restartManaged) {for(const pid of workerPids) {try{process.kill(pid,'SIGTERM');}catch{}} await sleep(500); writeFileSync('/tmp/outbox-worker.pid',String(startWorker()));}
  await queue.close();await redis.quit();await db.end();
  writeFileSync('verification-results.json',JSON.stringify({checkedAt:new Date().toISOString(),outcome:successful?'passed':'failed',passed:report},null,2)+'\n');
}
