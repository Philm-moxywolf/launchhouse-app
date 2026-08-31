---
name: audience-b2c
description: Build the B2C audience engine. Defines the target audience and platform, builds a hook bank, writes 25 manual DM openers for live sending, and writes the inbound comment-to-DM and conversion scripts that run in GoHighLevel. B2C track only. Trigger on "build my audience engine", "instagram outreach", "DM scripts", "my hooks", "comment to DM", or Session 3 homework for B2C founders.
---

# Audience Engine, B2C

The B2C equivalent of the outreach engine. Two halves: 25 manual DMs sent live on Saturday, and the inbound machine that keeps working afterwards.

## The line that does not move

Say this to the founder early, and use roughly these words rather than writing your own.

**You send the first message yourself. All 25 of them, from your own app.** Instagram only opens a reply window once the other person has written to you. Anything that gets round that is working against the platform, and accounts doing it get restricted. There is no appeal desk.

That is not a limit to work around. It is the shape of the whole engine. The 25 go by hand, and the machinery sits on the other side, where somebody has already come to you.

**What counts as somebody coming to you.** They commented on a post. They replied to a story. They sent you a message. They used a keyword the founder asked for in a caption. That is the list.

**What does not count.** A follow. A like. A story view. A profile visit. Being on a list the founder built. None of those opens a window, and treating one as though it did is how a founder gets restricted while believing they were on the safe side.

So build the inbound side properly, and write the 25 as finished messages the founder taps send on. Do not design, recommend, or write copy for anything that reaches a stranger without the founder choosing that person, that message, that moment.

**If the founder asks to speed the 25 up**, they are asking a fair question and they are not trying to break anything. Do not lecture, and do not quote a rule at them. Say it in three lines, roughly like this:

> The first message has to come from you. That is Instagram's line, not ours.
> What we build instead is the part that starts the moment somebody comes to you. They comment, they reply, they write in, and the answer is already written and waiting.
> So Saturday is 25 by hand, and the rest of it keeps working after you put your phone down.

Then go straight to Step 5 and build it with them. A founder who gets a no and nothing else goes and asks somebody else.

## Prerequisites

Read `./growth-engine/founder-brain.md`.

If it genuinely does not exist, stop. Tell the founder to open Founder Brain, or to say "build my founder brain", and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.

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

Write them in batches of 5, so the founder can check quality as it goes. Ask them to paste in the account handle plus whatever detail they have. Batches are how the 25 get written. They still go out one at a time, on the day, in the founder's own app.

Output to `./growth-engine/dm-openers.md`, numbered, with the target handle against each.

**Pacing warning, include it in the output file:** 25 DMs fired in a rapid burst can trigger Instagram action blocks, especially on younger or low-activity accounts. Send them spread across the Saturday afternoon, a few at a time with gaps, from an account that has been used normally in the weeks before. Never race through the list.

## Step 3: hook bank

30 hooks for short-form content and DM openers. Categorised: curiosity, contrarian, result, mistake, question, story-open.

Hooks do more work per word than anything else a B2C founder writes. Spend real effort here.

The result category is the one that goes wrong. A result hook is built from a result the Brain records, in the founder's own words, or it is not written. If the Brain has no results yet, write more mistake hooks and more story-open hooks instead, and tell the founder that is what you did and why. Never build a hook around a number the founder did not give you, however modest it sounds. The modest ones are the ones that get published.

Output to `./growth-engine/hook-bank.md`, grouped by category.

## Step 4: offer tests

Three variants of how the offer is framed, to test against each other. Different angle, not different wording. Note what each is testing.

Add them to `./growth-engine/hook-bank.md` under an Offer tests heading, so the hook bank and the offer tests travel as one file.

## Step 5: the inbound machine

This is where the automation lives, and it is fully sanctioned.

Every flow here starts with something the other person did. If you cannot name that thing in one short phrase, the flow is not inbound and does not get written.

**Comment-to-DM.** The founder posts, the caption invites a comment keyword, Instagram fires an automatic DM because the user initiated. Write the trigger keyword, the auto-DM message, and the follow-up.

**DM qualify and book.** A short conversation flow that qualifies the inbound and routes to a booking link or product page. Three or four steps, no interrogation.

**Link in bio.** A GHL form or calendar destination.

**Cap the follow-up.** One follow-up, then stop. If they do not reply to the first message and do not reply to the follow-up, the conversation is over and nothing more goes out. Write the stop into the copy, because a flow with no exit carries on at somebody who has already decided.

Write the copy for each. The workflow itself is a GHL snapshot loaded at the clinic, so do not attempt to build automation here. Copy only.

**Name the trigger in every label, not just the first one.**

Write "Reply, sent when they comment:" above each piece of copy, every time. Do not use a bare label that says only that a machine sends it.

Two reasons, and the first is the one that matters to the founder. Every message in this file only goes out because somebody did something first, and a label that says so is the difference between a flow they can check and a flow they have to take on trust. A reader scanning the file should be able to see, at each step, what opened the window.

The second is practical. A label that does not name the trigger is read as the thing rule 2 refuses, and the refusal costs the whole run, including the two files that had nothing to do with it. Naming the trigger is not a workaround. It is the sentence being accurate about what it describes.

Output to `./growth-engine/inbound-scripts.md`.

## Gate

Audience defined, 25 target accounts identified, 25 DM openers written, hook bank complete, inbound scripts written, Instagram converted to Business or Creator.
