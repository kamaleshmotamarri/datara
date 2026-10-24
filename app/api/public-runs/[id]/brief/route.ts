import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";

/** Prefilled draft for a gap-found run. The buyer edits it, then saves through POST /api/briefs. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const rows = await query<{ status: string; question: string; gap_summary: string | null; task: { brief?: Record<string, string> } | null }>(
    "SELECT status, question, gap_summary, task FROM public_data_runs WHERE id = $1 AND owner_user_id = $2",
    [id, user.id],
  );
  const run = rows[0];
  if (!run) return Response.json({ error: "Not found." }, { status: 404 });
  if (run.status !== "gap_found") return Response.json({ error: "A draft exists only after a completed search finds a gap." }, { status: 409 });
  const draft = run.task?.brief ?? {};
  return Response.json({
    draft: {
      title: draft.title ?? run.question.slice(0, 100),
      domain: draft.domain ?? "",
      question: draft.question ?? run.question,
      measure: draft.measure ?? "",
      observed: draft.observed ?? "",
      method: draft.method ?? "observation",
      quality_notes: run.gap_summary ?? "",
      origin: "public_data_gap",
      source_run_id: id,
    },
  });
}
