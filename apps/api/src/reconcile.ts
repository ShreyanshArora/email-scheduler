import { db } from "./db";
import { emailQueue } from "./queue";

// Run at startup. The database is the source of truth if a process stops
// after committing an email row but before adding its Redis job.
export async function reconcileScheduled() {
  const { rows } = await db.query<{
    id: string;
    bull_job_id: string | null;
    scheduled_at: Date;
  }>(
    "SELECT id,bull_job_id,scheduled_at FROM emails WHERE status='scheduled' ORDER BY scheduled_at",
  );
  let repaired = 0;
  for (const row of rows) {
    const existing =
      row.bull_job_id && (await emailQueue.getJob(row.bull_job_id));
    const state = existing && (await existing.getState());
    if (state && !["completed", "failed", "unknown"].includes(state)) continue;
    const job = await emailQueue.add(
      "send",
      { emailId: row.id },
      {
        jobId: `${row.id}-recovered-${Date.now()}`,
        delay: Math.max(0, new Date(row.scheduled_at).getTime() - Date.now()),
      },
    );
    await db.query("UPDATE emails SET bull_job_id=$2 WHERE id=$1", [
      row.id,
      job.id,
    ]);
    repaired++;
  }
  if (repaired) console.log(`Reconciled ${repaired} missing email jobs`);
}
