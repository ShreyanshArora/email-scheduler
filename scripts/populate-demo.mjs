import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({path:'apps/api/.env'});
if (process.env.NODE_ENV==='production') throw new Error('Demo population is only for local development.');
const base=`http://localhost:${process.env.PORT||4000}`;
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'demo-ui-check@example.test',password:'TemporaryDemo!2026'})});
if(!login.ok) throw new Error('Run npm run demo:seed before populating the demo mailbox.');
const cookie=login.headers.get('set-cookie').split(';')[0];
const settings=await fetch(base+'/api/settings',{headers:{Cookie:cookie}}).then(r=>r.json());
const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(10,0,0,0);
const campaigns=[
  {key:'welcome',count:15,subject:'Welcome to the Outbox scheduler demo',sender:settings.default_sender,start:new Date(Date.now()+3000),limit:200},
  {key:'rate-demo',count:8,subject:'Sales follow-up · hourly limit demo',sender:settings.senders.find(s=>s==='sales@example.test')||settings.default_sender,start:new Date(Date.now()+3000),limit:3},
  {key:'tomorrow',count:30,subject:'Tomorrow’s product update',sender:settings.senders.find(s=>s==='support@example.test')||settings.default_sender,start:tomorrow,limit:200},
];
for(const campaign of campaigns){
  const response=await fetch(base+'/api/emails/schedule',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':`local-demo-v3-${campaign.key}`},body:JSON.stringify({
    recipients:Array.from({length:campaign.count},(_,i)=>`${campaign.key}${String(i+1).padStart(2,'0')}@example.test`),subject:campaign.subject,
    body:'Hello! This is an Ethereal-only demo message. It demonstrates persistent scheduling, searchable mail, attachments, and per-sender rate limits. You can archive, restore, or move this message to Trash.',
    bodyHtml:'<p>Hello!</p><p>This is an <b>Ethereal-only demo message</b>.</p><blockquote>Persistent scheduling, searchable mail, attachments, and per-sender rate limits.</blockquote><p>You can archive, restore, or move this message to Trash.</p>',
    sender:campaign.sender,startsAt:campaign.start.toISOString(),delayMs:2000,hourlyLimit:Math.min(campaign.limit,settings.max_hourly_limit),
    attachments:campaign.key==='welcome'?[{name:'demo-attachment.txt',type:'text/plain',content:readFileSync('demo-attachment.txt').toString('base64')}]:[],
  })});
  const result=await response.json(); if(!response.ok) throw new Error(JSON.stringify(result));
  console.log(`${result.idempotent?'Already populated':'Scheduled'}: ${campaign.count} emails — ${campaign.subject}`);
}
console.log('Open http://localhost:5173. The first campaign sends gradually; five sales messages defer when the limit of three is reached, and 30 remain scheduled for tomorrow.');
