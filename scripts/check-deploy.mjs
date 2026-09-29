import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
let env;
try { env=dotenv.parse(readFileSync('.env.production')); }
catch { console.error('Create .env.production from .env.production.example first.'); process.exit(1); }
const errors=[];
for(const name of ['POSTGRES_PASSWORD','PUBLIC_URL','SESSION_SECRET','SMTP_USER','SMTP_PASS','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SLACK_CLIENT_ID','SLACK_CLIENT_SECRET']) {
  if(!env[name] || /replace-|example\.com/.test(env[name])) errors.push(`${name} is missing or still a placeholder.`);
}
if(env.PUBLIC_URL&&!/^https:\/\/[^/]+\/?$/.test(env.PUBLIC_URL)) errors.push('PUBLIC_URL must be an HTTPS origin, without a path.');
if(env.SESSION_SECRET&&env.SESSION_SECRET.length<32) errors.push('SESSION_SECRET must be at least 32 characters.');
if(env.POSTGRES_PASSWORD&&!/^[A-Za-z0-9_-]+$/.test(env.POSTGRES_PASSWORD)) errors.push('POSTGRES_PASSWORD must use URL-safe letters, digits, underscores or hyphens.');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log('Production configuration is populated. Register these exact redirect URLs before deployment:');
console.log(`${env.PUBLIC_URL.replace(/\/$/,'')}/auth/google/callback`);
console.log(`${env.PUBLIC_URL.replace(/\/$/,'')}/auth/slack/callback`);
