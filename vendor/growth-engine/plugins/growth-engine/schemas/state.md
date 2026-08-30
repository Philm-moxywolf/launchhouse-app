# .state/

## What this folder is for

Everything the toolkit needs to know about the founder's folder that is not the
founder's own work. It sits at `growth-engine/.state/`.

`ge init` lists it in `growth-engine/.gitignore` on the first run, alongside
`people/`, so none of it reaches a repository the founder shares.

Three of the things in here have schemas of their own:

| what | schema |
|---|---|
| `.state/index.md` | `index.md` |
| `.state/receipt.md` | `receipt.md` |
| `.state/ghl-accounts.md` | `ghl-accounts.md` |
| `.state/log.bytes` | `ops-log.md`, under the heading about the size record |

This file covers the rest.

## Who writes what

Every one of these has exactly one writer.

| what | the one thing that writes it |
|---|---|
| `.state/HOME` | `ge init` |
| `.state/snapshots/` | `ge snapshot`, which `ge restore` and `ge undo` read |
| `.state/log.bytes` | `ge log` |
| `.state/index.md` | `ge index` |
| `.state/receipt.md` | `ge receipt` |
| `.state/ghl-accounts.md` | `ge accounts` |
| `.state/approved-at` | `ge ledger approve` |
| `.state/memory.lock` | `ge remember`, for the length of one write |

## .state/HOME

One line, the absolute path of the `growth-engine` folder, ending in a line
break.

```
/Users/sam/Documents/launchhouse/growth-engine
```

**What it is for.** It is what lets every command tell "you are in the wrong
folder" apart from "you have not started yet", which are the two states founders
confuse most often. Its presence is also what marks a folder as a Launchhouse
folder at all: the search that finds the folder looks for this file and nothing
else.

**Who reads it.** Every command that touches a founder file, through the folder
search. `ge check` compares it against where the folder actually is and reports
the two as one line.

**How it is read.** A carriage return is taken off the end and the three byte
mark a Windows editor writes at the top is taken off the front, before the path
is compared. Both are invisible on screen, so a founder can neither see them nor
delete them, and left in place they made this file read as a different path from
the identical one in front of them.

**When it is rewritten.** `ge init` writes it again when the folder has moved and
the old place is gone, and when the same folder was reached by a different name,
which is what an alias, a mapped drive, or a Mac reaching `/tmp` as `/private/tmp`
gives you. It refuses to rewrite it when the place it names still holds a folder,
because then one of the two is a copy and quietly making the copy the real one is
how a founder loses a week.

**To move the folder deliberately:** move it, then run `ge init` from where it is
now. That is the whole procedure.

## .state/snapshots/

One flat folder holding a copy of every founder file before it was overwritten.
This is what "no backup, no write" actually means: `ge snapshot` runs before
every write in the toolkit, and a copy that cannot be made stops the write.

**The file names.** The path of the file inside `growth-engine/`, with each `/`
written as two underscores, then a dot, then the time in UTC:

```
ledger.md.20260827T021256Z
people__sam-example-com.md.20260827T021255Z
.state__receipt.md.20260827T021256Z
```

The two underscores are why `ge snapshot` refuses a file whose own name already
contains two in a row: the name could not be read back, and `ge undo` would put
the file back in the wrong place.

**Two copies in the same second.** A skill can take several backups of one file
inside one second. The second gets `-002` on the end, the third `-003`, and so on
up to `-999`, so the newest always sorts last and the oldest is the one thrown
away.

**How many are kept.** Ten per file. Twenty for anything under `people/`, because
building one prospect takes four or five backed up writes before the founder has
done anything they might want to take back. The oldest beyond that is deleted.

**A file that is not there yet.** Backing one up is a success and does nothing, so
a first write is never blocked by a backup of the file it is about to create.

## .state/approved-at

One line, the moment the last approval happened, in the founder's own clock,
written year, month, day, then `T`, then hours, minutes and seconds.

```
2026-09-15T09:04:11
```

Written by `ge ledger approve`, every time it approves anything. Read by
`ge lint`, which holds it against when `content-30.md` last changed: if the text
was edited after the approval, the approval is of a version nobody has now, and
lint says so and names `ge ledger approve --all-text` as the way to renew it.

If the line cannot be read as a time, lint falls back to when this file itself was
last written, because either one answers the same question.

## .state/memory.lock

A folder, not a file, made while `ge remember` is writing and removed when it
finishes. It holds one file, `since`, carrying the second it was claimed.

**Why a folder.** Making a directory is the one claim the standard guarantees is
atomic, so the folder itself is the claim and no lock file format had to be
invented.

**Why it exists.** Two Claude Code windows open on one folder, or one skill firing
several `ge` calls at once, used to both read a section of `memory.md`, both write
it back, both print "Remembered", and keep one of the two entries. The other was
gone with no copy anywhere, not even in the backups.

**When it gives up.** A command waits about five seconds. A claim with no time on
it, or one more than thirty seconds old, is treated as abandoned and cleared,
because a machine put to sleep part way through or a window closed would otherwise
wedge the most used command in the toolkit for ever.

Deleting this folder by hand is safe when nothing is running. If a `ge remember`
ever refuses saying another command is writing, and nothing is, wait half a minute
and run it again rather than deleting anything.

## Working files

Commands build their output in a temporary file inside this folder and move it
into place in one step, so an interrupted write never leaves half a file where a
skill is about to read a whole one.

They are named after the command that made them and end in the number of the
process that made them: `remember.src.<n>`, `ge-person-rows.<n>`,
`index.md.ge-tmp.<n>`, and so on. They are removed when the command finishes, and
on ctrl-c.

None of them is founder-facing and none of them should ever appear in a message
on screen. If one is left behind after a machine crash, deleting it is safe.

## What is guaranteed

- **Nothing in here is the founder's work.** Losing the whole folder costs the
  backups, the size record and the derived table, and no writing.
- **Every file in here is written whole and moved into place**, or not written at
  all.
- **It is ignored by git from the first run**, so it cannot reach a repository the
  founder shares.

## What you may safely edit by hand

Nothing needs editing, and most of it is rebuilt by a command anyway:
`.state/index.md` by `ge index`, `.state/log.bytes` by the next `ge log`.

Two things to leave alone. Do not edit `.state/HOME` by hand: move the folder and
run `ge init`, which is the supported way and which also tells you what it
noticed. And do not delete anything in `.state/snapshots/`. Those are the only
copies of your own work that exist, and `ge restore` and `ge undo` read them.

## A valid example

```
growth-engine/.state/HOME
growth-engine/.state/index.md
growth-engine/.state/log.bytes
growth-engine/.state/receipt.md
growth-engine/.state/ghl-accounts.md
growth-engine/.state/approved-at
growth-engine/.state/snapshots/ledger.md.20260915T090411Z
growth-engine/.state/snapshots/memory.md.20260915T090422Z
growth-engine/.state/snapshots/people__sam-example-com.md.20260915T085501Z
```

## An invalid example

```
growth-engine/.state/HOME
```

holding

```
../launchhouse/growth-engine
```

The path is relative, so it means something different depending on where the
founder is standing when a command runs. This file holds an absolute path and
nothing else. `ge check` reports the mismatch and `ge init` writes it again.
