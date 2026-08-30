# .state/index.md

## What this file is for

One table saying which of the founder's files are real. A founder three weeks in
has a dozen files and no way to see which of them have anything in them. Asking a
skill to read the folder every time gives a different answer each time.

This is what stops "I thought I had done that" turning into a missed gate on the
Friday.

It lives at `growth-engine/.state/index.md`.

## Who writes it

`ge index`, and it alone.

`ge init` builds it too, but it does so by running the real `ge index` in a child
process, so there is only ever one writer of this file and the two cannot drift.
That is deliberate: without it a founder's first two commands were `ge init` and
then a check that opened with a failure, on a folder where they had done nothing
wrong.

## Who reads it

| reader | what it takes |
|---|---|
| `ge context` | the table, to say what is done and what is next |
| `ge check` | that the file is there at all |
| every skill deciding what already exists | the table |
| the founder | it is printed on screen every time `ge index` runs |

## The format, line by line

A heading, two lines saying not to edit it, then one fixed table.

```
# Index

Derived from your files by ge index, and rebuilt every time it runs.
Nothing here is worth editing. Change a file, then run ge index again.

| file | gate | status | bytes | modified |
|---|---|---|---|---|
| founder-brain.md | gate A | missing | - | - |
| ledger.md | - | ok | 111 | 2026-08-27 03:12 |
| people/ | gate B or C | ok | 2 files | 2026-08-27 03:12 |
```

Five columns, always in this order:

| column | what it holds |
|---|---|
| file | the file name, as it sits inside `growth-engine/` |
| gate | which gate it counts towards, or `-` for none |
| status | `missing`, `empty` or `ok` |
| bytes | the size, or `-` when the file is missing |
| modified | when it last changed, to the minute, or `-` |

The rows come out in the order a founder builds the files, not alphabetically.
`people/` is always the last row.

## Allowed values

| column | values |
|---|---|
| status | `missing`, `empty`, `ok` |
| gate | `gate A`, `gate B`, `gate C`, `gate B or C`, `-` |

`empty` means the file exists and holds nothing but blank lines, which is what a
founder means when they say the file is there but there is nothing in it.

**The `people/` row reads differently on purpose.** Its `bytes` column holds a
count of files, for example `2 files`, and its `modified` column holds the time
the newest person file changed. Nothing about any individual person is ever
copied into this table. An empty `people` folder is the normal first state on all
130 machines, not a fault, so it reports `empty` and `0 files`.

## Where the gate labels come from

`ge index` carries its own list of files and gate labels. Before it prints a row
it looks that file up in `gates.md` in this folder, and uses the label there when
there is one.

The lookup reads the second column of a table row whose first cell is exactly the
file name. Which means: **if you change a gate label in `gates.md`, `ge index`
starts printing the new one.** The built-in list is the answer when `gates.md` is
absent, so the two have to agree. `gates.md` says the same thing from its side.

## Which rows appear

Rule 1 of the design is that a founder never sees the other track's material, so
this table forks on the `Track` line of `founder-brain.md`.

- Rows marked for both tracks always appear.
- A B2B founder sees `outreach-sequence.md` and `outreach-firstlines.csv`.
- A B2C founder sees `dm-openers.md`, `hook-bank.md` and `inbound-scripts.md`.
- A Brain that is not written yet has no track, so neither track's session 3
  files are listed. Showing both would show one founder the other track's work.

## What is guaranteed

- **It is derived, and rebuildable.** It is the only file in the folder that may
  be rewritten without a backup being taken first, because nothing in it is
  anywhere else.
- **Built whole, then moved into place**, so an interrupted rebuild never leaves
  half a table where a skill is about to read a whole one.
- **A file it cannot read is reported, never dropped.** A dropped row reads as
  "you have not done that", and it is not true.
- **The whole table is rebuilt every run.** Nothing in it is remembered from the
  last one.

## What you may safely edit by hand

Nothing, and there is no reason to. Change a file, then run `ge index` again.

Deleting this file loses nothing. `ge check` names `ge index` as the way to put
it back.

## A valid example

```
# Index

Derived from your files by ge index, and rebuilt every time it runs.
Nothing here is worth editing. Change a file, then run ge index again.

| file | gate | status | bytes | modified |
|---|---|---|---|---|
| founder-brain.md | gate A | ok | 2104 | 2026-09-08 17:41 |
| content-30.md | gate B | ok | 18220 | 2026-09-15 09:02 |
| content-30.csv | gate B | ok | 9331 | 2026-09-15 09:02 |
| rss-feeds.md | gate B | empty | 1 | 2026-09-15 09:02 |
| outreach-sequence.md | gate C | missing | - | - |
| outreach-firstlines.csv | gate C | missing | - | - |
| ops-workflow.md | gate C | missing | - | - |
| 90-day-plan.md | - | missing | - | - |
| playbook-insert.md | - | missing | - | - |
| ledger.md | - | ok | 1340 | 2026-09-15 09:02 |
| memory.md | - | ok | 812 | 2026-09-15 09:04 |
| ops-log.md | - | ok | 2201 | 2026-09-15 09:04 |
| people/ | gate B or C | ok | 25 files | 2026-09-15 08:55 |
```

## An invalid example

```
| file | gate | status | bytes | modified |
|---|---|---|---|---|
| founder-brain.md | gate A | done | 2104 | 2026-09-08 17:41 |
```

`status` reads `done`, and the three values are `missing`, `empty` and `ok`.
`ge index` cannot produce this. A table in this state was hand edited, and the
next `ge index` will overwrite it anyway.
