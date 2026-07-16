import type { Env } from "../types";

// Multilingual embedding model (handles Tamil / Tanglish / mixed scripts).
// Runs on Cloudflare Workers AI — free daily allowance, native binding.
export const EMBED_MODEL = "@cf/baai/bge-m3";

interface EmbeddingsOutput {
  shape?: number[];
  data?: number[][];
}

/**
 * Embed a batch of texts. Workers AI accepts an array in one call. Returns one
 * vector per input, in order. Throws on API error (callers treat RAG as
 * best-effort and fall back to a normal reply).
 */
export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = (await env.AI.run(EMBED_MODEL, { text: texts })) as EmbeddingsOutput;
  const data = res?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error("embeddings: unexpected response shape");
  }
  return data;
}

export async function embedOne(env: Env, text: string): Promise<number[]> {
  const [vec] = await embedTexts(env, [text]);
  if (!vec) throw new Error("embeddings: empty result");
  return vec;
}

/** Cosine similarity of two equal-length vectors. Returns 0 on mismatch. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
