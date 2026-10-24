import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { query } from "./db";
import { geminiJson } from "./gemini";
import { downloadCapped, hfFileUrl, kaggleDownloadUrl, kaggleHeaders } from "./sources";

const MAX_BYTES = 100 * 1024 * 1024;

const specSchema = z.object({
  task: z.enum(["classification", "regression"]),
  target: z.string(),
  features: z.array(z.string()).min(1).max(60),
  hidden: z.preprocess((v) => (typeof v === "number" && v >= 8 && v <= 256 ? Math.round(v) : 64), z.number()),
  cleaning_notes: z.union([z.string(), z.array(z.string()), z.null()]).optional().transform((v) => (Array.isArray(v) ? v.join("; ") : (v ?? ""))),
});

async function finish(id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await query(`UPDATE training_runs SET ${sets}, updated_at = now() WHERE id = $1`, [
    id,
    ...keys.map((k) => {
      const v = fields[k];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }),
  ]);
}

function runProcess(cmd: string, args: string[], timeoutMs: number) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: e.message });
    });
  });
}

/** Header and a few rows, read from the first 64 KB. */
async function preview(file: string) {
  const text = (await readFile(file, "utf8")).slice(0, 65_536);
  return text.split(/\r?\n/).slice(0, 6).join("\n");
}

type Job = { dataset_id: string; csv_file: string; question: string; source?: "hugging_face" | "kaggle" };

/** Downloads a Kaggle dataset zip and extracts its largest CSV (capped) to dest. */
async function fetchKaggleCsv(ref: string, dir: string, dest: string) {
  const zip = path.join(dir, "data.zip");
  await downloadCapped(kaggleDownloadUrl(ref), zip, MAX_BYTES, kaggleHeaders());
  const listing = await runProcess("unzip", ["-l", zip], 60_000);
  if (listing.code !== 0) throw new Error("Kaggle download was not a readable zip file.");
  const csvs = listing.out
    .split("\n")
    .map((l) => l.match(/^\s*(\d+)\s+\S+\s+\S+\s+(.+\.csv)\s*$/i))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ size: Number(m[1]), name: m[2] }))
    .filter((f) => f.size > 0 && f.size <= MAX_BYTES && !/__MACOSX/.test(f.name))
    .sort((a, b) => b.size - a.size);
  if (!csvs.length) throw new Error("This Kaggle dataset has no CSV file under 100 MB.");
  const { createWriteStream } = await import("node:fs");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("unzip", ["-p", zip, csvs[0].name], { stdio: ["ignore", "pipe", "ignore"] });
    const out = createWriteStream(dest);
    child.stdout.pipe(out);
    child.on("error", reject);
    out.on("finish", resolve);
    out.on("error", reject);
  });
  return csvs[0].name;
}

/** Runs a queued training row: download, Gemini spec, reviewed template, store metrics. */
export async function runTrainingJob(trainingId: string) {
  const rows = await query<{ job: Job | null; public_run_id: string }>(
    "SELECT job, public_run_id FROM training_runs WHERE id = $1",
    [trainingId],
  );
  const row = rows[0];
  if (!row?.job) {
    await finish(trainingId, { status: "failed", error_message: "Training job has no dataset attached." });
    return;
  }
  await executeTraining(trainingId, row.job.dataset_id, row.job.csv_file, row.job.question, row.job.source ?? "hugging_face");
  await query("UPDATE public_data_runs SET status='completed', updated_at=now() WHERE id=$1", [row.public_run_id]);
}

async function executeTraining(trainingId: string, datasetId: string, csvFile: string, question: string, source: "hugging_face" | "kaggle") {
  const dir = path.join(process.env.STORAGE_DIR || "./storage", "training", trainingId);
  try {
    await mkdir(dir, { recursive: true });
    await finish(trainingId, { status: "running" });
    const csv = path.join(dir, "data.csv");
    if (source === "kaggle") await fetchKaggleCsv(datasetId, dir, csv);
    else await downloadCapped(hfFileUrl(datasetId, csvFile), csv, MAX_BYTES);

    const sample = await preview(csv);
    const spec = await geminiJson(
      "You configure a reviewed PyTorch tabular template. Use only column names that appear in the header. Reply with JSON only.",
      `Question: ${question}\nCSV preview (header + rows):\n${sample}\nChoose the target column and the feature columns (never include the target or ID-like columns). task is classification for categorical/low-cardinality targets, regression for numeric continuous.\nJSON keys: task, target, features[], hidden, cleaning_notes`,
      specSchema,
    );
    await finish(trainingId, { spec });
    await writeFile(path.join(dir, "job.json"), JSON.stringify({ ...spec, max_rows: 20_000, epochs: 20, time_limit_s: 600 }));

    const useDocker = process.env.TRAINING_DOCKER === "1";
    const abs = path.resolve(dir);
    const res = useDocker
      ? await runProcess(
          "docker",
          ["run", "--rm", "--network", "none", "--read-only", "--user", "65534", "--memory", "2g", "--cpus", "2",
            "-v", `${abs}:/job`, "--tmpfs", "/tmp", "datara-trainer", "python", "/app/train.py", "/job"],
          12 * 60_000,
        )
      : await runProcess(process.env.TRAINING_PYTHON || "python3", [path.resolve("backend/training/train.py"), abs], 12 * 60_000);

    if (res.code !== 0) throw new Error((res.err || res.out).trim().split("\n").slice(-3).join(" ").slice(0, 400) || "Training failed.");
    const result = JSON.parse(await readFile(path.join(dir, "metrics.json"), "utf8"));
    await finish(trainingId, {
      status: "completed",
      metrics: result.metrics,
      baseline_metrics: result.baseline,
      cleaning_summary: `${result.cleaning} ${spec.cleaning_notes}`.trim(),
      artifacts: [
        { name: "model.pt", relative_path: `training/${trainingId}/model.pt` },
        { name: "metrics.json", relative_path: `training/${trainingId}/metrics.json` },
      ],
    });
  } catch (error) {
    await finish(trainingId, { status: "failed", error_message: error instanceof Error ? error.message : "Training failed." });
  }
}
