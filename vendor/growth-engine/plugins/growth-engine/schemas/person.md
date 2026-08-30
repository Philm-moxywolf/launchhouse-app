# people/<name>.md, one file per person

## What this file is for

One file for each person the founder is selling to. Without it a prospect is a
status letter in a machine file, so "who is this, why did I pick them, what have
I sent them" has no answer anywhere, and the founder rebuilds it from memory on
the busiest afternoon of the event.

These files hold real people's names, companies and contact details. The folder
is listed in `growth-engine/.gitignore` from the moment `ge init` runs. Keep it
off shared drives and out of any repository.

They live at `growth-engine/people/`, one `.md` file each. `people/README.md` is
not a person and every command skips it.

## Who writes it

`ge person`, and it alone.

`ge person` also writes three other things, and each has exactly one writer too:

| file | which verb writes it |
|---|---|
| `growth-engine/outreach-firstlines.csv` | `ge person export firstlines` |
| the Targets section of `growth-engine/dm-openers.md` | `ge person export openers` |
| one line in `growth-engine/.gitignore` naming each of those two | the same two verbs, the first time each runs |

It never writes to `ops-log.md`. That file has one writer, `ge log`, and it is
append only, so a name written there would outlive `ge person purge`.

## Who reads it

| reader | what it takes |
|---|---|
| `ge person get`, `list`, `export` | all of it |
| `ge index` | how many files are in the folder, and the newest change |
| the `outreach-b2b` skill | prospects, and their opening lines |
| the `audience-b2c` skill | targets, and their opening lines |
| the gate summary | how many people are at each status |

## Two kinds of person, and why

| kind | reached at | keyed on |
|---|---|---|
| `prospect` | an email address | the address, lower cased |
| `target` | a platform and a handle | `<platform>:<handle>`, lower cased, `@` removed |

Nobody is both. A prospect may not carry `platform`, `handle` or
`platform_label`, and a target may not carry `email`. A file carrying both is one
person in two tracks, which is the one thing the two track rule forbids, and it
leaks: `ge person list --platform ig` would then answer with prospects, on the
sheet a B2C founder works down by hand.

**Why the two kinds have different lists of statuses.** A prospect moves through
an email sequence and a target is messaged by hand, one at a time, and the states
are genuinely different things. `enrolled` means added to a paused sequence.
`booked` means any positive commitment the target made: a booked call for a
service founder, an order or a used code for an ecommerce founder. Neither word
means anything in the other track, and adding synonyms so one list could serve
both would mean editing every consumer to gain nothing.

## The file name

Derived from the key, every time, by one rule, so any code holding the key can
find the file without a lookup table: lower case, every character that is not a
letter or a digit becomes a dash, runs of dashes collapse to one, leading and
trailing dashes go, and the result is cut to 60 characters.

`sam@example.com` becomes `people/sam-example-com.md`.
`ig:lumen.skin` becomes `people/ig-lumen-skin.md`.

The key itself is stored in the file, so nothing has to work backwards from the
name.

## The format, line by line

A comment line, then labelled fields, then three sections `ge` owns, then
`## Yours`.

```
<!-- Written by ge person. The fields and the marked blocks are ge's. Everything under ## Yours is yours. -->
key: sam@example.com
kind: prospect
name: Sam Carter
status: candidate
source: manual
created: 2026-08-27
email: sam@example.com
company: Example Ltd
first_name: Sam

## Touch log
<!-- GE:TOUCH:START -->
- 2026-08-27 email out: sent the opener
<!-- GE:TOUCH:END -->

## Opener
<!-- GE:OPENER:START -->
<!-- GE:OPENER:END -->

## Notes
<!-- GE:NOTES:START -->
- 2026-08-27 runs a 12 person team (source: their site)
<!-- GE:NOTES:END -->

## Yours
Anything below this heading is yours. ge never writes here.
```

**The fields.** Everything above the first `## ` line. One field per line, the
name, a colon, a space, then the value. A field with no value is not written at
all: an absent line means the founder does not have that fact.

Below the first `## ` line a line with a colon in it is prose. A founder who
writes `status: still thinking` under `## Yours` is writing a sentence.

A field appearing twice is a fault, reported rather than resolved, because `ge`
never takes the last one when you would be reading the other. `link` is the one
field that may repeat.

**The three sections `ge` owns.** Each is one pair of lines with the entries
between them:

