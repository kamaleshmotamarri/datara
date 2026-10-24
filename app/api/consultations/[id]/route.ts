import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";

export async function PATCH(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const rows = await query(
    `UPDATE consultations
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND owner_user_id = $2 AND status = 'scheduled'
     RETURNING id`,
    [id, user.id],
  );
  if (!rows.length) return Response.json({ error: "Appointment not found." }, { status: 404 });
  return Response.json({ ok: true });
}
