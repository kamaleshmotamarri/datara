import { z } from "zod";

// Gemini sometimes returns a list where a string was asked for.
const text = z.union([z.string(), z.array(z.string()), z.null()]).transform((v) => (Array.isArray(v) ? v.join("; ") : (v ?? "")));
import { query } from "./db";
import { geminiJson } from "./gemini";
import {
  hfInspect,
  kaggleConfigured,
  searchHuggingFace,
  searchKaggle,
  type Candidate,
} from "./sources";

export type DatasetResult = {
  source: "web" | "hugging_face" | "kaggle";
  title: string;
  url: string;
  description: string;
  license: string | null;
  suitability: "viable" | "insufficient" | "restricted" | "unknown";
  explanation: string;
  columns?: string[];
  rows?: number | null;
  csv_file?: string | null;
  ref?: string;
};

const SYSTEM =
  "You are the public-data analyst for Datara. Use only facts given to you. Never invent columns, row counts, or licenses. Reply with JSON only.";

const assessSchema = z.object({
  results: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      suitability: z.preprocess((v) => {
        const t = String(v ?? "").toLowerCase();
        if (/not|insuff|no\b|unsuit/.test(t)) return "insufficient";
        if (/viab|suit|good|yes|fit/.test(t)) return "viable";
        if (/restrict|gated|licen/.test(t)) return "restricted";
        return "unknown";
      }, z.enum(["viable", "insufficient", "restricted", "unknown"])),
      explanation: text,
    }),
  ),
  gap_summary: text.transform((v) => v || null).nullish().transform((v) => v ?? null),
  brief: z
    .object({
      title: z.string(),
      domain: z.string(),
      question: z.string(),
      measure: z.string(),
      observed: z.string(),
      method: z.enum(["experiment", "observation", "survey", "sensor"]),
    })
    .nullable()
    .default(null),
});

