---
name: content-engine
description: Build the content engine. Defines content pillars from the Founder Brain, then generates 30 posts (B2B) or 30 short-form scripts and hooks (B2C) in the founder's captured voice, and exports them ready to load into GoHighLevel Social Planner. Trigger on "build my content engine", "generate my posts", "write my content", "content pillars", "my 30 posts", or Session 2 homework.
---

# Content Engine

Produces the 30 pieces of content each founder loads into GHL Social Planner before Atlanta.

## Prerequisites

Read `./growth-engine/founder-brain.md`.

If it genuinely does not exist, stop and tell the founder to open Founder Brain, or to say "build my founder brain". Do not guess at their business or voice.

Read the `track` field. Everything below branches on it.

## Step 1: pillars

Propose four content pillars from the Brain. Pillars are the recurring themes the founder can write about indefinitely without repeating themselves.

Derive them from proof, offer, audience pain, and point of view. Do not use generic marketing pillars.

**B2B pillars** typically land on: the problem the market misdiagnoses, proof and results, how the work actually gets done, and a contrarian position on the industry.

**B2C pillars** typically land on: transformation and outcome, behind the scenes, education against a common mistake, and social proof.

Show the four with a one-line rationale each. Let the founder cut or swap. Four is the number. Fewer gets repetitive, more gets thin.

## Step 2: generate

30 pieces, distributed across the four pillars, weighted toward whichever pillar has the most proof behind it.

<!-- TRACK:b2b -->
### If track is b2b

Format mix:
- 20 short posts, 80 to 150 words, for LinkedIn and X
- 6 longer posts, 200 to 300 words, for LinkedIn
- 4 with a soft call to action

Each post: a specific opening line that earns the second line, one idea, concrete detail from their proof, no generic advice. If the Brain flagged thin proof, lean on point of view and observation rather than inventing results. **Never invent numbers, customers, or outcomes.**
<!-- /TRACK -->

<!-- TRACK:b2c -->
### If track is b2c

Format mix:
- 15 short-form video scripts, 20 to 40 seconds, with a hook in the first three seconds
- 8 carousel or multi-frame outlines, frame by frame
- 7 single-image captions

Scripts need a spoken hook, not a written one. Read them aloud in your head. If the first line does not stop a scroll, rewrite it.

Include the on-screen text separately from the spoken line where they differ.
<!-- /TRACK -->

### Both tracks

Write in the voice captured in the Brain, including the verbatim phrases. Vary opening structure across the 30. Nothing should read as templated.

Generate in batches of 10 and check in between batches. Thirty in one dump is unreviewable and the founder will approve it without reading.

## Step 3: keeping it running

Thirty pieces at five a week is six weeks of content. The promise is a content engine, not a one off batch, so the founder needs to know how it refills before they leave Atlanta.

Set this up now, not later.

**The refill routine.** Once a month, the founder runs this skill again in refill mode: 30 new pieces, same pillars, same voice, generated against what has happened since. It takes about twenty minutes. Tell them that plainly, because most people assume regenerating means starting over.

**What feeds it.** Pull the Source material list from the Brain, and add three to five RSS feeds relevant to their audience. Record them in `./growth-engine/rss-feeds.md`. This is a source list, not an automation. When they refill, this is what stops the new batch repeating the last one.

**What changes between batches.** Ask them to note new proof as it happens: a result, a customer story, a question they got asked twice. Add a running list at the bottom of `content-30.md`. Fresh proof is the difference between month two sounding like month one and month two sounding better.

**Refill mode.** If the founder is running this skill again and `content-30.md` already exists, read it first. Do not repeat angles that have already been published. Archive the old file as `content-30-[month].md` and write a fresh one.

## Step 4: export

Write two files.

`./growth-engine/content-30.md` for the founder to read and edit. Numbered, grouped by pillar, with the format labelled.

`./growth-engine/content-30.csv` for GHL Social Planner bulk upload. Columns: `content`, `platform`, `scheduled_date`, `media_note`.

Leave `scheduled_date` blank. Scheduling happens in GHL at the clinic, not here. Put any image or video requirement in `media_note` as a plain instruction, for example "record talking head, 30 seconds" or "screenshot of dashboard".

Confirm the exact column headers GHL expects at the time of build. Bulk upload formats change and a wrong header means 130 failed imports.

## Step 5: the check

Tell the founder their homework is to read all 30 and edit anything that does not sound like them. Not to approve them unread.

The gate is 30 submitted, not 30 generated. Say that plainly.

Reading a piece is not approving it. A piece counts towards the gate once it is marked approved, so tell the founder to mark each one as they finish reading it.
