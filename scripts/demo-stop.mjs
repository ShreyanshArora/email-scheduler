import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
let pid;
try { pid=Number(readFileSync(new URL('../.demo-server.pid',import.meta.url),'utf8')); }
catch { console.log('No managed demo session to stop.'); process.exit(0); }
let command;
try { command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}); }
catch { console.log('The previous demo session has already stopped.'); process.exit(0); }
if(!command.includes('scripts/demo-server.mjs'))throw Error('PID does not belong to the demo runner; refusing to stop it.');
process.kill(pid,'SIGTERM');
for(let i=0;i<150;i++) { try{process.kill(pid,0);}catch{console.log('Demo session stopped safely.');process.exit(0);} await sleep(1000); }
throw Error('Demo is still draining. Check the existing session before restarting.');
