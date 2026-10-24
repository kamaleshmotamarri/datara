import { z } from "zod";
import { query } from "@/app/lib/server/db";
import { requireUser, unauthorized } from "@/app/lib/server/auth";
import { geminiChat } from "@/app/lib/server/gemini";

const body = z.object({ message: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Message required." }, { status: 400 });

  const [briefs, runs, history] = await Promise.all([
    query("SELECT title, domain, question, measure, state, deliverables FROM collection_briefs WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 20", [user.id]),
    query("SELECT question, status, gap_summary, error_message, selected_dataset_url, datasets FROM public_data_runs WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 5", [user.id]),
    query<{ role: "user" | "assistant"; content: string }>("SELECT role, content FROM chat_messages WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 10", [user.id]),
  ]);
  const system = `You are the Datara desk assistant. Datara collects original data that does not exist yet (tables, reports, models) for individuals, labs and small organizations; public Kaggle / Hugging Face data is a secondary tool. Answer only from the context below. Status labels are demonstration labels, not proof a field team is assigned. If you do not know, say so briefly. Be concise.\n\nUser's briefs: ${JSON.stringify(briefs)}\nRecent public-data runs: ${JSON.stringify(runs).slice(0, 6000)}`;
  const contents = [...history.reverse(), { role: "user" as const, content: parsed.data.message }].map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));
  try {
    const reply = await geminiChat(system, contents);
    await query("INSERT INTO chat_messages (owner_user_id, role, content) VALUES ($1,'user',$2),($1,'assistant',$3)", [user.id, parsed.data.message, reply]);
    return Response.json({ reply });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Assistant unavailable." }, { status: 502 });
  }
}
