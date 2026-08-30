# memory.md

## What this file is for

The curated memory. What matters, not everything. The ops log keeps every step
and this keeps the handful of things worth carrying into next month: what was
decided, what worked, what did not, how the founder writes, which content angles
are used up, and what is still open.

Without it the toolkit starts fresh every Monday. An angle gets reused on a
refill, a voice correction has to be made twice, and a founder coming back in
December has only the Brain.

It lives at `growth-engine/memory.md`.

## Who writes it

`ge remember`, and it alone.

`ge init` creates the file when it is absent, with all six sections present and
empty. It never rewrites one that already exists. That is why no skill has to
create this file, which removes a whole class of first-write failure.

## Who reads it

| reader | what it takes |
|---|---|
| `ge remember list` | every entry, grouped and numbered |
| `ge context` | the last line of Decisions and the last line of Open threads |
| the content engine on a refill | Angles used, so a batch does not repeat the last one |
| any skill answering a question about a past decision | whichever section fits |

## The format, line by line

A heading, three lines of explanation, then six sections in a fixed order, then
`## Notes`.

Each of the six sections holds one pair of lines that ge owns. Everything between
that pair belongs to ge. Everything outside it belongs to the founder.

```
## Decisions
<!-- GE:DECISIONS:START -->
- 2026-08-27 picked b2b, my buyers are agencies
<!-- GE:DECISIONS:END -->
```

The six sections, in file order, and the kind you type to write into each:

| heading | the pair of lines | the kind |
|---|---|---|
| `## Decisions` | `<!-- GE:DECISIONS:START -->` and `<!-- GE:DECISIONS:END -->` | `decision` |
| `## What worked` | `<!-- GE:WORKED:START -->` and `<!-- GE:WORKED:END -->` | `worked` |
| `## What did not` | `<!-- GE:DIDNOT:START -->` and `<!-- GE:DIDNOT:END -->` | `didnot` |
| `## Voice notes` | `<!-- GE:VOICE:START -->` and `<!-- GE:VOICE:END -->` | `voice` |
| `## Angles used` | `<!-- GE:ANGLES:START -->` and `<!-- GE:ANGLES:END -->` | `angle` |
| `## Open threads` | `<!-- GE:THREADS:START -->` and `<!-- GE:THREADS:END -->` | `thread` |

**An entry line.** One line, appended at the bottom of its section, oldest first:

```
- <YYYY-MM-DD> <the text>
```

and with a pointer to the long version:

```
- <YYYY-MM-DD> <the text> (detail → <where the detail is>)
```

The date is the founder's own day, not UTC, because that is the day they will
look for when they come back to it. The pointer clause is written and read as one
fixed string, so the two can never disagree about the spacing.

**`## Notes`.** Everything under it is the founder's. `ge` never writes there.

## Allowed values

The six kinds, and nothing else: `decision`, `worked`, `didnot`, `voice`,
`angle`, `thread`.

Entry text may not contain a line break. Long detail belongs in the ops log, and
the entry points at it.

## What is guaranteed

- **Only between the two lines.** Everything outside a pair is copied through
  byte for byte: the founder's own paragraphs, the line endings their editor gave
  those lines, and a last line they left without a line break.
- **The file already reads the way ge writes it.** If the opening line of a
  section carries a carriage return, the entries written under it get one too, so
  a file saved on Windows stays a file saved on Windows all the way down.
- **A backup before every write.** `ge remember` calls `ge snapshot` first, and a
  backup that fails stops the write.
- **One write at a time.** Two Claude Code windows open on one folder used to be
  told twice that an entry was saved and keep one of them. `ge remember` now
  claims `growth-engine/.state/memory.lock` for the length of the write.
- **Nothing is guessed.** A section with two opening lines, or one opening line
  and no closing line, or the closing line above the opening line, is refused.
  `ge` says which of those it found and what to do about it, and writes nothing.

## What you may safely edit by hand

Everything outside the six pairs of lines: the heading, the explanation at the
top, the section headings themselves, and all of `## Notes`.

You can also edit an entry inside a section. Two things to hold to:

- Keep the `- ` at the front. A line inside a section that does not start with
  `- ` is read as a fault by the reader.
- Do not delete either of a section's two lines, and do not swap them round. That
  is the one state `ge` will not repair by guessing, because guessing where a
  section starts and stops is how a founder loses a paragraph.

To change an entry through `ge` rather than by hand, use
`ge remember --amend <kind> <number> "<new text>" --expect "<what it reads now>"`.
The `--expect` is what stops it writing over a line you have since reworded
yourself.

## A valid example

```
# Memory

Curated. What matters, not everything. The full record is in ops-log.md.
Written by: ge remember. Do not hand-edit inside the marked blocks.

## Decisions
<!-- GE:DECISIONS:START -->
- 2026-08-27 picked b2b, my buyers are agencies (detail → ops-log.md 2026-08-27)
<!-- GE:DECISIONS:END -->

## What worked
<!-- GE:WORKED:START -->
<!-- GE:WORKED:END -->

## What did not
<!-- GE:DIDNOT:START -->
<!-- GE:DIDNOT:END -->

## Voice notes
<!-- GE:VOICE:START -->
- 2026-08-27 never says "solutions". Says "the thing that fixes it"
<!-- GE:VOICE:END -->

## Angles used
<!-- GE:ANGLES:START -->
<!-- GE:ANGLES:END -->

## Open threads
<!-- GE:THREADS:START -->
- 2026-08-27 still deciding whether to keep the Tuesday newsletter
<!-- GE:THREADS:END -->

## Notes
Anything below this heading is yours. ge never writes here.
```

## An invalid example

```
## Decisions
<!-- GE:DECISIONS:START -->
- 2026-08-27 picked b2b, my buyers are agencies

## What worked
<!-- GE:WORKED:START -->
<!-- GE:WORKED:END -->
```

The Decisions section has an opening line and no closing line, so nothing can say
where it stops. `ge remember decision` refuses and names the line to add rather
than guessing, because the nearest guess would take the two headings under it
with it.
