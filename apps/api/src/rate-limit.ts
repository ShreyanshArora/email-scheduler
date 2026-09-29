import { connection } from "./queue";
import { config } from "./config";
// Atomic reservation: 0 = allowed, -1 = allowed and hourly limit reached,
// positive = milliseconds until the next UTC hour.
const LUA = `local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('PEXPIRE',KEYS[1],ARGV[2]) end; if count<=tonumber(ARGV[1]) then if count==tonumber(ARGV[1]) then return -1 end; return 0 end; redis.call('DECR',KEYS[1]); return tonumber(ARGV[2])`;
export async function reserveSend(
  tenantId: string,
  sender: string,
  limit = config.hourlyLimit,
) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
  const ttl = next.getTime() - now.getTime();
  return Number(
    await connection.eval(
      LUA,
      1,
      `email-rate:${tenantId}:${sender.toLowerCase()}:${now.toISOString().slice(0, 13)}`,
      Math.min(limit, config.hourlyLimit),
      ttl,
    ),
  );
}
const GAP_LUA = `local now=tonumber(ARGV[1]); local gap=tonumber(ARGV[2]); if gap<=0 then return 0 end; local last=tonumber(redis.call('GET',KEYS[1]) or '0'); local slot=math.max(now,last); redis.call('SET',KEYS[1],slot+gap,'PX',math.max(gap*2,slot-now+gap+1000)); return slot-now`;
export async function reserveSendGap() {
  return Number(
    await connection.eval(
      GAP_LUA,
      1,
      "email-send:next-slot",
      Date.now(),
      config.minDelay,
    ),
  );
}
