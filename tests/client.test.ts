import { describe, expect, it } from "vitest";

import { readNdjson } from "@/lib/client/ndjson";
import { sortFrenchVoices, takeSentences, toSpeakable } from "@/lib/client/voice";

import { collect, streamOf } from "./helpers";

describe("readNdjson", () => {
  it("parses objects split across chunks", async () => {
    const out = await collect(readNdjson(streamOf(['{"a":1}\n{"b"', ':2}\n', '{"c":3}'])));
    expect(out).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});

describe("voice helpers", () => {
  it("splits complete sentences and keeps the rest", () => {
    expect(takeSentences("Bonjour Monsieur. Tout va bien ! Je cal")).toEqual({
      sentences: ["Bonjour Monsieur.", "Tout va bien !"],
      rest: " Je cal",
    });
  });

  it("strips markdown before speaking", () => {
    expect(toSpeakable("**Bien** vu, voir `code` et https://x.y/z\n- point")).toBe("Bien vu, voir code et le lien point");
  });

  it("prefers French male voices", () => {
    const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
    const sorted = sortFrenchVoices([v("Amélie", "fr-CA"), v("Samantha", "en-US"), v("Thomas", "fr-FR"), v("Audrey", "fr-FR")]);
    expect(sorted.map((x) => x.name)).toEqual(["Thomas", "Audrey", "Amélie"]);
  });
});
