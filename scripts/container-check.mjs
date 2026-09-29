import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
const local=dotenv.parse(readFileSync('apps/api/.env'));
const directory=mkdtempSync(join(tmpdir(),'outbox-container-check-'));
const envPath=join(directory,'production.env');
const project=`outbox-check-${randomBytes(3).toString('hex')}`;
const env={...local,APP_ENV_FILE:envPath,POSTGRES_PASSWORD:randomBytes(24).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex'),PUBLIC_URL:'https://localhost',WEB_PORT:'0'};
writeFileSync(envPath,Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n'),{mode:0o600});
const args=['compose','-p',project,'--env-file',envPath,'-f','compose.production.yml'];
function compose(extra){const r=spawnSync('docker',[...args,...extra],{encoding:'utf8',maxBuffer:30*1024*1024});if(r.status!==0)throw new Error(`Compose ${extra[0]} failed: ${r.stderr.slice(-3000)}`);return r.stdout.trim();}
let result={checkedAt:new Date().toISOString(),passed:[]};
try {
  console.log('Building and starting an isolated production container stack…');
  compose(['up','--build','-d']);
  const address=compose(['port','web','80']);const base=`http://${address}`;
  for(let i=0;i<60;i++){try{const response=await fetch(base+'/health');if(response.ok)break;}catch{}await sleep(1000);}
  assert.equal((await fetch(base+'/health')).status,200);
  const login=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https'},body:JSON.stringify({name:'Container Test',email:'container@example.test',password:'Container-Test!2026'})});
  assert.equal(login.status,201);assert.match(login.headers.get('set-cookie'),/Secure/i);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,'Content-Type':'application/json','X-Forwarded-Proto':'https'};
  const settings=await fetch(base+'/api/settings',{headers}).then(r=>r.json());
  // Give Elasticsearch time to finish its cold startup before indexing the campaign.
  for(let i=0;i<45;i++){try{compose(['exec','-T','elasticsearch','curl','-fsS','http://localhost:9200/_cluster/health']);break;}catch{}await sleep(1000);}
  const response=await fetch(base+'/api/emails/schedule',{method:'POST',headers:{...headers,'Idempotency-Key':'container-restart'},body:JSON.stringify({recipients:['container-recipient@example.test'],subject:'Production container restart test',body:'Ethereal-only container verification.',sender:settings.default_sender,startsAt:new Date(Date.now()+15000).toISOString(),delayMs:2000,hourlyLimit:200})});
  assert.equal(response.status,201);const campaign=await response.json();
  compose(['restart','api','worker']);
  let sent;
  for(let i=0;i<60;i++){await sleep(1000);try{const list=await fetch(base+'/api/emails?status=sent,failed',{headers}).then(r=>r.json());sent=list.find(e=>e.id===campaign.emails[0].id);if(sent)break;}catch{}}
  assert.equal(sent?.status,'sent',sent?.error||'Container worker did not send');assert(sent.preview_url);
  result.passed=['production images build','migration and service startup','Nginx API proxy','secure production session cookie','PostgreSQL/Redis/Elasticsearch networking','container API/worker restart preserves future mail','container worker sends through Ethereal'];
  result.outcome='passed';console.log('PASS: isolated production stack, secure session, restart survival and real Ethereal delivery');
} catch(error){result.outcome='failed';result.error=error.message;throw error;}
finally {console.log('Removing only the isolated verification stack and its test volumes.');try{compose(['down','-v','--remove-orphans']);}finally{rmSync(directory,{recursive:true,force:true});writeFileSync('container-verification.json',JSON.stringify(result,null,2)+'\n');}}
