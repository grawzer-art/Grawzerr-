import { describe, expect, it } from "vitest";

import { MemoryTagFilter, parseSuggestion, sameMemory } from "@/lib/memory-suggestions";

function run(chunks: string[]) {
  const f = new MemoryTagFilter();
  const text = chunks.map((c) => f.push(c)).join("") + f.flush();
  return { text, suggestions: f.suggestions };
}

const REPLY =
  'Enchanté, Alex. Je propose de retenir votre prénom.\n\n<souvenir categorie="personal" importance="4">Prénom : Alex.</souvenir>';

describe("MemoryTagFilter", () => {
  it("passes plain text through untouched", () => {
    expect(run(["Bonjour", ", a < b et c > d."])).toEqual({ text: "Bonjour, a < b et c > d.", suggestions: [] });
  });

  it("removes the tag and extracts the suggestion", () => {
    const { text, suggestions } = run([REPLY]);
    expect(text).toBe("Enchanté, Alex. Je propose de retenir votre prénom.\n\n");
    expect(suggestions).toEqual([{ content: "Prénom : Alex.", category: "personal", importance: 4 }]);
  });

  it("never leaks a tag split across chunks, whatever the split", () => {
    for (let size = 1; size <= 12; size++) {
      const chunks = REPLY.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) ?? [];
      const f = new MemoryTagFilter();
      const emitted = chunks.map((c) => f.push(c));
      emitted.push(f.flush());
      expect(emitted.join("")).toBe("Enchanté, Alex. Je propose de retenir votre prénom.\n\n");
      expect(emitted.some((e) => e.includes("souv"))).toBe(false);
      expect(f.suggestions).toHaveLength(1);
    }
  });

  it("handles several tags, French categories and bad attributes", () => {
    const { text, suggestions } = run([
      'Noté.<souvenir categorie="projet" importance="9">Lance une boulangerie</souvenir>',
      "<souvenir>Aime le jazz</souvenir>",
      '<souvenir categorie="inconnue" importance="abc">  Vit   à Lyon </souvenir>',
    ]);
    expect(text).toBe("Noté.");
    expect(suggestions).toEqual([
      { content: "Lance une boulangerie", category: "project", importance: 5 },
      { content: "Aime le jazz", category: "personal", importance: 3 },
      { content: "Vit à Lyon", category: "personal", importance: 3 },
    ]);
  });

  it("caps the number of suggestions and drops duplicates", () => {
    const tag = (t: string) => `<souvenir>${t}</souvenir>`;
    const { suggestions } = run([tag("A"), tag("a."), tag("B"), tag("C"), tag("D")]);
    expect(suggestions.map((s) => s.content)).toEqual(["A", "B", "C"]);
  });

  it("accepts a tag left unclosed at the end of the reply", () => {
    const { text, suggestions } = run(["Très bien. ", '<souvenir categorie="preference">Préfère le thé']);
    expect(text).toBe("Très bien. ");
    expect(suggestions).toEqual([{ content: "Préfère le thé", category: "preference", importance: 3 }]);
  });

  it("gives back as text an opened tag that never ends", () => {
    const long = `<souvenir ${"x".repeat(1300)}`;
    expect(run([long, " suite"]).text).toBe(`${long} suite`);
  });

  it("ignores empty suggestions and strips nested markup", () => {
    expect(run(["<souvenir> </souvenir>"]).suggestions).toEqual([]);
    expect(parseSuggestion("<souvenir><b>Aime</b> le café")?.content).toBe("Aime le café");
  });
});

describe("sameMemory", () => {
  it("ignores case, accents and punctuation", () => {
    expect(sameMemory("Préfère le thé.", "prefere le the")).toBe(true);
    expect(sameMemory("Aime le thé", "Aime le café")).toBe(false);
  });
});
