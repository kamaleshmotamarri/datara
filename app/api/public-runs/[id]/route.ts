import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const rows = await query("SELECT * FROM public_data_runs WHERE id = $1 AND owner_user_id = $2", [id, user.id]);
  if (!rows[0]) return Response.json({ error: "Not found." }, { status: 404 });
  const training = await query("SELECT * FROM training_runs WHERE public_run_id = $1 ORDER BY created_at DESC LIMIT 1", [id]);
  return Response.json({ run: rows[0], training: training[0] ?? null });
}
