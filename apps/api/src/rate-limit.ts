import { connection } from './queue'; import { config } from './config';
// Atomic Redis reservation: returns 0 when reserved, or milliseconds until next UTC hour.
const LUA = `local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('PEXPIRE',KEYS[1],ARGV[2]) end; if count<=tonumber(ARGV[1]) then return 0 end; redis.call('DECR',KEYS[1]); return tonumber(ARGV[2]) end`;
export async function reserveSend(sender:string, limit=config.hourlyLimit) { const now=new Date(); const next=new Date(now); next.setUTCHours(now.getUTCHours()+1,0,0,0); const ttl=next.getTime()-now.getTime(); return Number(await connection.eval(LUA, 1, `email-rate:${sender}:${now.toISOString().slice(0,13)}`, limit, ttl)); }
const GAP_LUA=`local now=tonumber(ARGV[1]); local gap=tonumber(ARGV[2]); local last=tonumber(redis.call('GET',KEYS[1]) or '0'); local slot=math.max(now,last); redis.call('SET',KEYS[1],slot+gap,'PX',gap*2); return slot-now`;
export async function reserveSendGap() { return Number(await connection.eval(GAP_LUA,1,'email-send:next-slot',Date.now(),config.minDelay)); }
