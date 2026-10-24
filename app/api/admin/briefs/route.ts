import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "Forbidden." }, { status: 403 });
  return Response.json({ briefs: await query("SELECT * FROM collection_briefs ORDER BY created_at DESC") });
}
