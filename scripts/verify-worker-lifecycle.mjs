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
const oldPid=Number(process.env.RESTART_WORKER_PID);
assert(oldPid>1,'Pass the PID of the sole local project worker as RESTART_WORKER_PID');
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=new Redis(process.env.REDIS_URL);
const queue=new Queue('email-send',{connection:redis});
const log=openSync('/tmp/outbox-lifecycle-worker.log','a');
let child, tenant; const passed=[];
function start(){ child=spawn(process.execPath,['dist/worker.js'],{cwd:new URL('../apps/api/',import.meta.url),detached:true,stdio:['ignore',log,log]}); child.unref(); writeFileSync('/tmp/outbox-worker.pid',String(child.pid)); }
async function waitFor(fn, timeout=90000){const until=Date.now()+timeout;while(Date.now()<until){const value=await fn();if(value)return value;await sleep(100);}throw Error('Lifecycle test timed out');}
try {
  process.kill(oldPid,'SIGTERM');
  await waitFor(()=>{try{process.kill(oldPid,0);return false;}catch{return true;}});
  const base=`http://localhost:${process.env.PORT||4000}`;
  const response=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`lifecycle-${randomUUID()}@example.test`,name:'Lifecycle check',password:`Verify-${randomUUID()}`})});
  assert.equal(response.status,201);const cookie=response.headers.get('set-cookie').split(';')[0];
  tenant=(await fetch(base+'/api/me',{headers:{Cookie:cookie}}).then(r=>r.json())).id;
  async function schedule(startsAt){const r=await fetch(base+'/api/emails/schedule',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({sender:process.env.SMTP_USER,recipients:['lifecycle@example.test'],subject:'Worker lifecycle verification',body:'Ethereal test only.',startsAt,delayMs:0,hourlyLimit:200})});assert.equal(r.status,201);return (await r.json()).emails[0];}
  const early=await schedule(new Date(Date.now()+15000).toISOString());
  const {rows:[record]}=await db.query('SELECT bull_job_id FROM emails WHERE id=$1',[early.id]);
  await (await queue.getJob(record.bull_job_id)).remove();
  const forced=await queue.add('send',{emailId:early.id},{jobId:`${early.id}-early-test`});
  await db.query('UPDATE emails SET bull_job_id=$2 WHERE id=$1',[early.id,forced.id]);start();
  await waitFor(async()=>await forced.getState()==='delayed');
  assert.equal((await db.query('SELECT status FROM emails WHERE id=$1',[early.id])).rows[0].status,'scheduled');
  await waitFor(async()=>{const row=(await db.query('SELECT status,send_attempts,sent_at,scheduled_at FROM emails WHERE id=$1',[early.id])).rows[0];if(row.status==='sent'){assert.equal(row.send_attempts,1);assert(row.sent_at>=row.scheduled_at);return true;}return false;});
  passed.push('Early queue execution is delayed until DB due time, then sends exactly once');
  const active=await schedule(new Date().toISOString());
  await waitFor(async()=>(await db.query('SELECT status FROM emails WHERE id=$1',[active.id])).rows[0].status==='sending');
  child.kill('SIGTERM');await waitFor(()=>child.exitCode!==null || child.signalCode!==null);
  const row=(await db.query('SELECT status,send_attempts FROM emails WHERE id=$1',[active.id])).rows[0];
  assert.equal(row.status,'sent');assert.equal(row.send_attempts,1);
  passed.push('SIGTERM during active delivery drains SMTP and persists sent before exiting');
  start();await sleep(1500);
  assert.equal((await db.query('SELECT send_attempts FROM emails WHERE id=$1',[active.id])).rows[0].send_attempts,1);
  passed.push('Restart does not resend drained delivery');
  writeFileSync('worker-lifecycle-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),outcome:'passed',passed},null,2)+'\n');
  passed.forEach(v=>console.log('PASS:',v));
} finally {
  if(!child || child.exitCode!==null || child.signalCode!==null)start();
  if(tenant){const {rows}=await db.query('SELECT id FROM emails WHERE tenant_id=$1',[tenant]);for(const row of rows){for(const job of await queue.getJobs(['completed','failed','delayed','waiting']))if(job.data.emailId===row.id)await job.remove();}await db.query('DELETE FROM tenants WHERE id=$1',[tenant]);}
  await queue.close();await redis.quit();await db.end();
}
