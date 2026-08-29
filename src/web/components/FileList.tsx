/** @jsxRuntime automatic */
/**
 * src/web/components/FileList.tsx
 *
 * WHAT IT IS
 * The list of everything a founder has made, one row each, with a download on every row.
 *
 * WHY IT EXISTS
 * Rule 4: everything a founder makes belongs to them and must be visible and downloadable.
 * On a laptop that was a folder they could open. On a server it is this list, and if the
 * list is wrong or hard to read then the rule is not kept, whatever the database says.
 *
 * Two decisions in here are about the reader, not the data. The plain name is what they
 * read first and the file name sits under it in smaller type, because "Your 30 pieces" is
 * what they made and `content-30.md` is what it is called on a disk they will download it
 * to. And the status is a phrase, not a word from a schema: `missing` becomes "Not made
 * yet", which is a state, not a fault.
 *
 * WHAT CALLS IT
 * The Files screen, and the Home screen for the short version.
 *
 * WHAT IT READS AND WRITES
 * Nothing. The download link is a plain anchor, so the browser saves the file with no
 * JavaScript in the path and a failed download is the browser's own message.
 */

import type { ReactElement } from "react";
import type { FileRow } from "../lib/api.ts";
import { downloadUrl } from "../lib/api.ts";
import { formatBytes, formatWhen, plainFileName } from "../lib/format.ts";
import { hrefFor } from "../lib/nav.ts";

/** The three statuses `ge index` writes, in the words a founder reads. */
export const STATUS_WORDS: Readonly<Record<FileRow["status"], string>> = {
  missing: "Not made yet",
  empty: "Started, almost nothing in it",
  ok: "Written",
};

export function FileList({
  rows,
  timezone,
  emptyMessage,
}: {
  readonly rows: readonly FileRow[];
  readonly timezone: string | null;
  readonly emptyMessage: string;
}): ReactElement {
  if (rows.length === 0) return <p className="quiet">{emptyMessage}</p>;
  return (
    <ul className="file-list">
      {rows.map((row) => {
        const madeYet = row.status !== "missing";
        return (
          <li key={row.name} className={`file-row file-row-${row.status}`}>
            <div className="file-row-main">
              {madeYet ? (
                <a className="file-row-name" href={hrefFor({ kind: "file", name: row.name })}>
                  {plainFileName(row.name)}
                </a>
              ) : (
                <span className="file-row-name">{plainFileName(row.name)}</span>
              )}
              <span className="file-row-filename">{row.name}</span>
            </div>
            <div className="file-row-meta">
              <span className="file-row-status">{STATUS_WORDS[row.status]}</span>
              {row.count === undefined ? null : (
                <span className="file-row-count">{row.count === 1 ? "1 person" : `${String(row.count)} people`}</span>
              )}
              {madeYet && row.sizeBytes > 0 ? (
                <span className="file-row-size">{formatBytes(row.sizeBytes)}</span>
              ) : null}
              {row.changedAt === null ? null : (
                <span className="file-row-when">{formatWhen(row.changedAt, timezone)}</span>
              )}
            </div>
            <div className="file-row-actions">
              {madeYet ? (
                <a className="button button-small" href={downloadUrl(row.name)}>
                  Download
                </a>
              ) : (
                <span className="quiet">Nothing to download yet</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
