---
name: audience-b2c
description: Build the B2C audience engine. Defines the target audience and platform, builds a hook bank, writes 25 manual DM openers for live sending, and writes the inbound comment-to-DM and conversion scripts that run in GoHighLevel. B2C track only. Trigger on "build my audience engine", "instagram outreach", "DM scripts", "my hooks", "comment to DM", or Session 3 homework for B2C founders.
---

# Audience Engine, B2C

The B2C equivalent of the outreach engine. Two halves: 25 manual DMs sent live on Saturday, and the inbound machine that keeps working afterwards.

## Hard constraint, state this to the founder early

**Automated cold DMs on Instagram get accounts restricted or banned.** The Instagram API only permits messaging inside a window after a user contacts you first. Any tool that claims to send unsolicited DMs at volume is scraping the interface, and it puts the account at risk.

So: cold DMs are sent by hand, 25 of them, and the automation lives entirely on the inbound side, where it is fully supported. Do not build, recommend, or write copy for volume DM automation. If the founder asks for it, explain why and offer the inbound machine instead.

## Prerequisites

Read `./growth-engine/founder-brain.md`.

If it does not exist, check the parent folder and the home directory before concluding it is missing. Founders commonly open Claude Code in a different folder from the one they built in.

If it genuinely does not exist, stop. Tell the founder to run `/growth-engine:brain` first (or to say "build my founder brain") and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.

If `track` is not `b2c`, stop and route the founder to the outreach-b2b skill instead.

Check the Brain for Instagram account type. If it is still personal, tell them to convert to Business or Creator and link a Facebook Page before anything else works.

## Step 1: targeting

Engagement-based, not firmographic. Build a list of 25 real accounts from:

- People who commented on a competitor's recent posts
- Hashtag participants in their niche
- People who already engaged with the founder's own content
- Local accounts, if the business is location-based
- Followers of adjacent, non-competing accounts

Write the method as a repeatable instruction, not a one-off list. The founder builds the 25 as homework in about an hour.

## Step 2: 25 DM openers

One per target account, sent by hand from the founder's own app on Saturday.

Rules:
- Reference something actually specific to that account. A post, a comment, a bio detail.
- Two sentences maximum. Long DMs do not get read.
- No pitch in the first message. The goal is a reply, not a sale.
- No mass-personalisation tells. If it reads like a template with a name swapped, rewrite it.
- Written in the founder's captured voice.

Work in batches of 5. Ask the founder to paste in the account handle plus whatever detail they have.

Output to `./growth-engine/dm-openers.md`, numbered, with the target handle against each.

**Pacing warning, include it in the output file:** 25 DMs fired in a rapid burst can trigger Instagram action blocks, especially on younger or low-activity accounts. Send them spread across the Saturday afternoon, a few at a time with gaps, from an account that has been used normally in the weeks before. Never race through the list.

## Step 3: hook bank

30 hooks for short-form content and DM openers. Categorised: curiosity, contrarian, result, mistake, question, story-open.

Hooks do more work per word than anything else a B2C founder writes. Spend real effort here.

Output to `./growth-engine/hook-bank.md`, grouped by category.

## Step 4: offer tests

Three variants of how the offer is framed, to test against each other. Different angle, not different wording. Note what each is testing.

Add them to `./growth-engine/hook-bank.md` under an Offer tests heading, so the hook bank and the offer tests travel as one file.

## Step 5: the inbound machine

This is where the automation lives, and it is fully sanctioned.

**Comment-to-DM.** The founder posts, the caption invites a comment keyword, Instagram fires an automatic DM because the user initiated. Write the trigger keyword, the auto-DM message, and the follow-up.

**DM qualify and book.** A short conversation flow that qualifies the inbound and routes to a booking link or product page. Three or four steps, no interrogation.

**Link in bio.** A GHL form or calendar destination.

Write the copy for each. The workflow itself is a GHL snapshot loaded at the clinic, so do not attempt to build automation here. Copy only.

Output to `./growth-engine/inbound-scripts.md`.

## Gate

Audience defined, 25 target accounts identified, 25 DM openers written, hook bank complete, inbound scripts written, Instagram converted to Business or Creator.