| heading | the pair of lines | what goes in it |
|---|---|---|
| `## Touch log` | `<!-- GE:TOUCH:START -->` and `<!-- GE:TOUCH:END -->` | every contact, in order |
| `## Opener` | `<!-- GE:OPENER:START -->` and `<!-- GE:OPENER:END -->` | the line or two you send first |
| `## Notes` | `<!-- GE:NOTES:START -->` and `<!-- GE:NOTES:END -->` | what you know about them |

**A touch line.** One line, appended, oldest first:

```
- <YYYY-MM-DD> <channel> <direction>: <what happened>
```

**A note line.** One line, appended, oldest first, with the source clause only
when a source was given:

```
- <YYYY-MM-DD> <the note> (source: <where you saw it>)
```

**The opener section.** Free lines, no leading dash needed. At most 12 lines and
at most 2000 bytes. Both limits are there because an opener is the line or two
you send first, and pointing `--file` at a content plan by mistake put a quarter
of a megabyte into `dm-openers.md` and reported it as a success.

**`## Yours`.** Everything under it is yours. `ge` never writes there, and every
write copies it back byte for byte, carriage returns and a final line break
exactly as it found them.

## The fields, and the allowed values

| field | who has it | values |
|---|---|---|
| `key` | both | the address, or `<platform>:<handle>`. Cannot be changed |
| `kind` | both | `prospect` or `target`. Cannot be changed |
| `created` | both | the day the file was made. Cannot be changed |
| `name` | both | free text |
| `status` | prospect | `candidate`, `cut`, `contacted_ok`, `enrolled`, `replied`, `stopped` |
| `status` | target | `target`, `opener_written`, `sent`, `replied`, `booked`, `no_reply` |
| `source` | both | `manual`, `apollo`, `import`, `form` |
| `priority` | both | `1`, `2`, `3` |
| `email` | prospect | their address |
| `first_name` | prospect | free text. Falls back to the first word of `name` on export |
| `company` | prospect | free text |
| `title` | prospect | free text |
| `email_status` | prospect | `unverified`, `valid`, `risky`, `bounced` |
| `platform` | target | `ig`, `fb`, `other` |
| `handle` | target | their handle, without the `@` |
| `platform_label` | target | what to call the platform when it is `other` |
| `found_via` | both | free text |
| `why_them` | both | free text |
| `link` | both | free text. The one field that may appear more than once |
| `follow_up_on` | both | a date written year, month, day |
| `ghl_contact_id` | both | free text |
| `apollo_contact_id` | both | free text |

**`email_status` only takes `unverified` today.** Which field the other three
read from is not decided yet, and it lands in `planning/spike-findings.md`,
section S-07. Until then `ge` refuses to write a value nobody has checked, because
that would be a fact about a real person that we made up.

**Three fields cannot be changed, for three different reasons.** `key` is what
the file is named from and what every command finds them by. `kind` decides which
statuses the person can have and which fields their file carries. `created`
records the day the file was made, which is not a fact about the person. If you
meant the day you next want to reach them, that is `follow_up_on`.

**A touch.** Channel is `email`, `dm`, `call`, `form` or `other`. Direction is
`in` or `out`.

**One narrow status advance.** Recording an outbound `dm` to a target is the
send, so `ge person touch <who> dm out "..."` moves a target from `target` or
`opener_written` to `sent` by itself. It only moves forward, and only from the
two states where the meaning is plain. Nothing else advances a status on its own.

## What is guaranteed

- **A backup before every write.** `ge person` calls `ge snapshot` first, and a
  backup that fails stops the write. Person files keep 20 backups each rather
  than 10, because building one prospect takes four or five writes before the
  founder has done anything they might want to take back.
- **Nothing below the first `## ` line is reflowed.** From that line down the file
  is the founder's, and every write copies it back exactly.
- **A damaged file is refused, never repaired by guessing.**
- **One exit code, one meaning**, so a skill can act on the number rather than
  the words:
  - `0` it did what it says, and the file it read was sound.
  - `1` refused, or could not finish. Nothing was written. A damaged file is `1`
    everywhere, `get` included: `get` still prints the person, because hiding
    them helps nobody, and still exits `1`, because a skill has to tell a sound
    file from a damaged one without reading the text. `list` is the single
    exception, on purpose: it is a report, it prints the damaged person as a row
    of their own with the reason beside them, and a report that reported is `0`.
  - `2` there is no such person. `ge person` is the one place that tells that
    apart from `1`, so a skill can offer to add them instead of running the same
    command again.
