import { z } from "zod";
import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";

const patch = z.object({
  admin_notes: z.string().max(4000).optional(),
  state: z.enum(["Pending_Review", "Under_Collection", "Fulfilled"]).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return Response.json({ error: "Invalid." }, { status: 400 });
  const rows = await query(
    `UPDATE collection_briefs SET admin_notes = COALESCE($2, admin_notes), state = COALESCE($3, state), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, parsed.data.admin_notes ?? null, parsed.data.state ?? null],
  );
  return rows[0] ? Response.json({ brief: rows[0] }) : Response.json({ error: "Not found." }, { status: 404 });
}
