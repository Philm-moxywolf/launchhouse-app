/** @jsxRuntime automatic */
/**
 * src/web/components/Shell.tsx
 *
 * WHAT IT IS
 * The frame around every signed in screen: the four places a founder can go, and who they
 * are signed in as.
 *
 * WHY IT EXISTS
 * Four destinations, always the same four, always in the same order. A founder who has used
 * the app once should never have to look for the way back to their files. Anything that
 * only appears sometimes goes on a screen, not in this bar.
 *
 * The bar names no engine and no track. Every track dependent link lives on Home, where it
 * is built from the filtered route table, so there is no path by which this component could
 * show a founder the other track's material.
 *
 * WHAT CALLS IT
 * app.tsx, around every screen except sign in.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement, ReactNode } from "react";
import { hrefFor } from "../lib/nav.ts";
import type { View } from "../lib/nav.ts";

const LINKS: readonly { readonly view: View; readonly label: string }[] = [
  { view: { kind: "home" }, label: "Home" },
  { view: { kind: "files" }, label: "Files" },
  { view: { kind: "gates" }, label: "Gates" },
  { view: { kind: "setup" }, label: "Setup" },
];

export function Shell({
  current,
  name,
  onSignOut,
  children,
}: {
  readonly current: View;
  readonly name: string;
  readonly onSignOut: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="shell">
      <header className="shell-header">
        <a className="shell-brand" href={hrefFor({ kind: "home" })}>
          Launchhouse
        </a>
        <nav className="shell-nav" aria-label="Main">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={hrefFor(link.view)}
              className={link.view.kind === current.kind ? "shell-link shell-link-here" : "shell-link"}
              aria-current={link.view.kind === current.kind ? "page" : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="shell-who">
          <span className="shell-name">{name}</span>
          <button type="button" className="button button-small button-quiet" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
