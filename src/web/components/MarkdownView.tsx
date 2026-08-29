/** @jsxRuntime automatic */
/**
 * src/web/components/MarkdownView.tsx
 *
 * WHAT IT IS
 * Renders the blocks from lib/markdown.ts, and a CSV as a table.
 *
 * WHY IT EXISTS
 * Rule 4 again: a founder has to be able to read what they made, not just download it. This
 * is the half of that which turns parsed blocks into elements.
 *
 * The property that matters is what is missing. There is no `dangerouslySetInnerHTML` in
 * this file and there is no way to add one without changing the parser, because the parser
 * never produces HTML. Every string that reaches the screen goes through React as text, so
 * a founder's file, or a model's output inside it, cannot become markup.
 *
 * WHAT CALLS IT
 * The file viewer on the Files screen.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement, ReactNode } from "react";
import type { Block, Span } from "../lib/markdown.ts";

function spans(list: readonly Span[]): ReactNode {
  return list.map((span, index) => {
    const key = `${String(index)}-${span.text}`;
    switch (span.kind) {
      case "strong":
        return <strong key={key}>{span.text}</strong>;
      case "em":
        return <em key={key}>{span.text}</em>;
      case "code":
        return <code key={key}>{span.text}</code>;
      case "link":
        return (
          <a key={key} href={span.href} target="_blank" rel="noreferrer noopener">
            {span.text}
          </a>
        );
      case "text":
        return <span key={key}>{span.text}</span>;
    }
  });
}

function block(item: Block, index: number): ReactElement {
  const key = String(index);
  switch (item.kind) {
    case "heading": {
      const inner = spans(item.spans);
      if (item.level === 1) return <h2 key={key}>{inner}</h2>;
      if (item.level === 2) return <h3 key={key}>{inner}</h3>;
      if (item.level === 3) return <h4 key={key}>{inner}</h4>;
      return <h5 key={key}>{inner}</h5>;
    }
    case "paragraph":
      return <p key={key}>{spans(item.spans)}</p>;
    case "bullets":
      return (
        <ul key={key}>
          {item.items.map((li, i) => (
            <li key={`${key}-${String(i)}`}>{spans(li)}</li>
          ))}
        </ul>
      );
    case "numbers":
      return (
        <ol key={key}>
          {item.items.map((li, i) => (
            <li key={`${key}-${String(i)}`}>{spans(li)}</li>
          ))}
        </ol>
      );
    case "quote":
      return <blockquote key={key}>{spans(item.spans)}</blockquote>;
    case "code":
      return (
        <pre key={key} className="code-block">
          <code>{item.text}</code>
        </pre>
      );
    case "table":
      return (
        <div key={key} className="table-scroll">
          <table>
            <thead>
              <tr>
                {item.head.map((cell, i) => (
                  <th key={`${key}-h-${String(i)}`}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((row, r) => (
                <tr key={`${key}-r-${String(r)}`}>
                  {row.map((cell, c) => (
                    <td key={`${key}-r-${String(r)}-${String(c)}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "rule":
      return <hr key={key} />;
  }
}

export function MarkdownView({ blocks }: { readonly blocks: readonly Block[] }): ReactElement {
  return <div className="prose">{blocks.map(block)}</div>;
}

/**
 * A CSV as a table.
 *
 * The first row is treated as the header, which is what both of the sheets this app makes
 * have. A sheet with one row is still shown, as a header with nothing under it, because an
 * empty sheet is a thing the founder needs to see rather than a thing to hide.
 */
export function CsvView({ rows }: { readonly rows: readonly (readonly string[])[] }): ReactElement {
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th key={`h-${String(i)}`}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={`r-${String(r)}`}>
              {row.map((cell, c) => (
                <td key={`r-${String(r)}-${String(c)}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
