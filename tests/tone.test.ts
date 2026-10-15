import { describe, expect, it } from "vitest";

import { detectTone } from "@/lib/tone";

describe("detectTone", () => {
  it.each([
    ["Quelle heure est-il ?", "neutral"],
    ["Ça marche toujours pas, j'en ai marre !!!", "frustration"],
    ["CA NE MARCHE PAS DU TOUT CE TRUC", "frustration"],
    ["Génial, ça marche enfin !", "enthusiasm"],
    ["mdr t'es nul", "humor"],
    ["C'est urgent, j'ai un contrat à vérifier", "serious"],
    ["Mon père est décédé hier", "sensitive"],
    ["Je suis épuisé, je n'en peux plus", "sensitive"],
  ])("%s → %s", (text, tone) => {
    expect(detectTone(text).tone).toBe(tone);
  });

  it("gives sensitive situations priority over humour", () => {
    expect(detectTone("haha je suis à l'hôpital").tone).toBe("sensitive");
  });

  it("explains its reading with cues", () => {
    const r = detectTone("putain ça plante encore");
    expect(r.cues.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0);
  });
});
