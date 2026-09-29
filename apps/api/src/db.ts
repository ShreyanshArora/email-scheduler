import { Pool } from 'pg';
import { config } from './config';
export const db = new Pool({ connectionString: config.db });
export type EmailRow = { id:string; tenant_id:string; recipient:string; subject:string; body:string; sender:string; hourly_limit:number; scheduled_at:Date; sent_at:Date|null; status:string; error:string|null; bull_job_id:string|null; created_at:Date };