- **A carriage return is taken off before any line is parsed**, and so is the
  three byte mark a Windows editor writes at the top of a file it saves, which
  draws nothing on screen and would otherwise make line 1 unreadable.

## What `ge person` refuses to put in a file

- A line break in any value. One field is one line, and a value that survives the
  write breaks the file afterwards, when nobody is watching.
- The text `<!-- GE:` in any value. That is how `ge` marks the parts of a file it
  owns, and a value carrying it would be read as the end of a section by the next
  write, taking everything under it.

## What you may safely edit by hand

All of `## Yours`, freely. That is what it is for.

The section headings and any prose you put around them, as long as you leave the
pairs of lines alone.

The fields and the three sections: prefer the commands. `ge person set`,
`ge person note`, `ge person touch` and `ge person opener` each check the value,
take a backup first, and tell you what changed. Editing by hand is not forbidden,
and if you do, hold to three things:

- One field per line, `name: value`, above the first `## ` line.
- Every line inside the Touch log and Notes sections starts with `- `.
- Never delete one of a pair of lines and never swap them round.

`ge person list` names any file that is not sound and says what is wrong with it,
one file per row. Run it after a hand edit.

## What a fault looks like

`ge person` names the shape rather than saying the file is broken, because the
repair differs for every one of them:

| what it says | what it means |
|---|---|
| a field appears twice | two lines claim the same field |
| a line inside a section does not start with `- ` | usually the second line of a pasted note |
| a touch line reads the wrong way | the channel or the direction is not one of the allowed words |
| a line inside a section carries `<!-- GE:` as text | the next write would read it as the end of that section |
| a bullet holding one character | a sentence was handed to something that expected a list |
| this file holds one of these lines and none of those | a pair is half there |
| a value is not one of the allowed ones | the field is named, with the list |

## A valid example

```
<!-- Written by ge person. The fields and the marked blocks are ge's. Everything under ## Yours is yours. -->
key: ig:lumen.skin
kind: target
name: Lumen Skin
status: sent
source: manual
created: 2026-08-27
platform: ig
handle: lumen.skin
priority: 1
why_them: posts about the exact problem we solve

## Touch log
<!-- GE:TOUCH:START -->
- 2026-08-27 dm out: sent the opener
<!-- GE:TOUCH:END -->

## Opener
<!-- GE:OPENER:START -->
Saw your post about restock week. We built the thing that fixes that bit.
<!-- GE:OPENER:END -->

## Notes
<!-- GE:NOTES:START -->
- 2026-08-27 two people, both doing customer service by hand (source: their site)
<!-- GE:NOTES:END -->

## Yours
Worth a second message in October if nothing comes back.
```

## An invalid example

```
key: sam@example.com
kind: prospect
name: Sam Carter
status: booked
created: 2026-08-27
email: sam@example.com
```

`status` reads `booked`, and `booked` belongs to a target. The six a prospect can
have are `candidate`, `cut`, `contacted_ok`, `enrolled`, `replied` and `stopped`.
`ge person set` would have refused this value and printed the six. A file in this
state came from a hand edit, and `ge person list` reports it with the reason
beside it.

## The two files the export verbs write

**`growth-engine/outreach-firstlines.csv`.** Written whole by
`ge person export firstlines`. Every prospect except those at `cut`, sorted, one
row each. Every cell is wrapped in quotes and every inner quote is doubled,
because an unquoted comma shifts every later column right and the founder finds
out when twenty five emails have gone out. The header row is:

```
"email","first_name","company","first_line","status"
```

The first line cell is the first non-empty line of that person's Opener section.
A prospect with no opener yet gets an empty cell and is counted in the summary,
rather than left out. An export refuses outright while any person file is
malformed, because an export that quietly leaves someone out is worse than no
export.

**The Targets section of `growth-engine/dm-openers.md`.** Written by
`ge person export openers`, between `<!-- GE:TARGETS:START -->` and
`<!-- GE:TARGETS:END -->`. Everything else in that file is the founder's and is
copied through. Targets are ordered by priority, then by file name, so the file
is identical run to run. A target with nothing written yet gets the line
`no opening line yet` rather than a heading with blank space under it, because
this is the file a founder works down by hand and an empty heading is a person
they scroll past while the total counts them as ready.

## Known drift, August 2026

The `outreach-b2b` skill describes `outreach-firstlines.csv` as having four
columns. `ge person export firstlines` writes five: it adds `status` at the end.
The five column version is what founders get. Fixing this means editing
`skills/outreach-b2b/SKILL.md`, not this file.
