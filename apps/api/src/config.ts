import "dotenv/config";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "replace-me")
) {
  throw new Error("A unique SESSION_SECRET is required in production");
}
export const config = {
  port: Number(process.env.PORT ?? 4000),
  webUrl: process.env.WEB_URL ?? "http://localhost:5173",
  db:
    process.env.DATABASE_URL ??
    "postgres://reachinbox:reachinbox@localhost:5432/reachinbox",
  redis: process.env.REDIS_URL ?? "redis://localhost:6379",
  elastic: process.env.ELASTICSEARCH_URL ?? "http://localhost:9200",
  sessionSecret: process.env.SESSION_SECRET ?? "development-secret-change-me",
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
  minDelay: Number(process.env.MIN_SEND_DELAY_MS ?? 2000),
  hourlyLimit: Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER ?? 200),
};
if (
  !Number.isInteger(config.concurrency) ||
  config.concurrency < 1 ||
  !Number.isInteger(config.minDelay) ||
  config.minDelay < 0 ||
  !Number.isInteger(config.hourlyLimit) ||
  config.hourlyLimit < 1
) {
  throw new Error(
    "Invalid worker concurrency, minimum send delay, or hourly limit",
  );
}
