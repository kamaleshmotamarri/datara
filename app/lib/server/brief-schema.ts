import { z } from "zod";

export const briefInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    domain: z.string().trim().max(80).default(""),
    question: z.string().trim().min(1).max(2000),
    measure: z.string().trim().max(1000).default(""),
    observed: z.string().trim().max(1000).default(""),
    sample_count: z.number().int().positive().nullable().default(null),
    method: z.enum(["experiment", "observation", "survey", "sensor"]),
    sensor: z
      .object({
        device: z.string(),
        sampling_hz: z.number().positive(),
        session_minutes: z.number().positive(),
        sessions: z.number().int().positive(),
        synchronization: z.string(),
      })
      .nullable()
      .default(null),
    deliverables: z.object({
      table: z.boolean(),
      report: z.boolean(),
      model: z.boolean(),
      table_format: z.enum(["CSV", "JSON", "Parquet"]).default("CSV"),
    }),
    geography: z.string().max(200).default(""),
    age_min: z.number().int().min(0).nullable().default(null),
    age_max: z.number().int().min(0).nullable().default(null),
    desired_date: z.string().nullable().default(null),
    budget_usd: z.number().nonnegative().nullable().default(null),
    quality_notes: z.string().max(2000).default(""),
    consultation_requested: z.boolean().default(false),
    origin: z.enum(["direct", "public_data_gap"]).default("direct"),
    source_run_id: z.string().uuid().nullable().default(null),
  })
  .refine((b) => b.deliverables.table || b.deliverables.report || b.deliverables.model, {
    message: "Choose at least one deliverable.",
  })
  .refine((b) => b.age_min == null || b.age_max == null || b.age_max >= b.age_min, {
    message: "Maximum age must be at least the minimum.",
  })
  .refine((b) => b.method !== "sensor" || b.sensor !== null, { message: "Sensor protocol required." });
