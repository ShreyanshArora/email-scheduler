import IORedis from 'ioredis'; import { Queue } from 'bullmq'; import { config } from './config';
export const connection = new IORedis(config.redis, { maxRetriesPerRequest: null });
export const emailQueue = new Queue('email-send', { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 30000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
export type EmailJob = { emailId: string };
