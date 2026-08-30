# founder-brain.md

## What this file is for

It is the answer to "who are you, who do you sell to, and how do you write".
Every skill after the Brain reads it and adapts to it. The `Track` line is the
one that forks the whole toolkit, so a Brain with no track leaves eleven later
skills with nothing to fork on.

It lives at `growth-engine/founder-brain.md`.

## Who writes it

The `founder-brain` skill, once, at the end of the interview. Nothing in `ge`
writes this file. After that the founder owns it and edits it by hand.

It is the one file in the folder with no marked sections in it, because there is
no part of it ge needs to rewrite.

## Who reads it

| reader | what it takes |
|---|---|
| `ge index` | the `Track` line, to decide which of the two tracks' files to list |
| `ge lint` | the section headings, `Track`, `Model`, `Locked`, and the Numbers section |
| `ge context` | the bullets under `## Flags`, to surface anything unresolved |
| every skill after the Brain | all of it |

## The format, line by line

A heading, then a short block of labelled lines, then one `## ` section per topic.

```
# Founder Brain

- **Founder:** <their name>
- **Business:** <the business name>
- **Track:** b2b
- **Model:** service
- **Hybrid:** false
- **Stage:** <one phrase>
- **Locked:** 2026-09-08

## Thesis
...
```

**The labelled lines at the top.** Everything above the first `## ` line is the
header. A label is the text in front of the first colon, and the value is
everything after it. Both are read with the list dash and the stars taken off,
and the label is read without case, so `Track:`, `- **Track:**` and `track:` are
one line as far as every reader is concerned.

Below the first `## ` line, a line with a colon in it is ordinary prose. A
founder who writes `status: still thinking` under `## Flags` is writing a
sentence, not setting a field.

**The sections.** `ge lint` warns when any of these eight headings is absent:
`Thesis`, `Offer`, `Audience`, `Proof`, `Goal`, `Channels`, `Voice`, `Flags`.
The heading only has to start with that word, so `## Goal, next 90 days` counts
as `Goal`. `## Source material` and `## Numbers` are read too, and are described
below.

**`## Flags`.** Bullet lines only. `ge context` prints up to six of them at the
top of a session and says how many more there are. A bullet that opens `- [x]` is
treated as done, and so is one with the word resolved anywhere in it. The
sentence of guidance under the heading is not a bullet, so it is not surfaced.

**`## Numbers`.** Labelled lines, the same shape as the header lines. `ge lint`
reads the value after each colon. If every one of them reads `unknown` it warns,
because the plan has nothing to project from.

## Allowed values

| field | values | who has to answer |
|---|---|---|
| `Track` | `b2b` or `b2c` | everyone, once |
| `Model` | `service` or `ecommerce` | B2C only |
| `Locked` | a date written year, month, day, for example `2026-09-08` | everyone |

`Model` is not asked of a B2B founder, and `ge lint` does not check it for one.
Asking would be showing them the other track's material, which is the one thing
never to do.

Read without case, so `B2B` works. The founder's own spelling is what any warning
quotes back at them.

## Invocation

This is the one line a skill uses to call `ge`, character for character. It is
pinned in the code as `GE_INVOCATION` in `scripts/ge.sh`, and printed by
`ge invocation`. Every skill copies this one string. No skill invents a second
form.

```
sh "$CLAUDE_PLUGIN_ROOT/bin/ge"
```

## Credentials

Where the masked prompt for a GoHighLevel token appears differs by surface, and
which plugin manifest ships is decided from that. That decision is not recorded
yet. It lands in `planning/spike-findings.md`, section S-05, and this heading is
where it gets copied to when it does. Until then no skill should assume either
answer.

## What is guaranteed

- The file is either absent or written whole. The skill writes it in one pass.
- Nothing in `ge` ever rewrites it, so nothing here can lose a word the founder
  wrote.
- The `Track` value, once locked, is what every later skill forks on. Changing it
  after content is written leaves that content addressed to the wrong audience.

## What you may safely edit by hand

All of it. This is the founder's file. The three lines to be careful with are
`Track`, `Model` and `Locked`, because other commands read them and the values
they take are short lists.

Run `ge lint` after editing. It changes nothing and it names anything a later
skill would trip over.

## A valid example

```
# Founder Brain

- **Founder:** Sam Carter
- **Business:** Example Ltd
- **Track:** b2b
- **Hybrid:** false
- **Stage:** first ten customers
- **Locked:** 2026-09-08

## Thesis
We help small agencies stop losing a day a week to reporting.

## Offer
A done for you reporting service, 900 a month, cancel any time.

## Audience
Agencies of 5 to 20 people who bill retainers.

## Proof
Thin. Two customers, no written testimonials yet.

## Goal, next 90 days
Ten retained customers.

## Channels
LinkedIn active. Domain three years old, Google Workspace.

## Numbers
- Customers now: 2
- Average monthly value: 900
- Target in 90 days: 10

## Source material
Four newsletters our buyers already read.

## Voice
Direct, short sentences, no jargon. Says "here is the thing" a lot.

## Flags
- Proof is thin, so nothing written should quote a result.
```

## An invalid example

```
# Founder Brain

- **Founder:** Sam Carter
- **Track:** business to business
- **Locked:** 08/09/2026
```

`Track` reads `business to business`, and the only two values are `b2b` and
`b2c`, so every skill that forks on it has no answer. `Locked` is written day
first, which is not a date any reader here can parse.

## Known drift, August 2026

The `founder-brain` skill's own template does not yet write a `Model` line or a
`## Numbers` section, and `ge lint` warns about both. `ge lint` is warn-only and
blocks nothing, so this costs a founder two warnings and no work. Fixing it means
editing `skills/founder-brain/SKILL.md`, not this file.