function fallbackTask(question: string) {
  const target =
    question.match(/target\s*:\s*([^.;\n]+)/i)?.[1]?.trim() ??
    question.match(/predict(?:ing)?\s+([^.;]+?)\s+from\s+/i)?.[1]?.trim() ??
    null;
  const query = question
    .toLowerCase()
    .replace(/\b(predict|prediction|predicting|dataset|data|using|from|with|target|model|train|training|the|a|an|of|for|and|to)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
  return {
    task: question,
    target,
    fields: [] as string[],
    constraints: "",
    search_queries: [query || question.slice(0, 120)],
    ambiguous: false,
    clarifying_question: null,
    ai_fallback: true,
  };
}

async function update(id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await query(`UPDATE public_data_runs SET ${sets}, updated_at = now() WHERE id = $1`, [
    id,
    ...keys.map((k) => {
      const v = fields[k];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }),
  ]);
}

export async function executePublicRun(runId: string, question: string) {
  try {
    await update(runId, { status: "searching" });
    // Search must not depend on an AI provider. A deterministic query/target parser
    // keeps the source APIs useful even when Gemini is unavailable or out of quota.
    const task = fallbackTask(question);
    // Always search something: fall back to the user's own words.
    if (task.search_queries.length === 0) {
      task.search_queries = [question.slice(0, 120)];
    }
    await update(runId, { task });
    if (task.ambiguous && task.clarifying_question) {
      await update(runId, { status: "needs_input", gap_summary: task.clarifying_question });
      return;
    }

    // Search every source. A failed source is an error, not a gap.
    const errors: string[] = [];
    const found: Candidate[] = [];
    for (const q of task.search_queries) {
      try {
        found.push(...(await searchHuggingFace(q, 6)));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Hugging Face search failed.");
      }
      if (kaggleConfigured()) {
        try {
          found.push(...(await searchKaggle(q, 6)));
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Kaggle search failed.");
        }
      } else if (!errors.includes("Kaggle credentials are not configured.")) {
        errors.push("Kaggle credentials are not configured.");
      }
    }
    const seen = new Set<string>();
    const unique = found.filter((c) => {
      const k = `${c.source}:${c.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Interleave sources so the cap keeps both.
    const hf = unique.filter((c) => c.source === "hugging_face");
    const kg = unique.filter((c) => c.source === "kaggle");
    const capped: Candidate[] = [];
    for (let i = 0; capped.length < 10 && (i < hf.length || i < kg.length); i++) {
      if (hf[i]) capped.push(hf[i]);
      if (kg[i] && capped.length < 10) capped.push(kg[i]);
    }

    await update(runId, { status: "assessing" });
    const inspected: DatasetResult[] = [];
    for (const c of capped) {
      const base: DatasetResult = {
        source: c.source,
        title: c.title,
        url: c.url,
        description: c.description,
        license: c.license,
        suitability: "unknown",
        explanation: "",
        ref: c.id,
      };
      if (c.source === "hugging_face") {
        const info = await hfInspect(c.id);
        base.columns = info.columns;
        base.rows = info.rows;
        base.csv_file = info.gated ? null : info.csv_file;
        if (info.gated) base.explanation = "Gated on Hugging Face. Open the link to request access.";
      }
      inspected.push(base);
    }

    if (inspected.length === 0) {
      if (errors.length) throw new Error(errors.join(" "));
      await update(runId, { status: "gap_found", gap_summary: "No public dataset matched these searches." });
      return;
    }

    const assessed = await geminiJson(
      SYSTEM,
      `Question: ${question}\nTask: ${JSON.stringify(task)}\nCandidates (real metadata; missing fields mean unknown):\n${JSON.stringify(
        inspected.map((d) => ({
          id: d.ref,
          source: d.source,
          title: d.title,
          description: d.description,
          license: d.license,
          columns: d.columns,
          rows: d.rows,
          has_csv: Boolean(d.csv_file),
          gated: d.explanation.startsWith("Gated"),
        })),
      )}\nFor each candidate give suitability (viable only if the columns/labels shown can carry the target; unknown if columns are not listed) and a one-sentence explanation. If NONE is viable, write gap_summary (what measurement is missing) and a prefilled collection brief; otherwise gap_summary and brief are null.\nJSON keys: results[{id,suitability,explanation}], gap_summary, brief{title,domain,question,measure,observed,method}`,
      assessSchema,
    ).catch(() => ({
      results: inspected.map((dataset) => {
        const target = task.target?.toLowerCase().trim();
        const hasTarget = Boolean(target && dataset.columns?.some((column) => column.toLowerCase() === target));
        const trainable = Boolean(dataset.csv_file && dataset.columns?.length && hasTarget);
        return {
          id: dataset.ref ?? "",
          suitability: trainable ? "viable" as const : "unknown" as const,
          explanation: trainable
            ? `A CSV is available and its metadata includes the requested target, ${task.target}. AI assessment was unavailable, so verify the source before training.`
            : "Source metadata was found, but AI assessment was unavailable. Open the source to verify its target and features.",
        };
      }),
      gap_summary: null,
      brief: null,
    }));
    const byId = new Map(assessed.results.map((r) => [r.id, r]));
    const datasets = inspected.map((d) => {
      const r = byId.get(d.ref ?? "");
      return r ? { ...d, suitability: r.suitability, explanation: r.explanation } : { ...d, explanation: "Not assessed." };
    });
    const viable = datasets.find((d) => d.suitability === "viable");

    if (viable) {
      await update(runId, { status: "completed", datasets, selected_dataset_url: viable.url });
      return;
    }
    // Only a completed look at every source may suggest a gap.
    if (errors.some((e) => !/Kaggle credentials are not configured/.test(e))) {
      await update(runId, { status: "failed", datasets, error_message: errors.join(" ") });
      return;
    }
    const note = errors.length ? " Kaggle was not searched because credentials are missing." : "";
    await update(runId, {
      status: "gap_found",
      datasets,
      gap_summary: (assessed.gap_summary ?? "No searched table carries this measurement.") + note,
      task: { ...task, brief: assessed.brief },
    });
  } catch (error) {
    await update(runId, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Run failed.",
    });
  }
}
