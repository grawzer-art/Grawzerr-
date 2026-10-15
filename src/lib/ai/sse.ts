export interface SseMessage {
  event?: string;
  data: string;
}

/**
 * Minimal Server-Sent Events parser (WHATWG event-stream format): handles
 * chunk boundaries anywhere, CRLF/LF/CR line endings, multi-line data fields
 * and comment lines.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];
  let finished = false;

  /** Returns a complete message when the line terminates one. */
  const processLine = (line: string): SseMessage | null => {
    if (line === "") {
      if (data.length === 0) {
        event = undefined;
        return null;
      }
      const msg: SseMessage = { event, data: data.join("\n") };
      event = undefined;
      data = [];
      return msg;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let val = colon === -1 ? "" : line.slice(colon + 1);
    if (val.startsWith(" ")) val = val.slice(1);
    if (field === "data") data.push(val);
    else if (field === "event") event = val;
    return null;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.search(/\r\n|\n|\r/)) !== -1) {
        // A trailing "\r" may be the first half of a "\r\n" split across chunks.
        if (newline === buffer.length - 1 && buffer[newline] === "\r") break;
        const line = buffer.slice(0, newline);
        const sepLength = buffer.startsWith("\r\n", newline) ? 2 : 1;
        buffer = buffer.slice(newline + sepLength);
        const msg = processLine(line);
        if (msg) yield msg;
      }
    }
    buffer += decoder.decode();
    // End of stream: dispatch whatever is left as if a blank line followed.
    for (const line of [...buffer.split(/\r\n|\n|\r/), ""]) {
      const msg = processLine(line);
      if (msg) yield msg;
    }
  } finally {
    // Consumer stopped early (abort, error): cancel the upstream request body.
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
