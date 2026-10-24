import type { z } from "zod";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = { text: string };
type Content = { role: "user" | "model"; parts: Part[] };

async function call(body: Record<string, unknown>): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: Part) => p.text).join("") ?? "";
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

export async function geminiJson<T>(system: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  let lastError: unknown;
  // Gemini occasionally returns malformed JSON; retry instead of failing the run.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await call({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: attempt === 0 ? 0.1 : 0,
          maxOutputTokens: 8192,
        },
      });
      let cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
      return schema.parse(JSON.parse(cleaned));
    } catch (e) {
      lastError = e;
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("Gemini did not respond within 20 seconds.");
      }
      if (e instanceof Error && /^Gemini error 4\d\d/.test(e.message)) {
        if (/^Gemini error 429/.test(e.message)) {
          throw new Error("Gemini quota exceeded for this API key. Wait for the quota to reset, set GEMINI_MODEL to another model (for example gemini-2.5-flash-lite), or enable billing in Google AI Studio.");
        }
        throw e;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini returned invalid JSON.");
}

export async function geminiChat(system: string, history: Content[]): Promise<string> {
  return call({
    systemInstruction: { parts: [{ text: system }] },
    contents: history,
    generationConfig: { temperature: 0.3 },
  });
}
