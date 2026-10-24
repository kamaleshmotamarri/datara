import { after } from "next/server";
import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";
import { runTrainingJob } from "@/app/lib/server/training";
import type { DatasetResult } from "@/app/lib/server/public-data";

export const maxDuration = 60;

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const rows = await query<{ question: string; datasets: DatasetResult[]; status: string }>(
    "SELECT question, datasets, status FROM public_data_runs WHERE id = $1 AND owner_user_id = $2",
    [id, user.id],
  );
  const run = rows[0];
  if (!run) return Response.json({ error: "Not found." }, { status: 404 });
  const pick =
    run.datasets.find((d) => d.suitability === "viable" && d.source === "hugging_face" && d.csv_file) ??
    run.datasets.find((d) => d.suitability === "viable" && d.source === "kaggle");
  if (!pick || !pick.ref) {
    return Response.json({ error: "No viable dataset with a CSV file to train on." }, { status: 422 });
  }
  const busy = await query("SELECT 1 FROM training_runs WHERE owner_user_id = $1 AND status IN ('queued','running') LIMIT 1", [user.id]);
  if (busy.length) return Response.json({ error: "You already have a training job queued or running." }, { status: 429 });
  const created = await query<{ id: string }>(
    "INSERT INTO training_runs (public_run_id, owner_user_id, dataset_url, job) VALUES ($1,$2,$3,$4) RETURNING id",
    [id, user.id, pick.url, JSON.stringify({ dataset_id: pick.ref, csv_file: pick.csv_file ?? "", question: run.question, source: pick.source })],
  );
  const tid = created[0].id;
  await query("UPDATE public_data_runs SET status='training', training_run_id=$2, selected_dataset_url=$3, updated_at=now() WHERE id=$1", [id, tid, pick.url]);
  // On Vercel the job stays queued for the local worker (`npm run worker`).
  // Locally, with no worker needed, it runs right away.
  if (!process.env.VERCEL) after(() => runTrainingJob(tid));
  return Response.json({ training_run_id: tid, queued_for_worker: Boolean(process.env.VERCEL) }, { status: 202 });
}
