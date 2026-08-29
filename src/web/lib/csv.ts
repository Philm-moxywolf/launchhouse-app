/**
 * src/web/lib/csv.ts
 *
 * WHAT IT IS
 * A CSV reader. Text in, rows of cells out.
 *
 * WHY IT EXISTS
 * Two of the files a founder makes are spreadsheets: `content-30.csv`, the upload sheet for
 * their 30 pieces, and `outreach-firstlines.csv`. Showing either as raw text puts commas
 * and quotation marks in front of somebody who wants to check their own posts before they
 * go out. Section 5 says a CSV opens as a table, with a raw toggle.
 *
 * Splitting on commas is the version of this that looks right until a founder writes a post
 * containing a comma, which happens in the first row of the first real file. So this reads
 * quoted fields properly, including a quotation mark inside a quoted field, and treats a
 * newline inside quotes as part of the cell rather than as a new row.
 *
 * WHAT CALLS IT
 * The file viewer on the Files screen.
 *
 * WHAT IT READS AND WRITES
 * Nothing. One pure function over a string.
 */

/**
 * Rows of cells.
 *
 * A trailing newline does not produce an empty last row, because an empty row at the bottom
 * of a founder's content sheet reads as a missing post.
 */
export function parseCsv(text: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char ?? "";
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char ?? "";
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** True when the name is a spreadsheet, so the viewer knows which reader to use. */
export function isCsvName(name: string): boolean {
  return name.toLowerCase().endsWith(".csv");
}
