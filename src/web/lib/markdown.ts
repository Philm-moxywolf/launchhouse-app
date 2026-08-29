/**
 * src/web/lib/markdown.ts
 *
 * WHAT IT IS
 * A small markdown reader. Text in, a list of blocks out. It renders nothing itself.
 *
 * WHY IT EXISTS
 * Rule 4: everything a founder makes is theirs, and it has to be visible. Their files are
 * markdown, and showing markdown as raw text puts `## Your pillars` and `**bold**` in front
 * of somebody who has never seen either. That is the moment the app stops feeling like
 * their work and starts feeling like a developer tool.
 *
 * WHY IT IS WRITTEN HERE RATHER THAN INSTALLED. A markdown library is a dependency that
 * turns founder text into HTML, and HTML from a library is rendered with
 * dangerouslySetInnerHTML. This file cannot produce HTML. It produces data, the components
 * turn that data into React elements, and React escapes text by construction. There is no
 * path from a founder's file, or from anything a model wrote into it, to executable markup.
 * The subset is small on purpose: headings, paragraphs, lists, quotes, fenced code, pipe
 * tables and a rule. Anything else arrives as the text it is, which is the honest failure.
 *
 * WHAT CALLS IT
 * The file viewer on the Files screen, and the tests beside it.
 *
 * WHAT IT READS AND WRITES
 * Nothing. Pure functions over a string.
 */

export type Span =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "em"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

export type Block =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3 | 4; readonly spans: readonly Span[] }
  | { readonly kind: "paragraph"; readonly spans: readonly Span[] }
  | { readonly kind: "bullets"; readonly items: readonly (readonly Span[])[] }
  | { readonly kind: "numbers"; readonly items: readonly (readonly Span[])[] }
  | { readonly kind: "quote"; readonly spans: readonly Span[] }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "table"; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly kind: "rule" };

/**
 * Only http and https become links.
 *
 * A founder's file is written by a model, and a scheme we do not recognise is not worth the
 * risk of finding out what a browser does with it. Everything else stays as text, visible,
 * so nothing is hidden from them either.
 */
function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(trimmed) ? trimmed : null;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/;

/** Bold, italic, code and links. Nested markup is not supported and is left as text. */
export function parseSpans(text: string): readonly Span[] {
  const out: Span[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (match === null || match.index === undefined) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (match.index > 0) out.push({ kind: "text", text: rest.slice(0, match.index) });
    const token = match[0];
    if (token.startsWith("**")) {
      out.push({ kind: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      out.push({ kind: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("[")) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = safeHref(token.slice(split + 2, -1));
      out.push(href === null ? { kind: "text", text: token } : { kind: "link", text: label, href });
    } else {
      out.push({ kind: "em", text: token.slice(1, -1) });
    }
    rest = rest.slice(match.index + token.length);
  }
  return out.filter((s) => s.kind !== "text" || s.text !== "");
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

/**
 * Text into blocks.
 *
 * Line by line and deliberately simple. Every parser in this project reads founder written
 * markdown, and `noUncheckedIndexedAccess` is on because `lines[i]` really is sometimes
 * absent. A crash here lands on a founder looking at their own work.
 */
export function parseMarkdown(text: string): readonly Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseSpans(paragraph.join(" ").trim()) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      flush();
      continue;
    }

    if (trimmed.startsWith("```")) {
      flush();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading !== null) {
      flush();
      const hashes = heading[1] ?? "#";
      blocks.push({
        kind: "heading",
        level: hashes.length as 1 | 2 | 3 | 4,
        spans: parseSpans(heading[2] ?? ""),
      });
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flush();
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        body.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "quote", spans: parseSpans(body.join(" ")) });
      continue;
    }

    if (trimmed.startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      flush();
      const head = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(splitRow((lines[i] ?? "").trim()));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      flush();
      const items: (readonly Span[])[] = [];
      while (i < lines.length && /^[-*+]\s+/.test((lines[i] ?? "").trim())) {
        items.push(parseSpans((lines[i] ?? "").trim().replace(/^[-*+]\s+/, "")));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "bullets", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      flush();
      const items: (readonly Span[])[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test((lines[i] ?? "").trim())) {
        items.push(parseSpans((lines[i] ?? "").trim().replace(/^\d+[.)]\s+/, "")));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "numbers", items });
      continue;
    }

    paragraph.push(trimmed);
  }

  flush();
  return blocks;
}
