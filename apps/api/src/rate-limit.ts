import { connection } from "./queue";
import { config } from "./config";
// Reserve both the sender and campaign slots in one Redis operation. A campaign
// using rotating senders must not bypass the limit entered in Compose.
// 0 = allowed, -1 = allowed and a limit reached, positive = defer until next hour.
const LUA = `local sender=tonumber(redis.call('GET',KEYS[1]) or '0'); local campaign=tonumber(redis.call('GET',KEYS[2]) or '0'); local limit=tonumber(ARGV[1]); if sender>=limit or campaign>=limit then return tonumber(ARGV[2]) end; sender=redis.call('INCR',KEYS[1]); if sender==1 then redis.call('PEXPIRE',KEYS[1],ARGV[2]) end; campaign=redis.call('INCR',KEYS[2]); if campaign==1 then redis.call('PEXPIRE',KEYS[2],ARGV[2]) end; if sender==limit or campaign==limit then return -1 end; return 0`;
export async function reserveSend(
  tenantId: string,
  sender: string,
  campaignId: string | null,
  limit = config.hourlyLimit,
) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
  const ttl = next.getTime() - now.getTime();
  return Number(
    await connection.eval(
      LUA,
      2,
      `email-rate:${tenantId}:${sender.toLowerCase()}:${now.toISOString().slice(0, 13)}`,
      `email-campaign-rate:${tenantId}:${campaignId ?? `legacy-${sender.toLowerCase()}`}:${now.toISOString().slice(0, 13)}`,
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
