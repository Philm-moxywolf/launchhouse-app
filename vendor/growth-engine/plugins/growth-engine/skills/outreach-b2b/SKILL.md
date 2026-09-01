---
name: outreach-b2b
description: Build the B2B outreach engine. Turns the ICP into Apollo search criteria, writes a four to five touch sequence in the founder's voice, and generates personalised first lines for a pasted lead list. B2B track only. Trigger on "build my outreach", "write my sequence", "apollo filters", "cold email", "first lines", or Session 3 homework for B2B founders.
---

# Outreach Engine, B2B

Produces the sequence and the 25 personalised messages sent live on Saturday.

## Prerequisites

Read `./growth-engine/founder-brain.md`.

If it does not exist, check the parent folder and the home directory before concluding it is missing. Founders commonly open Claude Code in a different folder from the one they built in.

If it genuinely does not exist, stop. Tell the founder to run `/growth-engine:brain` first (or to say "build my founder brain") and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.

If `track` is not `b2b`, stop and route the founder to the audience-b2c skill instead. Do not run a B2B sequence for a B2C founder.

## Step 0: what is going to send this

Decide this before writing a word, because it changes the merge variables and the export.

Ask one question: **is their work email on Google (Gmail or Google Workspace), or on Microsoft 365, or something else?**

**If Google.** They build the list and send from Apollo. The free plan connects in full, so session 3 costs them nothing. Apollo does not run its own mail servers: every message leaves through their own connected mailbox by a two-minute sign-in, so their domain carries the reputation either way. Sequences handle the follow-up touches, and stop-on-reply is on by default, which is the whole reason to use a sequencer at this volume.

**If Microsoft 365 or anything else.** They send by hand from their own mailbox and schedule the follow-ups with their mail app's own scheduled send. This is a real route, not a consolation. At 25 messages it meets the promise completely, costs nothing, needs no new account, and replies land where they already read email.

Record the answer in the output file. Nobody chooses twice.

**On the cost, and get this the right way round.** The free plan connects to the app in full, so nothing in session 3 needs paying for. The 65 USD/month plan is what actually sends, and it is bought at the setup clinic on 23 September, alongside GoHighLevel and for the same reason: a plan bought in September is running on the Saturday, and one bought in August has been paid for three weeks of not sending yet.

Say it that way round. Telling a founder they need the plan to connect it is not true, they will find that out, and every other number in this programme is worth less to them afterwards.

They are already carrying Claude, a domain and GoHighLevel at 97 USD. A founder who says the total is too much is doing arithmetic rather than hesitating, and arguing is how this skill loses them. That founder takes the manual route, which is real and meets the promise at 25 messages.

**On the manual route, schedule two touches at a time, never all four.** If someone replies, there are only two things to cancel, and cancelling is the job people forget.

## Step 1: list criteria

Convert the ICP into filters a founder can type into Apollo.

Output the criteria as a plain list they can copy: industry, headcount band, revenue band, geography, job titles, seniority, and any technology or keyword filters that indicate the trigger event.

Give three variants: tight, medium, broad. Tight is the best-fit list and may be small. Broad is the fallback if tight returns under 100 results.

**Build to 35, then cut to 25.** Some rows will be wrong: the person left, the address bounces, the company is not a fit on a second look. Topping up a list under time pressure on the Saturday is how founders end up messaging people they have not read.

Tell them to build the list as homework and to verify emails before sending. An unverified list destroys domain reputation faster than bad copy.

## Step 2: sequence

Four to five touches over two to three weeks.

- Touch 1: the opener. Specific to them, one clear reason for the message, one low-friction ask.
- Touch 2: proof. A result or case relevant to their situation, taken from the Brain's Proof section and from nowhere else.
- Touch 3: a different angle on the same problem.
- Touch 4: a short, direct close.
- Touch 5, optional: the break-up.

