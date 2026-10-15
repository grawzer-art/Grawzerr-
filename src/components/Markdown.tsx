import { Fragment, type ReactNode } from "react";

/**
 * Tiny, safe Markdown subset renderer for assistant replies. It builds React
 * elements (never raw HTML), so model output cannot inject markup or scripts.
 * Supported: paragraphs, line breaks, "-"/"*"/"1." lists, ### headings,
 * fenced code blocks, `inline code`, **bold** and *italic*.
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; text: string };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flushPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: "h", text: heading[1] });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      const prev = blocks[blocks.length - 1];
      const text = (ul ?? ol)![1];
      if (prev && prev.kind === kind) prev.items.push(text);
      else blocks.push({ kind, items: [text] });
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  const pushText = (s: string) => {
    const parts = s.split("\n");
    parts.forEach((p, idx) => {
      if (idx > 0) out.push(<br key={`${keyPrefix}-br-${n++}`} />);
      if (p) out.push(<Fragment key={`${keyPrefix}-t-${n++}`}>{p}</Fragment>);
    });
  };
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={`${keyPrefix}-c-${n++}`}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={`${keyPrefix}-b-${n++}`}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={`${keyPrefix}-e-${n++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) pushText(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return <h3 key={i}>{renderInline(b.text, `h${i}`)}</h3>;
          case "code":
            return (
              <pre key={i}>
                <code>{b.text}</code>
              </pre>
            );
          case "ul":
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `u${i}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `o${i}-${j}`)}</li>
                ))}
              </ol>
            );
          default:
            return <p key={i}>{renderInline(b.text, `p${i}`)}</p>;
        }
      })}
    </>
  );
}
