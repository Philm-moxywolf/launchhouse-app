/** @jsxRuntime automatic */
/**
 * src/web/routes/Files.tsx
 *
 * WHAT IT IS
 * Everything a founder has made. The list, one file open on screen, and the downloads.
 *
 * WHY IT EXISTS
 * Rule 4, and this screen is the whole of it. On a laptop the founder had a folder they
 * could open, copy and keep. On a server they have this, and if it is incomplete or hard to
 * read then their work is not really theirs, whatever the database contains.
 *
 * Three things follow, and each is here because leaving it out is the usual way this goes
 * wrong. Every file has its own download, so nobody has to take the whole folder to get one
 * file. There is one button that takes everything, because a founder who wants to leave
 * with their work should not have to click nineteen times. And the internal folder is shown
 * rather than hidden, behind a disclosure labelled in plain words, because a folder we hide
 * is a folder they do not own.
 *
 * RULE 1. The rows are filtered by track here as well as on the server. `ge index` already
 * forks on the Track line, so in the ordinary case every row that arrives is theirs. This
 * filter is what makes a bug on the other side of the wire show up as a missing row rather
 * than as the other track's material on their screen.
 *
 * WHAT CALLS IT
 * app.tsx, on `#/files` and `#/files/<name>`.
 *
 * WHAT IT READS AND WRITES
 * Reads the file index and one file's text. Downloads are plain links, so the browser does
 * the saving and no JavaScript sits between a founder and their own file.
 */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { downloadAllUrl, downloadUrl, fetchFile, fetchFiles } from "../lib/api.ts";
import type { FilesState, Founder } from "../lib/api.ts";
import { visibleFileRows } from "../lib/track.ts";
import { parseMarkdown } from "../lib/markdown.ts";
import { isCsvName, parseCsv } from "../lib/csv.ts";
import { plainFileName, sameFileName } from "../lib/format.ts";
import { hrefFor } from "../lib/nav.ts";
import { FileList } from "../components/FileList.tsx";
import { CsvView, MarkdownView } from "../components/MarkdownView.tsx";
import { Notice } from "../components/Notice.tsx";
import { Working } from "../components/Working.tsx";

export function Files({ founder }: { readonly founder: Founder }): ReactElement {
  const [state, setState] = useState<FilesState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchFiles().then((result) => {
      if (!live) return;
      if (result.ok) setState(result.value);
      else setProblem(result.problem.text);
    });
    return () => {
      live = false;
    };
  }, []);

  if (problem !== null) {
    return (
      <div className="page">
        <h1>Your files</h1>
        <Notice tone="problem" lines={[problem]} />
      </div>
    );
  }

  if (state === null) {
    return (
      <div className="page">
        <h1>Your files</h1>
        <Working what="Fetching your files." />
      </div>
    );
  }

  const rows = visibleFileRows(state.rows, founder.track);
  const stateRows = visibleFileRows(state.stateRows, founder.track);

  return (
    <div className="page">
      <h1>Your files</h1>
      <p className="lede">
        Everything here is yours. Take a copy whenever you like, and take it with you when the event is over.
      </p>

      <FileList
        rows={rows}
        timezone={founder.timezone}
        emptyMessage="You have not made anything yet. Start with your Founder Brain."
      />

      <section className="download-all">
        <h2>Take everything</h2>
        <p>One file with all of it inside, in the same shape as the folder. It opens on any computer.</p>
        <label className="checkbox">
          <input type="checkbox" checked={snapshots} onChange={(event) => setSnapshots(event.target.checked)} />
          <span>Include the older versions we have kept</span>
        </label>
        <a className="button button-big" href={downloadAllUrl(snapshots)}>
          Download everything
        </a>
      </section>

      <details className="state-files">
        <summary>The notes the app keeps for itself</summary>
        <p className="quiet">
          These are ours, and they are yours too. They are how the app knows where you are up to.
        </p>
        <FileList rows={stateRows} timezone={founder.timezone} emptyMessage="Nothing here yet." />
      </details>
    </div>
  );
}

/**
 * One file, open.
 *
 * Markdown is rendered and a spreadsheet becomes a table, because the point is reading it
 * rather than inspecting it. The raw toggle is there for the founder who wants to see
 * exactly what is in the file, which is also what they get when they download it.
 */
export function FileView({ founder, name }: { readonly founder: Founder; readonly name: string }): ReactElement {
  const [text, setText] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    let live = true;
    setText(null);
    setProblem(null);
    void fetchFile(name).then((result) => {
      if (!live) return;
      if (result.ok) setText(result.value.text);
      else setProblem(result.problem.text);
    });
    return () => {
      live = false;
    };
  }, [name]);

  // Rule 1. An address can be typed, so the name is checked against the rows this founder
  // is allowed to see before anything is fetched onto the screen.
  const allowed = useAllowedFileNames(founder);
  const permitted = allowed === null || allowed.some((known) => sameFileName(known, name));

  return (
    <div className="page">
      <p className="crumb">
        <a href={hrefFor({ kind: "files" })}>Back to your files</a>
      </p>
      <h1>{plainFileName(name)}</h1>
      <p className="quiet">{name}</p>

      {!permitted ? (
        <Notice
          tone="problem"
          title="That is not one of yours"
          lines={["There is no file of that name in your folder. If somebody sent you this link, they had the wrong one."]}
        />
      ) : problem !== null ? (
        <Notice tone="problem" lines={[problem]} />
      ) : text === null ? (
        <Working what="Opening the file." />
      ) : (
        <>
          <div className="button-row">
            <a className="button button-small" href={downloadUrl(name)}>
              Download
            </a>
            <button type="button" className="button button-small button-quiet" onClick={() => setRaw(!raw)}>
              {raw ? "Show it tidied up" : "Show it exactly as it is"}
            </button>
          </div>
          {raw ? (
            <pre className="raw">{text}</pre>
          ) : isCsvName(name) ? (
            <CsvView rows={parseCsv(text)} />
          ) : (
            <MarkdownView blocks={parseMarkdown(text)} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The names this founder is allowed to open.
 *
 * Null while the index has not arrived, which means "we do not know yet" and not "nothing is
 * allowed". The server is the real guard; this stops a pasted link rendering a heading and
 * a file name from the other track before the request comes back.
 */
function useAllowedFileNames(founder: Founder): readonly string[] | null {
  const [names, setNames] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetchFiles().then((result) => {
      if (!live || !result.ok) return;
      const rows = [...visibleFileRows(result.value.rows, founder.track), ...visibleFileRows(result.value.stateRows, founder.track)];
      setNames(rows.map((r) => r.name));
    });
    return () => {
      live = false;
    };
  }, [founder.track]);
  return names;
}
