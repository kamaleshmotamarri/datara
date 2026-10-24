import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const rows = await query(
    "SELECT id, public_run_id, status, framework, dataset_url, spec, cleaning_summary, metrics, baseline_metrics, artifacts, error_message, created_at FROM training_runs WHERE id = $1 AND owner_user_id = $2",
    [id, user.id],
  );
  return rows[0] ? Response.json({ training: rows[0] }) : Response.json({ error: "Not found." }, { status: 404 });
}
