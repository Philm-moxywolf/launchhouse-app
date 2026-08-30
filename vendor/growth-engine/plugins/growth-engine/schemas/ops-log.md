# ops-log.md, and the size record beside it

## What this file is for

The only complete record of what a founder did. Every decision, every result,
every blocker, dated and kept. A record that can be rewritten is not a record, so
every write to it is an append. No line that already exists is ever reopened.

It lives at `growth-engine/ops-log.md`. The size record that proves it has not
been cut lives at `growth-engine/.state/log.bytes`.

## Who writes it

`ge log`, and it alone. It is also the one writer of `.state/log.bytes`.

Nothing else in the toolkit appends here, and `ge person` is expressly forbidden
from writing a name into it, because this file outlives `ge person purge`.

`ge init` seeds the two-line heading when the file is absent. `ge log` seeds the
same heading, by appending it, if it finds no file at all.

## Who reads it

| reader | what it takes |
|---|---|
| `ge check` | the size, held against `.state/log.bytes` |
| `ge index` | that the file is present, and how big it is |
| the founder | all of it. It is meant to be read |
| `ge remember` entries | a pointer, when an entry says where its detail is |

## The format, line by line

```
# Ops log

Append only, written by `ge log`. Every day gets its own heading.

## 2026-08-27

- 03:12 decision: picked the b2b track
- 03:12 result: sent 25 emails
```

**A day heading.** `## ` then the date, written year, month, day. One per day.

A new day heading is written only when the **last** `## ` line in the file is not
today's. Reusing one further up the file would file today's entry under a day the
founder has already scrolled past.

**An entry.** One line:

```
- <HH:MM> <type>: <text>
```

The time is 24 hour, the founder's own clock, and the date and the time are read
from one look at the clock so an entry cannot straddle midnight and land under
the wrong day.

The text is everything the founder typed, joined back into one line. Unquoted
text arriving as many words is joined rather than truncated to the first. Line
breaks and carriage returns inside it become spaces, because one entry is one
line and a stray line break would read as a new entry to everything that reads
this file.

## Allowed values

The four kinds, and nothing else:

| type | what it is for |
|---|---|
| `decision` | a choice you made, and the reason for it |
| `result` | something that happened, with the number if you have one |
| `blocker` | what is stopping you |
| `note` | anything else worth keeping |

## The size record at .state/log.bytes

One line, one decimal number, no spaces, ending in a line break.

```
163
```

**What the number is.** The size of `ops-log.md` in bytes **with carriage returns
left out of the count**. Not the raw file size.

**Why carriage returns are left out.** Carrying the folder between a Windows
machine and a Mac, or a repository with `core.autocrlf` set, rewrites every line
ending and changes the raw size of the file without losing a single word. Counted
raw, that reads as a log that got shorter, and the founder is told their only full
record was cut when nothing was lost at all.

**Anything comparing against this number has to count the same way**, or it is
comparing two different numbers. `ge check` does: it reads `ops-log.md` through
`tr -d '\r'` before counting.

**Who writes it.** `ge log`, and only `ge log`, immediately after an append it
knows succeeded. It is written to a temporary name and moved into place, so a
half written number never sits there.

**What happens when it cannot be written.** The entry is already safe on disk, so
`ge log` prints a warning and exits 0. A founder told the command failed would log
the same thing twice, and this file is append only.

**What happens when the log is shorter than the number.** `ge log` says so once,
at the moment it can still be traced, and says plainly that no backup of the log
is kept, because reaching for one would replace the entries still in the file with
an older copy that has fewer of them. `ge check` reports the same thing on its
`log` line.

**What happens when the number is not a number.** `ge check` reports it, quotes
what the file actually says, and names `ge log note "checked the log"` as the way
to write a fresh one.

**When there is no such file.** `ge check` says the log has no size record yet and
that `ge log` writes one on the first entry. That is a `SKIP`, not a failure.

## What is guaranteed

- **Append only.** No bug in `ge log` can cost a founder a line that is already
  there.
- **Built whole first.** The entry is written to a temporary file inside the
  folder and appended in one go, so a full disk shows up before the log is
  touched and never as half a line inside it.
- **The last byte is a line break.** A file whose last byte is not one gets a line
  break added first, so a new entry is never glued onto the end of the previous
  line.
- **No backup, deliberately.** The log is only ever added to, so there is no
  earlier copy that would be an improvement on the current one.

## What you may safely edit by hand

Read it freely. Editing it is a different matter: this file is the record, and
`ge check` reports it as damaged the moment it gets shorter.

Adding your own line by hand is fine, if you keep the shape. Deleting one is what
sets off the size check, and there is nothing to put back.

To correct something, log a new entry saying so. That is what an append-only
record is for.

## A valid example

```
# Ops log

Append only, written by `ge log`. Every day gets its own heading.

## 2026-08-27

- 09:14 decision: picked the b2b track, my buyers are agencies
- 11:02 blocker: domain is three weeks old, waiting on DMARC

## 2026-08-28

- 08:40 result: sent 25 emails
```

## An invalid example

```
## 2026-08-27

- 09:14 decision: picked the b2b track
  and my buyers are agencies
```

The entry runs onto a second line. Everything that reads this file reads one
entry per line, so the second line is a record of its own with no time and no
kind on it. `ge log` cannot produce this, because it turns line breaks in the text
into spaces. A file in this state came from a hand edit.
