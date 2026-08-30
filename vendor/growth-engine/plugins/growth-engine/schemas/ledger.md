# ledger.md

## What this file is for

One row per piece of content, and the state that piece is in. Thirty pieces move
from written, to approved, to scheduled, to posted over three weeks, and with no
file holding that state the founder re-reads thirty drafts to work out what is
left.

It is also the only thing that records approval. Publishing posts approved rows
only, so a piece that never comes through here can never be scheduled, and the
founder never learns why.

It lives at `growth-engine/ledger.md`.

## Who writes it

`ge ledger`, and it alone. The file says so in its own second line.

`ge init` seeds the two-line heading when the file is absent. It never rewrites
one that already exists.

`ge ledger approve` also writes `growth-engine/.state/approved-at`. That file is
covered in `state.md`.

## Who reads it

| reader | what it takes |
|---|---|
| `ge ledger list C` | every content row, laid out in columns |
| `ge lint` | field counts and values, one warning per bad row |
| `ge index` | that the file is present, and how big it is |
| the publishing flow | the rows at `approved`, and nothing else |

## The format, line by line

A heading, one line naming the writer, then one row per piece. Rows sit at the
bottom, and anything that is not a row is copied through untouched.

```
# Ledger

One writer: `ge ledger`. Do not hand-edit. Format: schemas/ledger.md
C|1|1|short-post|text|draft|-|-
```

**The content row.** Eight fields, separated by the `|` character:

```
C|<id>|<pillar>|<format>|<lane>|<status>|<post id>|<goes out>
```

| # | field | what it is |
|---|---|---|
| 1 | row type | always `C`. It is the only row type `ge ledger` writes |
| 2 | id | what you call the piece. Unique across the file |
| 3 | pillar | a whole number. Which content pillar it belongs to |
| 4 | format | what shape it is, for example `short-post` or `carousel` |
| 5 | lane | `text` or `media` |
| 6 | status | where the piece has got to |
| 7 | post id | the id the platform gave it once posted, or `-` |
| 8 | goes out | when it is scheduled for, or `-` |

The separator is a pipe because it cannot appear in an id, a format, a status or
a post id, and because a founder can read the file without a tool. No value may
contain one, and `ge ledger` refuses any that does.

**How rows are read.** A row is a line beginning `C|`. Anything else is prose and
is left exactly as it is. A row with the wrong number of fields is copied through
byte for byte and reported, never rewritten and never silently skipped, because a
skipped row is a piece of work the founder thinks they have not done.

## Allowed values

| field | values |
|---|---|
| lane | `text`, `media` |
| status | `draft`, `approved`, `scheduled`, `posted`, `failed`, `archived` |
| pillar | digits only, and not empty |
| goes out | `-`, or `2026-09-25`, or `2026-09-25T09:00`, or `2026-09-25T09:00:00` |
| post id | anything without a pipe, and not empty. `-` means not set |
| id | anything without a pipe. It may not start with a dash on a new row |

**Why an id may not start with a dash.** `ge ledger approve -x` reads `-x` as an
option and would never find the piece, so the founder could write it and never
post it. A row written before that rule existed is still reachable:
`ge ledger approve -- -x` says the next word is an id and not an option, and
every verb that takes an id honours it.

**Dates are checked for shape, not handed to the date program.** GNU `date`
accepts words like `tomorrow` and BSD `date` does not, and two founders comparing
notes would both be right.

## The approval gate

Approval is the one transition with a gate in front of it, and publishing trusts
that gate.

- `ge ledger approve <id>` and `ge ledger approve --all-text` are the only ways a
  piece becomes `approved`. `ge ledger set-content <id> status approved` is
  refused and names approve instead.
- A piece at `draft` cannot be set to `scheduled` or `posted`. Those two are what
  put a piece in front of an audience, and reaching either from `draft` means it
  went out without anyone reading it again. Both are allowed once approved,
  because that is how publishing records what it did.
- Approving requires `growth-engine/content-30.md` to exist and to have something
  in it. An approval is of a text, and with no file, approve was recording a
  decision about words nobody had written.
- Approving a piece that is already approved is allowed on purpose. An approval
  is of the words as they read today, so a founder who edits `content-30.md` has
  to be able to say so.
- `--all-text` takes text lane rows at `draft` or `approved`. Media rows are
  never touched, because the asset has to exist first.

## What is guaranteed

- **A backup before every write.** `ge ledger` calls `ge snapshot ledger.md`
  first, and a backup that fails stops the write.
- **One move at the end.** Every change is built in a temporary file and moved
  into place, so an interrupted write never leaves half a ledger.
- **Rows it cannot read survive.** A malformed row comes out of any rewrite
  exactly as it went in.
- **The last byte is a line break before a row is added**, so a new row is never
  glued onto the end of the founder's own last sentence.
- **Carriage returns are stripped before parsing and are not written back into a
  field**, so a ledger opened in Notepad still reads correctly.

## What you may safely edit by hand

The heading and any prose you add around the rows. Those are copied through.

The rows themselves: do not. The file says so in its own second line. Everything a
row holds can be set through `ge ledger set-content`, which checks the value
before it writes it, takes a backup first, and tells you what changed.

If a row is already wrong, `ge lint` names the line number, and `ge restore
ledger.md` puts back the last copy `ge` wrote.

## A valid example

```
# Ledger

One writer: `ge ledger`. Do not hand-edit. Format: schemas/ledger.md
C|1|1|short-post|text|approved|-|2026-09-25T09:00
C|2|1|carousel|media|draft|-|-
C|3|2|short-post|text|posted|ghl_88213|2026-09-19T08:30
```

## An invalid example

```
C|4|first|short-post|text|approved|-|-
```

The pillar reads `first`, and a pillar is a whole number. `ge ledger` refuses to
write that row at all. A row in this state came from a hand edit, and `ge lint`
reports the line so it can be corrected one line at a time.

## The two row types that are gone

People used to live in this file as two more row types. They moved out into
`growth-engine/people/`, one file each, and `ge ledger` no longer writes or lists
either one. See `person.md`.

`ge lint` still reads them, so a folder built before the move is told once per row
type that they are there and where people live now. Nothing deletes them. The
shapes, recorded here so a survivor can still be read:

```
O|<email>|<first_name>|<company>|<status>|<first line y or n>
D|<handle>|<platform>|<status>|<sent at, or a dash>
```

The `O` row was the outreach row, six fields, with statuses `candidate`, `cut`,
`contacted_ok`, `enrolled`, `replied` and `stopped`.

The `D` row was the hand-sent message row, five fields, platform `ig`, `fb` or
`other`, with statuses `target`, `opener_written`, `sent`, `replied`, `booked`
and `no_reply`.

**Why there were ever two.** The outreach row is keyed on an email address and
carries a B2B-only list of statuses. The twenty five messages half the cohort
sends by hand on the Saturday have no email address and no representable state in
it, so `ge status` reported zero for them for ever. That is why the second row
type existed, and it is why the person file today carries two lists of statuses
rather than one. The full reasoning now lives in `person.md`.
