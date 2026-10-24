/**
 * Local training worker. Run on the machine that has Python/PyTorch:
 *   npm run worker
 * It polls Neon for queued training jobs (queued from the Vercel site), runs the
 * reviewed template, and writes metrics back to the same database.
 */
import { query } from "../../app/lib/server/db";
import { runTrainingJob } from "../../app/lib/server/training";

async function claim(): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `UPDATE training_runs SET status = 'running', updated_at = now()
     WHERE id = (SELECT id FROM training_runs WHERE status = 'queued' ORDER BY created_at
                 FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id`,
  );
  return rows[0]?.id ?? null;
}

async function main() {
  console.log("Datara training worker running. Waiting for jobs...");
  // Jobs left 'running' by a crashed worker would block the user forever.
  await query("UPDATE training_runs SET status='failed', error_message='Worker stopped before finishing.', updated_at=now() WHERE status='running'");
  for (;;) {
    try {
      const id = await claim();
      if (id) {
        console.log(`Training ${id}`);
        await runTrainingJob(id);
        console.log(`Finished ${id}`);
        continue;
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
}

main();
