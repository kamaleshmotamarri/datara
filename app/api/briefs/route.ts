import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";
import { briefInput } from "@/app/lib/server/brief-schema";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = await query(
    "SELECT * FROM collection_briefs WHERE owner_user_id = $1 ORDER BY created_at DESC",
    [user.id],
  );
  return Response.json({ briefs: rows });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = briefInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid brief." }, { status: 400 });
  }
  const b = parsed.data;
  if (b.source_run_id) {
    const owned = await query("SELECT 1 FROM public_data_runs WHERE id = $1 AND owner_user_id = $2", [b.source_run_id, user.id]);
    if (!owned.length) return Response.json({ error: "Run not found." }, { status: 404 });
  }
  // Owner, state, demo flag and notes are server-controlled.
  const rows = await query(
    `INSERT INTO collection_briefs (owner_user_id, origin, source_run_id, title, domain, question, measure, observed,
       sample_count, method, sensor, deliverables, geography, age_min, age_max, desired_date, budget_usd,
       quality_notes, consultation_requested)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [user.id, b.origin, b.source_run_id, b.title, b.domain, b.question, b.measure, b.observed, b.sample_count,
      b.method, b.sensor ? JSON.stringify(b.sensor) : null, JSON.stringify(b.deliverables), b.geography,
      b.age_min, b.age_max, b.desired_date || null, b.budget_usd, b.quality_notes, b.consultation_requested],
  );
  if (b.source_run_id) {
    await query("UPDATE public_data_runs SET brief_id = $2, updated_at = now() WHERE id = $1", [b.source_run_id, rows[0].id as string]);
  }
  return Response.json({ brief: rows[0] }, { status: 201 });
}
