import { after } from "next/server";
import { z } from "zod";
import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";
import { executePublicRun } from "@/app/lib/server/public-data";

export const maxDuration = 300;

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = await query(
    "SELECT * FROM public_data_runs WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 20",
    [user.id],
  );
  return Response.json({ runs: rows });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = z.object({ question: z.string().trim().min(8).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Describe the question in a sentence or more." }, { status: 400 });
  const rows = await query<{ id: string }>(
    "INSERT INTO public_data_runs (owner_user_id, question) VALUES ($1, $2) RETURNING id",
    [user.id, parsed.data.question],
  );
  const id = rows[0].id;
  after(() => executePublicRun(id, parsed.data.question));
  return Response.json({ id }, { status: 202 });
}
