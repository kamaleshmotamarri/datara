export type Candidate = {
  source: "hugging_face" | "kaggle";
  id: string;
  title: string;
  url: string;
  description: string;
  license: string | null;
  meta: Record<string, unknown>;
};

const hfHeaders = (): HeadersInit =>
  process.env.HF_TOKEN?.startsWith("hf_") ? { authorization: `Bearer ${process.env.HF_TOKEN}` } : {};

export async function searchHuggingFace(q: string, limit = 8): Promise<Candidate[]> {
  const url = `https://huggingface.co/api/datasets?search=${encodeURIComponent(q)}&limit=${limit}&full=true&sort=downloads&direction=-1`;
  const res = await fetch(url, { headers: hfHeaders(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Hugging Face search failed (${res.status}).`);
  const items = (await res.json()) as Array<{
    id: string;
    description?: string;
    tags?: string[];
    downloads?: number;
    siblings?: { rfilename: string }[];
  }>;
  return items.map((item) => {
    const license = item.tags?.find((t) => t.startsWith("license:"))?.slice(8) ?? null;
    return {
      source: "hugging_face" as const,
      id: item.id,
      title: item.id,
      url: `https://huggingface.co/datasets/${item.id}`,
      description: (item.description ?? "").slice(0, 400),
      license,
      meta: {
        downloads: item.downloads,
        csv_files: (item.siblings ?? []).map((s) => s.rfilename).filter((f) => /\.csv$/i.test(f)).slice(0, 5),
        tags: item.tags?.slice(0, 12),
      },
    };
  });
}

function kaggleAuth(): HeadersInit | null {
  const user = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY;
  if (!key || key.startsWith("replace")) return null;
  if (key.startsWith("KGAT_")) return { authorization: `Bearer ${key}` };
  if (!user || user.startsWith("replace")) return null;
  return { authorization: `Basic ${Buffer.from(`${user}:${key}`).toString("base64")}` };
}

export const kaggleConfigured = () => kaggleAuth() !== null;

export async function searchKaggle(q: string, limit = 8): Promise<Candidate[]> {
  const headers = kaggleAuth();
  if (!headers) throw new Error("Kaggle credentials are not configured.");
  const res = await fetch(
    `https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(q)}&sortBy=votes&fileType=csv&pageSize=${limit}`,
    { headers, signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`Kaggle search failed (${res.status}).`);
  const items = (await res.json()) as Array<{
    ref: string;
    title?: string;
    subtitle?: string;
    licenseName?: string;
    totalBytes?: number;
    downloadCount?: number;
    url?: string;
  }>;
  return items.slice(0, limit).map((item) => ({
    source: "kaggle" as const,
    id: item.ref,
    title: item.title || item.ref,
    url: item.url || `https://www.kaggle.com/datasets/${item.ref}`,
    description: (item.subtitle ?? "").slice(0, 400),
    license: item.licenseName ?? null,
    meta: { total_bytes: item.totalBytes, downloads: item.downloadCount },
  }));
}

/** Real column names and row counts from the Hugging Face dataset viewer. */
export async function hfInspect(id: string) {
  const out: { columns: string[]; rows: number | null; csv_file: string | null; gated: boolean; note?: string } = {
    columns: [],
    rows: null,
    csv_file: null,
    gated: false,
  };
  try {
    const repo = await fetch(`https://huggingface.co/api/datasets/${id}`, {
      headers: hfHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (repo.ok) {
      const meta = await repo.json();
      out.gated = Boolean(meta.gated);
      const csvs = ((meta.siblings ?? []) as { rfilename: string }[])
        .map((s) => s.rfilename)
        .filter((f) => /\.csv$/i.test(f));
      out.csv_file = csvs.find((f) => /(^|\/)train\.csv$/i.test(f)) ?? csvs[0] ?? null;
    }
    const info = await fetch(`https://datasets-server.huggingface.co/info?dataset=${encodeURIComponent(id)}`, {
      headers: hfHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!info.ok) return { ...out, note: `viewer unavailable (${info.status})` };
    const body = await info.json();
    const first = Object.values(body.dataset_info ?? {})[0] as
      | { features?: Record<string, unknown>; splits?: Record<string, { num_examples: number }> }
      | undefined;
    if (first?.features) out.columns = Object.keys(first.features).slice(0, 60);
    if (first?.splits) out.rows = Object.values(first.splits).reduce((a, s) => a + s.num_examples, 0);
  } catch (error) {
    out.note = error instanceof Error ? error.message : "viewer error";
  }
  return out;
}

export function hfFileUrl(id: string, file: string) {
  return `https://huggingface.co/datasets/${id}/resolve/main/${file.split("/").map(encodeURIComponent).join("/")}`;
}

/** Downloads a CSV with a hard byte cap. */
export function kaggleDownloadUrl(ref: string) {
  return `https://www.kaggle.com/api/v1/datasets/download/${ref}`;
}

export function kaggleHeaders(): HeadersInit {
  const headers = kaggleAuth();
  if (!headers) throw new Error("Kaggle credentials are not configured.");
  return headers;
}

export async function downloadCapped(url: string, dest: string, maxBytes: number, headers: HeadersInit = hfHeaders()) {
  const { createWriteStream } = await import("node:fs");
  const { Readable } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Dataset file is larger than the 100 MB limit.");
  let seen = 0;
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > maxBytes) controller.error(new Error("Dataset file is larger than the 100 MB limit."));
      else controller.enqueue(chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body.pipeThrough(limiter) as never), createWriteStream(dest));
  return seen;
}
