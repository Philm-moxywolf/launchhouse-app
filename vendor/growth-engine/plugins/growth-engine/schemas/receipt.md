# .state/receipt.md

## What this file is for

The record of what the setup checks found, and the day the GoHighLevel token was
made. One line per check.

The date line is what raises the ageing token warning. A GoHighLevel Private
Integration Token stops working at 90 days, and without one line saying when this
one was made, the first a founder hears of a dead token is a post that will not
send during the event weekend, which is the one time nobody is free to debug it.

It lives at `growth-engine/.state/receipt.md`.

## Who writes it

`ge receipt`, and it alone. The setup and connect skills call it rather than
writing the file themselves.

Without a single writer that line is prose, written differently by every skill,
and the warning either never fires or fires at a founder whose token is fine.

## Who reads it

| reader | what it takes |
|---|---|
| `ge receipt show` | the whole file |
| `ge check`, the `receipt` line | how many results there are, and which of them are `FAIL` |
| `ge check`, the `token` line | `pit_created`, and how many days ago that was |
| `ge context` | a `token FAIL` line, and `pit_created` past 80 days |

## The format, line by line

A heading, four lines of explanation, then one line per check.

```
# Setup receipt

One line per check: the name, then PASS or FAIL or SKIP, then what was seen.
Written by ge receipt. Do not hand edit.
It holds the day your token was made. It never holds the token.

plugin PASS growth-engine 0.2.0
ghl PASS location connected, 4 social accounts
apollo SKIP not needed on Microsoft 365
pit_created 2026-08-01
```

**A result line.** Three parts, separated by single spaces:

```
<check name> <PASS|FAIL|SKIP> <what was seen>
```

The check name is the key the file is searched by. Setting a check that is
already there replaces that one line and nothing else moves. A check that is not
there yet is added at the end.

A name is one word: letters, numbers, dots, dashes or underscores. A name with a
space in it would split into a different key every time it is read back.

The evidence is everything after the result, joined back into one line, so a
founder who forgets the quotes still gets their whole sentence recorded. A check
recorded with no evidence gets a single dash.

**The date line.** One line, exactly:

```
pit_created <YYYY-MM-DD>
```

The command takes it either way round, `ge receipt set pit-created 2026-08-01` or
`ge receipt set pit_created 2026-08-01`, and the file always stores the underscore
form. There is one such line.

**Why the explanation lines are safe.** A line only counts as a result when its
second word is `PASS`, `FAIL` or `SKIP`. The sentences in the header start with a
word and carry on in prose, so none of them can be read as a check by accident.

## Allowed values

| field | values |
|---|---|
| result | `PASS`, `FAIL`, `SKIP`. Typed in any case, stored in capitals |
| check name | one word of letters, numbers, dots, dashes or underscores |
| evidence | one line of text. A single dash means nothing was recorded |
| `pit_created` | a real day, written year, month, day, not in the future |

**The date is checked twice, on purpose.** First the shape, because GNU `date`
happily reads "last tuesday" and would store a typed phrase as a fact. Then the
calendar, counted here rather than handed to the date program, because BSD `date`
rolls `2026-02-30` forward to 2 March and accepts it while GNU `date` refuses it,
so a receipt written on a mentor's Mac would read one way there and another way on
a founder's Windows machine.

A day that has not happened yet is refused outright. It is a mistyped year, and
it is the one typo this line cannot afford: a date in 2027 turns the warning off
until 2027, and the token stops working during the event with nothing having said
a word about it.

## What this file never holds

The token itself. It records that a token exists and the day it was made, and
nothing more.

Any value carrying `pit-` in any case is refused before it reaches the file, both
in a check name and in the evidence, because a secret written into a file is then
in a backup and in the next support screenshot.

## What is guaranteed

- **A backup before every write.** `ge receipt` calls `ge snapshot` first, and a
  backup that fails stops the write.
- **One line changes at a time.** Setting a check rewrites that check's line and
  copies every other line through.
- **Built whole, then moved into place.** A half written receipt never sits on
  disk.
- **Carriage returns are stripped on read**, so a receipt opened in Notepad still
  parses.

## What you may safely edit by hand

The file says do not hand edit, and that is the right default. Everything in it
can be set through `ge receipt set`, which checks the value, refuses a token
shaped one, and takes a backup first.

Reading it is fine and useful: `ge receipt show` prints it.

If you do edit it, the one line to be careful with is `pit_created`. `ge check`
ages the token from it, and a wrong date there is worse than no date, because it
silences the warning rather than raising a wrong one.

## A valid example

```
# Setup receipt

One line per check: the name, then PASS or FAIL or SKIP, then what was seen.
Written by ge receipt. Do not hand edit.
It holds the day your token was made. It never holds the token.

plugin PASS growth-engine 0.2.0
ghl PASS location connected, 4 social accounts
token PASS scopes accepted
apollo SKIP mailbox is Microsoft 365, manual route instead
pit_created 2026-09-14
```

## An invalid example

```
ghl PASS connected with pit-and then the token itself
pit_created 14/09/2026
```

Two things are wrong. The evidence carries the token, which `ge receipt` refuses
outright, and which would then be in a backup and in the next screenshot. And the
date is written day first, so nothing can read it: `ge check` reports it as a date
it cannot read and the ageing warning never fires.
