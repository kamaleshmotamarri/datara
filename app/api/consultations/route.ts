import { z } from "zod";
import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";
import { openSlots } from "@/app/lib/consultations";

const bookingInput = z
  .object({
    party: z.enum(["user", "organization"]),
    organization_id: z.string().uuid().nullable().default(null),
    organization: z
      .object({
        name: z.string().trim().min(2).max(120),
        type: z.enum(["individual", "lab", "company", "organization"]),
        description: z.string().trim().max(500).default(""),
      })
      .nullable()
      .default(null),
    topic: z.string().trim().min(8).max(500),
    notes: z.string().trim().max(1000).default(""),
    starts_at: z.string().min(16),
  })
  .superRefine((value, ctx) => {
    if (value.party === "user" && (value.organization_id || value.organization)) {
      ctx.addIssue({ code: "custom", message: "A personal appointment does not include an organization." });
    }
    if (value.party === "organization" && Boolean(value.organization_id) === Boolean(value.organization)) {
      ctx.addIssue({ code: "custom", message: "Choose an organization, or name a new one." });
    }
  });

type AppointmentRow = {
  id: string;
  party: "user" | "organization";
  organization_name: string | null;
  topic: string;
  notes: string;
  starts_at: string | Date;
  ends_at: string | Date;
  status: "scheduled" | "cancelled";
};

function iso(value: string | Date) {
  return new Date(value).toISOString();
}

function present(row: AppointmentRow) {
  return {
    id: row.id,
    party: row.party,
    organization_name: row.organization_name,
    topic: row.topic,
    notes: row.notes,
    starts_at: iso(row.starts_at),
    ends_at: iso(row.ends_at),
    status: row.status,
  };
}

async function ownedAppointments(userId: string) {
  return query<AppointmentRow>(
    `SELECT c.id, c.party, o.name AS organization_name, c.topic, c.notes, c.starts_at, c.ends_at, c.status
     FROM consultations c
     LEFT JOIN organizations o ON o.id = c.organization_id
     WHERE c.owner_user_id = $1
     ORDER BY c.starts_at DESC`,
    [userId],
  );
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const [appointments, organizations, taken] = await Promise.all([
    ownedAppointments(user.id),
    query<{ id: string; name: string; type: string }>(
      `SELECT id, name, type FROM organizations
       WHERE owner_user_id = $1
          OR id = (SELECT organization_id FROM users WHERE id = $1)
       ORDER BY name`,
      [user.id],
    ),
    query<{ starts_at: string | Date }>(
      "SELECT starts_at FROM consultations WHERE status = 'scheduled' AND starts_at > now()",
    ),
  ]);
  return Response.json({
    appointments: appointments.map(present),
    organizations,
    slots: openSlots(taken.map((row) => iso(row.starts_at))),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = bookingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid appointment." }, { status: 400 });
  }
  const body = parsed.data;
  const start = new Date(body.starts_at);
  if (Number.isNaN(start.getTime())) {
    return Response.json({ error: "Choose an open time." }, { status: 400 });
  }

  const taken = await query<{ starts_at: string | Date }>(
    "SELECT starts_at FROM consultations WHERE status = 'scheduled' AND starts_at > now()",
  );
  const offered = openSlots(taken.map((row) => iso(row.starts_at)));
  if (!offered.some((slot) => slot.starts_at === start.toISOString())) {
    return Response.json({ error: "That time is no longer open." }, { status: 409 });
  }

  let organizationId: string | null = null;
  if (body.party === "organization") {
    if (body.organization) {
      const created = await query<{ id: string }>(
        `INSERT INTO organizations (name, type, owner_user_id, description)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [body.organization.name, body.organization.type, user.id, body.organization.description],
      );
      organizationId = created[0].id;
      await query(
        "UPDATE users SET organization_id = $2, updated_at = now() WHERE id = $1 AND organization_id IS NULL",
        [user.id, organizationId],
      );
    } else if (body.organization_id) {
      const allowed = await query(
        `SELECT 1 FROM organizations
         WHERE id = $1 AND (owner_user_id = $2 OR id = (SELECT organization_id FROM users WHERE id = $2))`,
        [body.organization_id, user.id],
      );
      if (!allowed.length) return Response.json({ error: "Organization not found." }, { status: 404 });
      organizationId = body.organization_id;
    }
  }

  try {
    const rows = await query<AppointmentRow & { organization_id: string | null }>(
      `INSERT INTO consultations (owner_user_id, organization_id, party, topic, notes, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + interval '30 minutes')
       RETURNING id, party, organization_id, topic, notes, starts_at, ends_at, status`,
      [user.id, organizationId, body.party, body.topic, body.notes, start.toISOString()],
    );
    const saved = rows[0];
    let organization_name: string | null = null;
    if (saved.organization_id) {
      const named = await query<{ name: string }>("SELECT name FROM organizations WHERE id = $1", [saved.organization_id]);
      organization_name = named[0]?.name ?? null;
    }
    return Response.json({ appointment: present({ ...saved, organization_name }) }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") return Response.json({ error: "That time was just taken." }, { status: 409 });
    throw error;
  }
}
