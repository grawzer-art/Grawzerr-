import type { MemoryCategory } from "./types";

/**
 * JARVIS proposes memories by appending tags to its reply:
 *   <souvenir categorie="preference" importance="3">Préfère le thé.</souvenir>
 * The tags are removed from the streamed text and stored as *suggestions*
 * (status "suggested"): nothing becomes a confirmed fact without the user.
 */

const OPEN = "<souvenir";
const CLOSE = "</souvenir>";
/** An opened tag longer than this is not one of ours: it is shown as text. */
const MAX_TAG_CHARS = 1200;
export const MAX_SUGGESTION_CHARS = 300;
export const MAX_SUGGESTIONS_PER_REPLY = 3;

export interface MemorySuggestion {
  content: string;
  category: MemoryCategory;
  importance: number;
}

const CATEGORY_ALIASES: Record<string, MemoryCategory> = {
  personal: "personal",
  personnel: "personal",
  preference: "preference",
  préférence: "preference",
  project: "project",
  projet: "project",
  relationship: "relationship",
  relationnel: "relationship",
  relation: "relationship",
  important: "important",
  other: "other",
  autre: "other",
};

/** Length of the longest suffix of `text` that is a prefix of `tag`. */
function partialSuffix(text: string, tag: string): number {
  for (let n = Math.min(text.length, tag.length - 1); n > 0; n--) {
    if (tag.startsWith(text.slice(text.length - n))) return n;
  }
  return 0;
}

export function parseSuggestion(raw: string): MemorySuggestion | null {
  const gt = raw.indexOf(">");
  if (gt === -1) return null;
  const attrs: Record<string, string> = {};
  for (const m of raw.slice(OPEN.length, gt).matchAll(/([\p{L}_]+)\s*=\s*["']([^"']*)["']/gu)) {
    attrs[m[1].toLowerCase()] = m[2].trim().toLowerCase();
  }
  const content = raw
    .slice(gt + 1)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SUGGESTION_CHARS);
  if (!content) return null;
  const category = CATEGORY_ALIASES[attrs.categorie ?? attrs.category ?? ""] ?? "personal";
  const importance = Math.round(Number(attrs.importance));
  return {
    content,
    category,
    importance: Number.isFinite(importance) ? Math.min(5, Math.max(1, importance)) : 3,
  };
}

/** Streaming filter: feed it the model's text chunks, emit what it returns. */
export class MemoryTagFilter {
  private pending = "";
  readonly suggestions: MemorySuggestion[] = [];

  push(chunk: string): string {
    this.pending += chunk;
    let out = "";
    for (;;) {
      const start = this.pending.indexOf(OPEN);
      if (start === -1) {
        // Hold back a tag that may be split across chunks ("<souv" + "enir").
        const keep = partialSuffix(this.pending, OPEN);
        out += this.pending.slice(0, this.pending.length - keep);
        this.pending = this.pending.slice(this.pending.length - keep);
        return out;
      }
      out += this.pending.slice(0, start);
      this.pending = this.pending.slice(start);
      const end = this.pending.indexOf(CLOSE);
      if (end === -1) {
        if (this.pending.length > MAX_TAG_CHARS) {
          out += this.pending;
          this.pending = "";
        }
        return out;
      }
      this.take(this.pending.slice(0, end));
      this.pending = this.pending.slice(end + CLOSE.length);
    }
  }

  /** Call once the model is done: returns the remaining visible text. */
  flush(): string {
    const rest = this.pending;
    this.pending = "";
    if (rest.startsWith(OPEN)) {
      // A tag left unclosed at the very end of the reply.
      this.take(rest);
      return "";
    }
    return rest;
  }

  private take(raw: string) {
    const s = parseSuggestion(raw);
    if (!s || this.suggestions.length >= MAX_SUGGESTIONS_PER_REPLY) return;
    if (this.suggestions.some((x) => sameMemory(x.content, s.content))) return;
    this.suggestions.push(s);
  }
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function sameMemory(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
