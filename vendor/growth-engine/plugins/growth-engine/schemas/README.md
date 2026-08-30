# schemas

One file here for every file the toolkit keeps state in.

Founder files say where their own format is written down. `growth-engine/ledger.md`
opens with `Format: schemas/ledger.md`, and `growth-engine/.state/ghl-accounts.md`
opens with `Format: schemas/ghl-accounts.md`. Those lines point here.

## Where this folder is on your machine

It ships inside the plugin, not inside your `growth-engine/` folder. In a command
the plugin folder is `$CLAUDE_PLUGIN_ROOT`, so these files are at
`$CLAUDE_PLUGIN_ROOT/schemas/`. You can also read them in the repository the
plugin was installed from, which is the easier of the two.

Nothing here is written by `ge` and nothing here is copied into your folder. They
are the record of what the files mean, kept next to the code that writes them.

## What each file covers

| schema | the file it describes |
|---|---|
| `brain.md` | `growth-engine/founder-brain.md` |
| `memory.md` | `growth-engine/memory.md` |
| `ops-log.md` | `growth-engine/ops-log.md`, and the size record beside it |
| `ledger.md` | `growth-engine/ledger.md` |
| `person.md` | `growth-engine/people/<name>.md`, one per person |
| `index.md` | `growth-engine/.state/index.md` |
| `gates.md` | which gate each file counts towards |
| `receipt.md` | `growth-engine/.state/receipt.md` |
| `ghl-accounts.md` | `growth-engine/.state/ghl-accounts.md` |
| `state.md` | everything else inside `growth-engine/.state/` |
| `writers.md` | the one writer of each file, in one table |

## The shape every schema here follows

1. What the file is for.
2. Who writes it. Exactly one thing writes each file, and it is named.
3. Who reads it.
4. The format, line by line.
5. The allowed values, where a field only takes a short list.
6. What is guaranteed about the file.
7. What you may safely edit by hand.
8. A valid example.
9. An invalid example, and one sentence on what is wrong with it.

## Two rules that hold across all of them

**One writer.** Every file has exactly one thing that writes it. Two writers and
the file drifts, quietly, and nobody can say which of the two was right.
`writers.md` is the table of who owns what.

**Nothing outside a marked section is ever touched.** Three files here are shared:
`memory.md` and every person file are part yours and part ge's, and ge writes only
between its own lines. Your own paragraphs, your line endings, and a last line you
left without a line break all come back exactly as they went in.

## If a schema and the code disagree

The code wins, and the schema is the bug. These files are checked against the
code by hand, so a change in `scripts/cmd/` can leave one of them behind. Read
the code, then fix the schema in the same commit.
