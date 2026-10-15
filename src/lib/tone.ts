/**
 * Lightweight, transparent tone detection. It produces a *hint* that is shown
 * to the user and passed to the model, which remains free to read the message
 * differently. It never claims to know what the user feels.
 */

export type Tone = "neutral" | "humor" | "enthusiasm" | "frustration" | "serious" | "sensitive";

export interface ToneReading {
  tone: Tone;
  /** 0..1, how many independent cues matched. */
  confidence: number;
  cues: string[];
}

interface Rule {
  tone: Exclude<Tone, "neutral">;
  label: string;
  pattern: RegExp;
}

// Patterns are applied to a lower-cased, accent-stripped copy of the message.
const RULES: Rule[] = [
  // Sensitive situations: distress, grief, health, safety. Highest priority.
  { tone: "sensitive", label: "détresse", pattern: /\b(deprime|deprim|deprimee|angoisse|angoisser|panique|crise d'angoisse|je n'en peux plus|j'en peux plus|epuise|epuisee|burn ?out|desespere|suicid|me faire du mal)\b/ },
  { tone: "sensitive", label: "deuil", pattern: /\b(deces|decede|decedee|mort de|est mort|est morte|enterrement|obseques|deuil)\b/ },
  { tone: "sensitive", label: "santé", pattern: /\b(hopital|urgences|diagnostic|cancer|maladie grave|malade|operation chirurgicale)\b/ },
  { tone: "sensitive", label: "rupture", pattern: /\b(rupture|divorce|m'a quitte|on s'est separes|separation)\b/ },
  // Frustration.
  { tone: "frustration", label: "agacement", pattern: /\b(marre|ras le bol|ras-le-bol|ca m'enerve|enerve|enervee|agace|agacee|saoule|gonfle|insupportable|n'importe quoi)\b/ },
  { tone: "frustration", label: "échec répété", pattern: /\b(ca marche (toujours )?pas|ca ne marche (toujours )?pas|encore (un )?bug|toujours pas|rien ne marche|ca plante|ca bug)\b/ },
  { tone: "frustration", label: "juron", pattern: /\b(putain|merde|bordel|fait chier|fais chier)\b/ },
  { tone: "frustration", label: "ponctuation insistante", pattern: /[?!]{3,}/ },
  // Enthusiasm.
  { tone: "enthusiasm", label: "enthousiasme", pattern: /\b(genial|trop bien|incroyable|parfait|excellent|top|super|j'adore|enorme|yes|youpi|trop fort)\b/ },
  { tone: "enthusiasm", label: "réussite", pattern: /\b(ca marche|j'ai reussi|on a reussi|c'est bon|victoire|valide|accepte)\b/ },
  // Humour.
  { tone: "humor", label: "rire", pattern: /\b(mdr|ptdr|lol|haha+|hihi|xd)\b|😂|🤣|😜|😏/ },
  { tone: "humor", label: "ironie", pattern: /\b(evidemment|bien sur|quelle surprise|comme par hasard)\b.*\?|😉/ },
  // Serious, high-stakes requests.
  { tone: "serious", label: "enjeu important", pattern: /\b(urgent|urgence|important|serieusement|serieux|critique|contrat|juridique|avocat|impots|banque|licenciement|tribunal)\b/ },
  { tone: "serious", label: "demande factuelle", pattern: /\b(precisement|exactement|sans blague|sources?)\b/ },
];

const PRIORITY: Tone[] = ["sensitive", "frustration", "serious", "enthusiasm", "humor"];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'");
}

export function detectTone(text: string): ToneReading {
  const norm = normalize(text);
  const hits = new Map<Tone, string[]>();
  for (const rule of RULES) {
    if (rule.pattern.test(norm)) {
      const list = hits.get(rule.tone) ?? [];
      list.push(rule.label);
      hits.set(rule.tone, list);
    }
  }
  // Shouting (mostly upper-case letters on a long enough message) reads as frustration.
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) {
    const list = hits.get("frustration") ?? [];
    list.push("majuscules");
    hits.set("frustration", list);
  }

  for (const tone of PRIORITY) {
    const cues = hits.get(tone);
    if (cues && cues.length > 0) {
      return { tone, confidence: Math.min(1, 0.45 + 0.2 * cues.length), cues };
    }
  }
  return { tone: "neutral", confidence: 0, cues: [] };
}

export const TONE_LABELS: Record<Tone, string> = {
  neutral: "neutre",
  humor: "humour",
  enthusiasm: "enthousiasme",
  frustration: "frustration",
  serious: "sérieux",
  sensitive: "sensible",
};

export const TONE_GUIDANCE: Record<Tone, string> = {
  neutral: "Ton habituel.",
  humor: "L'utilisateur plaisante : tu peux répondre avec esprit, sans en faire trop.",
  enthusiasm: "L'utilisateur est enthousiaste : partage l'élan, reste utile et concret.",
  frustration:
    "L'utilisateur semble agacé : pas de sarcasme, va droit au but, reconnais brièvement la difficulté et propose une solution claire.",
  serious: "Sujet sérieux : précision, rigueur, aucune plaisanterie, signale tes incertitudes.",
  sensitive:
    "Situation possiblement délicate : aucune plaisanterie ni taquinerie. Sois calme, attentionné et sobre. Si un danger pour sa sécurité est évoqué, encourage-le à contacter les secours (112) ou le 3114 en France.",
};
