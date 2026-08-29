# gates.md

## What this file is for

Which gate each file counts towards, and what each gate actually asks for. One
source, so the label a founder sees in their index and the list a mentor checks
against cannot say two different things.

There are three gates, one after each of the three sessions. They exist so that
nobody arrives in Atlanta unable to build.

## Who writes it

Nobody. This file ships inside the plugin and is edited by hand, in the
repository, by whoever is maintaining the toolkit.

## Who reads it

| reader | what it takes |
|---|---|
| `ge index` | the gate label in column 2 of the table below |
| the gate summary command | the item lists |
| the status skill | the item lists |
| a mentor before a session | all of it |

## The table `ge index` reads

`ge index` looks each file up here by name and prints the label in the second
column. When this file is absent it falls back to the same list, held in
`scripts/cmd/index.sh`. **The two have to agree.** Change a label here and the
founder's index changes; change one there and this file is out of date.

Column three says which track sees the row. `both` means every founder. A founder
never sees the other track's rows.

| file | gate | track | session |
|---|---|---|---|
| founder-brain.md | gate A | both | 1 |
| content-30.md | gate B | both | 2 |
| content-30.csv | gate B | both | 2 |
| rss-feeds.md | gate B | both | 2 |
| outreach-sequence.md | gate C | b2b | 3 |
| outreach-firstlines.csv | gate C | b2b | 3 |
| dm-openers.md | gate C | b2c | 3 |
| hook-bank.md | gate C | b2c | 3 |
| inbound-scripts.md | gate C | b2c | 3 |
| ops-workflow.md | gate C | both | 3 |
| 90-day-plan.md | - | both | the weekend |
| playbook-insert.md | - | both | before the print deadline |
| ledger.md | - | both | any |
| memory.md | - | both | any |
| ops-log.md | - | both | any |
| people/ | gate B or C | both | 2 and 3 |

A dash in the gate column means the file is real work but no gate counts it.

## How an item is proved

Every item below is marked one of two ways:

- **file-backed.** A file exists and has real content in it. Nobody has to be
  believed. Check the file.
- **self-reported.** Nothing in the folder can prove it, so the founder is asked
  and the answer is recorded as an answer, not as evidence.

Never mark something done because the founder says it is done, when a file could
have proved it. Check the file exists and has real content. If a file exists but
is nearly empty, say so.

## Gate A, after session 1

| item | proved by | which file |
|---|---|---|
| the Brain exists and is locked | file-backed | founder-brain.md, its Locked line |
| a track is chosen | file-backed | founder-brain.md, its Track line |
| the thesis is written | file-backed | founder-brain.md, its Thesis section |
| the voice is captured | file-backed | founder-brain.md, its Voice section |
| the flags are answered honestly | self-reported | the Flags section is read, not counted |

For B2B, the flag that matters most is the domain: how old it is, and whether SPF,
DKIM and DMARC are set. For B2C it is the Instagram account type. Both are
time-critical and both are self-reported at this gate.

## Gate B, after session 2

| item | proved by | which file |
|---|---|---|
| thirty pieces are written | file-backed | content-30.md |
| the upload sheet is exported | file-backed | content-30.csv |
| a source list for the refill exists | file-backed | rss-feeds.md |
| the pieces have been read and approved | file-backed | ledger.md, rows at approved |
| the pieces sound like the founder | self-reported | nothing can measure this |

Approval is what makes a piece publishable, and it is recorded in the ledger by
`ge ledger approve`. A piece the founder has read but never approved counts as not
done, and that is on purpose.

## Gate C, after session 3, B2B

| item | proved by | which file |
|---|---|---|
| the sequence is approved | file-backed | outreach-sequence.md |
| the list criteria are written down | file-backed | outreach-sequence.md |
| the list is built | file-backed | people/, prospects |
| first lines exist for the first 25 | file-backed | outreach-firstlines.csv |
| the workflow is built | file-backed | ops-workflow.md |
| domain setup is done and sending has started | self-reported | nothing in the folder sees a mailbox |

Twenty five messages, low volume, sent to a list the founder built and can
explain. This is not a volume machine, and nothing anywhere counts replies.

## Gate C, after session 3, B2C

| item | proved by | which file |
|---|---|---|
| twenty five openers are written | file-backed | people/, targets with an opener |
| the openers sheet is exported | file-backed | dm-openers.md |
| a hook bank with offer tests exists | file-backed | hook-bank.md |
| inbound scripts exist | file-backed | inbound-scripts.md |
| the workflow is built | file-backed | ops-workflow.md |
| the account is a Business or Creator account, linked to a Page | self-reported | nothing in the folder sees the account |
| the messages have been sent | see below | people/, targets at sent |

**The sends.** The twenty five messages are sent by hand, from the founder's own
account, spread out. Automating them gets accounts restricted, so there is no
automation to point at and no send log to read.

Recording a send is what turns it into evidence. When no person file is at
`status: sent`, the gate **asks**, records the answer, passes on the answer, and
prints the one command that would have proved it:

```
ge person touch <their handle> dm out "sent the opener"
```

That command moves the person to `sent` by itself, so recording the send and
advancing the status are one action.

## What is guaranteed

- Every file in the first table appears in `ge index` for the founders whose
  track sees it, and no founder is ever shown the other track's row.
- Every item on every list is marked file-backed or self-reported, with no third
  category, so nobody has to decide at the gate what counts as proof.

## What you may safely edit by hand

This is a maintainer's file, not a founder's. Editing it changes what `ge index`
prints, so change it in the repository and run the test suite.

Two rules. Keep the first table first, because the lookup takes the first row
whose first cell matches the file name. And never start a row in a later table
with a bare file name, for the same reason.

## A valid example

The row for the Brain, exactly as the lookup expects it, written here inside a
sentence rather than as a line of its own so that it cannot be picked up as a
second answer: `| founder-brain.md | gate A | both | 1 |`.

## An invalid example

The same row with the label rewritten:
`| founder-brain.md | Gate 1 (session one) | both | 1 |`.

`ge index` prints the second column word for word, so every founder's index would
read `Gate 1 (session one)` in the gate column while the built-in list in
`scripts/cmd/index.sh` still says `gate A`. The label is not wrong in itself. It
is wrong because only one of the two places changed.

That is also why both examples above sit inside a sentence. A line here that
began with a pipe and the same file name would be a second row the lookup could
find, and the only thing keeping the right one is that it comes first.
