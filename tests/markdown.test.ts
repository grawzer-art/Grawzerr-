import { describe, expect, it } from "vitest";

import { parseBlocks } from "@/components/Markdown";

describe("parseBlocks", () => {
  it("parses paragraphs, lists, headings and code", () => {
    const blocks = parseBlocks("### Titre\nUn paragraphe\nsur deux lignes\n\n- un\n- deux\n1. premier\n```\n<script>x</script>\n```");
    expect(blocks).toEqual([
      { kind: "h", text: "Titre" },
      { kind: "p", text: "Un paragraphe\nsur deux lignes" },
      { kind: "ul", items: ["un", "deux"] },
      { kind: "ol", items: ["premier"] },
      { kind: "code", text: "<script>x</script>" },
    ]);
  });

  it("tolerates an unterminated code fence while streaming", () => {
    expect(parseBlocks("```\nconst a = 1")).toEqual([{ kind: "code", text: "const a = 1" }]);
  });
});
