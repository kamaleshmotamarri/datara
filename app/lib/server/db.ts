import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    client = neon(url);
  }
  return client;
}

export type Row = Record<string, unknown>;

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await sql().query(text, params)) as T[];
}
