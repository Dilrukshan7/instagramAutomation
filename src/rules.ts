import type { Env, ReplyDecision } from "./types";

export interface Rule {
  /** Keywords matched case-insensitively as substrings of the comment text. */
  keywords: string[];
  /** One is picked at random for the public comment reply. */
  publicReplies: string[];
  /** One is picked at random for the DM. */
  dmMessages: string[];
}

export interface FallbackConfig {
  publicReplies: string[];
  dmMessages: string[];
}

/** Starter rules — edit them from the dashboard (stored in KV key `config:rules`). */
const DEFAULT_RULES: Rule[] = [
  {
    keywords: ["price", "cost", "how much"],
    publicReplies: [
      "Thanks for asking! Just sent you the details in a DM 📩",
      "Great question — check your DMs for the details!",
    ],
    dmMessages: [
      "Hey! Thanks for your interest — here are the pricing details you asked about. Reply here if you have any questions!",
    ],
  },
  {
    keywords: ["link", "where can i", "website"],
    publicReplies: ["Sent you the link in a DM! 🔗", "Check your DMs — link is on the way! 🔗"],
    dmMessages: ["Hi! Here's the link you asked about. Let me know if you need anything else!"],
  },
];

const DEFAULT_FALLBACK: FallbackConfig = {
  publicReplies: ["Thanks for your comment! 🙌 Just sent you a DM."],
  dmMessages: [
    "Hey, thanks for commenting on my post! I'll get back to you personally soon — feel free to reply here with any questions.",
  ],
};

/** Words that suppress any automated response. Editable from the dashboard. */
const DEFAULT_BLOCKLIST: string[] = ["giveaway scam", "follow back", "check my profile"];

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  if (typeof value === "string" && value.trim() !== "") return [value];
  return [];
}

/** Accepts both the current array shape and the legacy single-string shape. */
export function normalizeRule(raw: Record<string, unknown>): Rule | null {
  const keywords = toArray(raw.keywords);
  const publicReplies = [...toArray(raw.publicReplies), ...toArray(raw.publicReply)];
  const dmMessages = [...toArray(raw.dmMessages), ...toArray(raw.dmMessage)];
  if (keywords.length === 0 || publicReplies.length === 0 || dmMessages.length === 0) return null;
  return { keywords, publicReplies, dmMessages };
}

export async function getRules(env: Env): Promise<Rule[]> {
  const stored = await env.STATE.get("config:rules");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>[];
      const rules = parsed.map(normalizeRule).filter((r): r is Rule => r !== null);
      if (rules.length > 0) return rules;
    } catch {
      // fall through to defaults on malformed JSON
    }
  }
  return DEFAULT_RULES;
}

export async function getFallback(env: Env): Promise<FallbackConfig> {
  const stored = await env.STATE.get("config:fallback");
  if (stored) {
    try {
      const raw = JSON.parse(stored) as Record<string, unknown>;
      const publicReplies = [...toArray(raw.publicReplies), ...toArray(raw.publicReply)];
      const dmMessages = [...toArray(raw.dmMessages), ...toArray(raw.dmMessage)];
      if (publicReplies.length > 0 && dmMessages.length > 0) return { publicReplies, dmMessages };
    } catch {
      // keep defaults
    }
  }
  return DEFAULT_FALLBACK;
}

export async function getFallbackReply(env: Env): Promise<ReplyDecision> {
  const fb = await getFallback(env);
  return {
    publicReply: pickRandom(fb.publicReplies),
    dmMessage: pickRandom(fb.dmMessages),
    source: "fallback",
  };
}

export async function getBlocklist(env: Env): Promise<string[]> {
  const stored = await env.STATE.get("config:blocklist");
  if (stored) {
    try {
      return toArray(JSON.parse(stored));
    } catch {
      // keep defaults
    }
  }
  return DEFAULT_BLOCKLIST;
}

export async function isBlocked(env: Env, text: string): Promise<boolean> {
  const blocklist = await getBlocklist(env);
  const lower = text.toLowerCase();
  return blocklist.some((w) => lower.includes(w.toLowerCase()));
}

export async function matchRule(env: Env, text: string): Promise<ReplyDecision | null> {
  const lower = text.toLowerCase();
  const rules = await getRules(env);
  for (const rule of rules) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return {
        publicReply: pickRandom(rule.publicReplies),
        dmMessage: pickRandom(rule.dmMessages),
        source: "rule",
      };
    }
  }
  return null;
}
