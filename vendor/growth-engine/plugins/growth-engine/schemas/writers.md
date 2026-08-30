# writers.md

## What this file is for

One table naming the single writer of every file in a founder's folder.

Two writers and a file drifts, quietly, and nobody can say afterwards which of the
two was right. This is the list that says which one owns each file, so a new skill
can be checked against it before it writes anything.

## Who writes it

Nobody. This file ships inside the plugin and is edited by hand, in the
repository, by whoever is maintaining the toolkit. Add a row when a new file is
added to the folder.

## Who reads it

Whoever is about to write a skill or a command that touches a founder file, and
the check that looks for a file claimed by two owners.

## The founder's work

| file | its one writer |
|---|---|
| `founder-brain.md` | the `founder-brain` skill, then the founder by hand |
| `content-30.md` | the `content-engine` skill |
| `content-30.csv` | the `content-engine` skill |
| `rss-feeds.md` | the `content-engine` skill |
| `outreach-sequence.md` | the `outreach-b2b` skill |
| `outreach-firstlines.csv` | `ge person export firstlines` |
| `hook-bank.md` | the `audience-b2c` skill |
| `inbound-scripts.md` | the `audience-b2c` skill |
| `ops-workflow.md` | the `ghl-workflows` skill |
| `90-day-plan.md` | the `growth-plan` skill |
| `playbook-insert.md` | the `playbook-export` skill |
| `ledger.md` | `ge ledger` |
| `memory.md` | `ge remember` |
| `ops-log.md` | `ge log` |
| `people/<name>.md` | `ge person` |
| `people/README.md` | `ge init` |
| `.gitignore` | `ge init` |

## The machine state

| file | its one writer |
|---|---|
| `.state/HOME` | `ge init` |
| `.state/index.md` | `ge index` |
| `.state/log.bytes` | `ge log` |
| `.state/receipt.md` | `ge receipt` |
| `.state/ghl-accounts.md` | `ge accounts` |
| `.state/approved-at` | `ge ledger approve` |
| `.state/snapshots/` | `ge snapshot` |
| `.state/memory.lock` | `ge remember` |

## The three files with two owners, and where the line is

These are not exceptions to the one writer rule. Each is split into regions, and
each region has one owner. The two never write the same bytes.

| file | who owns what |
|---|---|
| `memory.md` | `ge remember` owns the six marked sections. The founder owns everything else, including all of `## Notes` |
| `people/<name>.md` | `ge person` owns the fields and the three marked sections. The founder owns everything from `## Yours` down |
| `dm-openers.md` | `ge person export openers` owns the Targets section, between `<!-- GE:TARGETS:START -->` and `<!-- GE:TARGETS:END -->`. The `audience-b2c` skill owns the rest of the file |

## Two things `ge init` does that are not writing

`ge init` seeds a file only when it is absent, and never rewrites one that
already exists. That is why it appears above against `people/README.md` and
`.gitignore`, which nothing else touches, but not against `ledger.md`,
`memory.md` or `ops-log.md`, which it creates empty and then never opens again.

`ge init` also builds `.state/index.md`, and it does so by running the real
`ge index` in a child process rather than building the table itself, so that file
still has one writer.

## One writer that is forbidden rather than assigned

Nothing except `ge log` appends to `ops-log.md`, and `ge person` is expressly
forbidden from writing there at all. That file is append only, so a person's name
written into it would outlive `ge person purge`, which is the command whose whole
job is to destroy every trace of someone.

## What is guaranteed

- Every file a founder can end up with is in one of the tables above.
- No file has two owners of the same bytes.
- A file with a split owner says so in its own schema as well as here.

## What you may safely edit by hand

This is a maintainer's file. Nothing reads it at runtime, so an edit changes no
behaviour. It is the record, and a wrong record here is how the second writer of
a file gets added without anybody noticing.

## A valid example

```
| ledger.md | `ge ledger` |
```

## An invalid example

```
| ledger.md | `ge ledger`, and the content skill for the CSV rows |
```

Two owners of one file, written down as though that were the design. Whichever of
them wrote last would win, silently, and nothing would say which of the two was
right. If a second thing genuinely has to write into a file, give it a marked
section of its own and record the split in the table above it.
