/** @jsxRuntime automatic */
/**
 * src/web/components/Notice.tsx
 *
 * WHAT IT IS
 * A box with something the founder has to read. One or more lines, an optional button, and
 * three tones.
 *
 * WHY IT EXISTS
 * Every failure in this app has to arrive as a sentence with a next click. The build
 * document says it about GoHighLevel and it is true everywhere: no status code on its own,
 * ever. Having one component for it means a screen cannot quietly render a red box with a
 * number in it, and means the shape a founder learns to read is the same on every screen.
 *
 * `tone` is about what the founder should do, not about how it looks. "problem" means
 * something did not work and there is an action. "good" means something is confirmed.
 * "plain" is a fact they need before they act.
 *
 * WHAT CALLS IT
 * Every screen.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement, ReactNode } from "react";

export type NoticeTone = "plain" | "problem" | "good";

export function Notice({
  title,
  lines,
  tone = "plain",
  actionLabel,
  onAction,
  children,
}: {
  readonly title?: string;
  readonly lines: readonly string[];
  readonly tone?: NoticeTone;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <section className={`notice notice-${tone}`} role={tone === "problem" ? "alert" : undefined}>
      {title === undefined ? null : <h2 className="notice-title">{title}</h2>}
      {lines.map((line, index) => (
        // Keyed by position as well as text, because two lines in one notice are allowed to
        // read the same and a duplicate key drops one of them silently.
        <p key={`${String(index)}-${line}`} className="notice-line">
          {line}
        </p>
      ))}
      {children}
      {actionLabel === undefined || onAction === undefined ? null : (
        <button type="button" className="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </section>
  );
}
