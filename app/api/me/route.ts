import { requireUser, unauthorized } from "@/app/lib/server/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return Response.json({ id: user.id, role: user.role });
}
