import { describe, expect, it } from "vitest";

import { parseSse } from "@/lib/ai/sse";

import { collect, streamOf } from "./helpers";

describe("parseSse", () => {
  it("parses events split at arbitrary chunk boundaries", async () => {
    const msgs = await collect(parseSse(streamOf(["da", "ta: hel", "lo\n", "\nevent: x\ndata: wor", "ld\n\n"])));
    expect(msgs).toEqual([{ event: undefined, data: "hello" }, { event: "x", data: "world" }]);
  });

  it("handles CRLF even when split between chunks", async () => {
    const msgs = await collect(parseSse(streamOf(["data: a\r", "\n\r", "\ndata: b\r\n\r\n"])));
    expect(msgs.map((m) => m.data)).toEqual(["a", "b"]);
  });

  it("joins multi-line data and ignores comments", async () => {
    const msgs = await collect(parseSse(streamOf([": keep-alive\n", "data: one\ndata: two\n\n"])));
    expect(msgs).toEqual([{ event: undefined, data: "one\ntwo" }]);
  });

  it("flushes a final event without trailing blank line", async () => {
    const msgs = await collect(parseSse(streamOf(["data: [DONE]"])));
    expect(msgs.map((m) => m.data)).toEqual(["[DONE]"]);
  });
});
