import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { writeFileSync, unlinkSync } from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
async function portFree(port) {
  return new Promise(resolve => { const server=net.createServer(); server.once('error',()=>resolve(false)); server.listen(port,()=>server.close(()=>resolve(true))); });
}
for (const port of [4000,5173]) {
  if (!await portFree(port)) { console.error(`Port ${port} is in use. Stop the existing local project before starting the demo.`); process.exit(1); }
}
writeFileSync(root+'.demo-server.pid',String(process.pid),{mode:0o600});
const children = [
  spawn(process.execPath,['dist/index.js'],{cwd:root+'apps/api',stdio:'inherit'}),
  spawn(process.execPath,['dist/worker.js'],{cwd:root+'apps/api',stdio:'inherit'}),
  spawn(process.execPath,[root+'node_modules/vite/bin/vite.js','--port','5173','--strictPort','--clearScreen','false'],{cwd:root+'apps/web',stdio:'inherit'}),
];
console.log('\nOUTBOX DEMO · http://localhost:5173\nAPI + worker + frontend are running.\nCtrl+C stops all three safely; PostgreSQL and Redis keep your mail.\nUp arrow, Enter runs this command again to resume queued delivery.\n');
let stopping=false;
async function stop(code=0) {
  if(stopping)return;stopping=true;
  console.log('\nStopping the app; waiting for active email delivery to finish…');
  await Promise.all(children.map(child=>new Promise(resolve=>{
    if(child.exitCode!==null || child.signalCode!==null)return resolve();
    child.once('exit',resolve);child.kill('SIGTERM');
  })));
  try { unlinkSync(root+'.demo-server.pid'); } catch {}
  console.log('App stopped. Persistent jobs and mail history are retained.');process.exit(code);
}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
for(const child of children){child.on('error',error=>{console.error(error.message);void stop(1);});child.on('exit',()=>{if(!stopping){console.error('A required service stopped. Stopping the other app processes.');void stop(1);}});}