Rules that are not negotiable:
- Under 120 words per touch. Shorter converts.
- One ask per message.
- A subject line on touch 1, and a decision for each later touch on whether it replies in the same thread or starts a new one. Same thread is the default.
- A wait interval stated between every touch. Three to four working days is the normal spacing across two to three weeks.
- **A plain opt-out line in the body of every touch.** One sentence, their own words, for example "if this is not for you, say so and I will leave you alone". Do not rely on a tool's unsubscribe link, because the free plan may not have one, and at this volume a human sentence reads better anyway. This is not optional: it is what the law expects and what a real person deserves.
- Written in the founder's captured voice, not in generic sales English.
- No fake familiarity, no invented compliments, no "I noticed you..." unless it is genuinely specific.

**Merge variables.** Only if they are sending through Apollo. Apollo uses `{{contact.first_name}}` and `{{account.name}}`. The older `{{first_name}}` and `{{company}}` still work. The personalised opening line is a custom variable: the founder inserts it from the `{ }` menu in the Apollo editor and never types the name by hand, because a typed variable that does not match renders as empty or as literal braces in front of a prospect.

**On the manual route there are no merge variables at all.** Write all 25 messages out in full, finished, with the name and detail already in the text. There is nothing to substitute and nothing to go wrong.

**Stop on reply.** In Apollo this is on by default, as is pausing on an out of office. Confirm it is on rather than assuming. On the manual route this is the founder's job, and it is the single thing most likely to be forgotten three weeks after the event.

**Never write a claim the Brain does not support, and never write a number the founder did not give you.**

If the Proof section is thin, touch 2 is still touch 2. Write it from one of these instead, in this order:

- The one named case they do have, in the detail they gave you.
- What they have seen across the jobs they have done. The fault that turns up again and again, the thing every owner says in the first meeting.
- The step they take that the cheaper option skips. That is method, and it needs no number at all.

A specific observation about the reader's own world reads as true. A number nobody gave you can be checked, and in a trade this size somebody will check it.

## Step 3: first lines

The founder pastes in leads. For each, generate one opening line specific to that company or person.

Ask for whatever they have: company name, website copy, a recent post, a job ad, a news item. Generate from the actual detail. If there is nothing specific, say so and write a line based on the segment rather than fabricating a detail. **A generic honest line beats an invented specific one.**

Work in batches of 5 to 10 so the founder can check quality as it goes.

## Step 4: deliverability brief

Cover this even though it is not copy, because it decides whether any of it works.

- 25 messages is low volume. At this scale, authentication matters more than warmup duration.
- SPF, DKIM and DMARC must all be configured. Without them, mail gets filtered no matter how old the domain is.
- An existing domain with real sending history is still better than a fresh one. Use it if they have it.
- On a fresh domain, sending ten to twenty normal messages a day in the weeks beforehand is sufficient at this volume.
- Verify every email before sending. An unverified list does more damage than a cold domain.
- Never promise replies. Replies depend on list quality, timing and offer, none of which are guaranteed.
- Turn open and click tracking off. Tracking pixels and rewritten links are a spam signal, and at 25 messages the data is worth nothing.
- **Say this plainly, once.** Best practice for high-volume cold email is to send from a separate outreach subdomain, never the main company domain. This programme sends from the main domain on purpose, because 25 authenticated, genuinely personalised messages with an opt-out line carry low risk and setting up a second domain properly is more work than the runway allows. The risk is low. It is not zero. The founder should know that rather than find out.

## Step 5: export

Write `./growth-engine/outreach-sequence.md` containing: the chosen route from Step 0, the full sequence with subject lines, wait intervals and the opt-out line, and the merge variables if any.

Write `./growth-engine/outreach-firstlines.csv` with columns `email`, `first_name`, `company`, `first_line`.

`first_line` holds the generated opening line. Name it `first_line` rather than anything generic, so the CSV column, the Apollo custom field and the variable in the sequence all read the same. A mismatch here fails silently and takes the most valuable output of this skill with it.

**On the manual route, the CSV is a checklist, not an import.** It is the founder's running sheet for Saturday: who, what the opening line is, and a column to tick when sent.

This is a cold list, so it never goes into GoHighLevel's email tool. GoHighLevel is the CRM and the publisher for this programme. It is not the cold sender.

## Gate

Route chosen and recorded, sequence approved with opt-out line and wait intervals, list criteria defined, list built to 35 and cut to 25, first lines generated for all 25.
