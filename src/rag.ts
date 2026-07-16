import { getEnabledChunks } from "./db";
import { cosineSim, EMBED_MODEL, embedOne } from "./llm/embed";
import type { Env } from "./types";

const MAX_CHUNK_LEN = 500;
// Minimum cosine similarity for a line to be considered relevant enough to inject.
const MIN_SCORE = 0.35;

/**
 * Split raw pasted text into embeddable chunks: one per non-empty line, with
 * long lines/paragraphs hard-split so no chunk is enormous.
 */
export function chunkText(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "") continue;
    if (t.length <= MAX_CHUNK_LEN) {
      out.push(t);
    } else {
      for (let i = 0; i < t.length; i += MAX_CHUNK_LEN) {
        out.push(t.slice(i, i + MAX_CHUNK_LEN));
      }
    }
  }
  return out;
}

export interface RagContext {
  lines: string[];
  styleNotes: string[];
}

/**
 * Retrieve the reference lines most similar to a comment for persona replies.
 * Best-effort: returns empty context on any failure so the caller falls back to
 * a normal reply. Brute-force cosine over the account's enabled chunks — fine
 * at personal scale (see plan; Vectorize is the paid upgrade path).
 */
export async function retrieveContext(
  env: Env,
  accountId: number,
  commentText: string,
  k = 5,
): Promise<RagContext> {
  try {
    const chunks = await getEnabledChunks(env, accountId, EMBED_MODEL);
    if (chunks.length === 0) return { lines: [], styleNotes: [] };

    const q = await embedOne(env, commentText);
    const scored = chunks
      .map((c) => {
        let vec: number[];
        try {
          vec = JSON.parse(c.embedding) as number[];
        } catch {
          return null;
        }
        return { content: c.content, styleNote: c.style_note, score: cosineSim(q, vec) };
      })
      .filter((s): s is { content: string; styleNote: string | null; score: number } => s !== null && s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    const lines = scored.map((s) => s.content);
    const styleNotes = Array.from(
      new Set(scored.map((s) => (s.styleNote ?? "").trim()).filter((s) => s !== "")),
    );
    return { lines, styleNotes };
  } catch {
    return { lines: [], styleNotes: [] };
  }
}
