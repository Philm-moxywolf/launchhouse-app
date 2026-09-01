---
name: founder-brain
description: Build or update the Founder Brain, the single locked record of a founder's business, audience, offer, proof, and writing voice. Use at the very start of the Launchhouse programme, before any content, outreach, audience, or operations work. Trigger on "build my founder brain", "set up my brain", "start launchhouse", "update my brain", "change my track", or whenever another growth-engine skill reports that no founder-brain.md exists.
---

# Founder Brain

The Founder Brain is the input to every other engine. Nothing else in this plugin runs without it.

Output is a single file at `./growth-engine/founder-brain.md` in the founder's working folder.

**Working folder.** Every skill in this plugin reads and writes to `./growth-engine/` relative to wherever Claude Code was opened. Tell the founder at the end of this skill to note which folder they are in and always open Claude Code there. Scattered work is the most common failure in the runway.

## Before starting

Check whether `./growth-engine/founder-brain.md` already exists. If it is not in the current folder, check the parent folder and the home directory before concluding it does not exist. A founder who already built a Brain in another folder must not be re-interviewed into a second, conflicting one; point them at the folder they built in instead.

- If it exists and the founder asked to build a new one, show them the current summary and ask whether to update it or start again.
- If it exists and they asked to update, go straight to the section they want to change.
- If it does not exist, run the full intake below.

Create the `./growth-engine/` folder if it is not there.

### If they ask to change the track

"change my track" is a trigger on this skill, so a founder asking has reached the right place. It is allowed. Do not tell them it cannot be done, and do not send them to a mentor. There is no escalation path and inventing one leaves them stuck.

It is the one change that costs a founder work, so it takes one honest exchange first. That is not the same as refusing.

**Say what it costs, using their own file names.** Everything built off the track was written for the other side. Their Brain stays, their voice profile stays, and the rest is rebuilt.

**Ask what changed.** Not to talk them out of it. "I picked wrong in session 1" is answered differently from "I want to serve schools as well as parents". The second one usually wants `hybrid: true` and the same track, and that distinction is worth thirty seconds of asking.

**If they confirm, do it.** Rewrite the Track line in the file that is already there. Then reopen only the parts that fork on it, which are the audience capture and the channel question. Both are asked differently on each side, and the intake below already knows which. Everything else in the file is still true, so do not re-ask it and do not re-run the full intake.

**Then say what to expect.** Their old track's files stay where they are and stop appearing in their list, because the list only shows the track they are on. The new track's gates start empty. Name which files they now need and which session covers each.

If they are hesitating, leave it where it is. They can come back to it, and a track changed twice costs more than a track changed once.

## Intake

Ask these in small groups, not all at once. Three or four questions per turn. Reflect back what you heard before moving on. This should feel like a conversation with a sharp consultant, not a form.

### Group 1: the business

1. What is the business called, and what does it sell?
2. Who pays you? Be specific about the actual buyer.
3. What stage are you at? Pre-revenue, first customers, under 10k a month, 10 to 50k, above 50k.
4. What do you charge, and how? One-off, subscription, retainer, per unit.

### Group 2: the track fork

This is the most important question in the intake. Everything downstream branches from it.

Ask: **does your revenue come mostly from selling to other businesses, or to individual consumers?**

- Mostly businesses, so B2B
- Mostly consumers, so B2C
- Genuinely both

If they say both, do not create a third track. Ask which motion produces more revenue today, or which one they most want to grow over the next 90 days. Record that as `track`, and record `hybrid: true` alongside it. The hybrid flag adjusts tone and examples later. It does not create a separate path.

Explain briefly why you are asking: the outreach engine works completely differently on each track, and getting this wrong means building the wrong machine.

### Group 3: audience

**If track is B2B**, capture the ICP:
- What kind of company? Industry, size, revenue band, geography.
- Who is the individual you actually sell to? Job title, seniority, department.
- What triggers them to start looking for something like yours?
- Which companies are your best-fit customers today? Name three.

**If track is B2C**, capture the persona:
- Who is this person? Age range, life stage, situation.
- What do they want that they cannot get right now?
- Where do they already spend attention online? Be specific about platforms and accounts.
- What do they already buy that sits next to your product?

Do not ask B2B questions of a B2C founder or the reverse. It wastes their time and signals the tool does not understand them.

### Group 4: offer and proof

1. What problem do you solve, in one sentence, in their words rather than yours?
2. Why you rather than the obvious alternative?
3. What proof do you have? Results, numbers, named customers, case studies, testimonials, credentials.
4. What do you want more of in the next 90 days? Leads, sales, followers, retention.

**Ask question 3 in their world, not in business language.** Most founders here run small local businesses, so the countable things are dogs, weddings, kitchens, boilers, meals, sessions, callouts and repeat bookings, not customers and firms. Ask how many they have done, how long they have been doing it, how many come back, and which one went best. Write the numbers down exactly as they said them, and write unknown where they do not know.

That last part is the important one. A number recorded here is a number every other engine is allowed to use. A gap recorded here is a gap nothing downstream will quietly fill in for them.

Proof matters more than founders expect. It is the raw material for every post and every message. If they have none, say so plainly and note it, because the content engine will lean on story and point of view instead.

### The thesis

From their Group 4 answers, compose one sentence: who they serve, the problem in the customer's own words, and why them rather than the obvious alternative. Read it back and adjust until they would say it out loud to a stranger. This is the thesis. It goes in the Brain, it is pressure-tested in Session 1, and it is part of their Gate 1 submission.

### Group 5: channels

- Where do you currently publish, if anywhere?
- Which channels do you have accounts on but do not use?
- **If track is B2C**: is your Instagram a personal account, or Business or Creator? If personal, tell them to convert it now, because publishing and inbound capture will not work without it, and it takes two minutes.
- **If track is B2B**: which provider is their work email on, Google (Gmail or Google Workspace), Microsoft 365, or something else? This decides how they send their 25 messages later, so record it plainly. It is not a technical question to them: "what do you open your work email in" gets the answer.
- **If track is B2B**: do you have a business domain with real email sending history, or will you need a fresh domain? A fresh domain needs SPF, DKIM and DMARC configured now, plus ten to twenty real messages a day between now and the event. At 25 messages, correct setup matters more than months of warmup, but it cannot be crammed into the last week, so flag it as a start-today item.

## Voice capture

Three paths. Pick based on what they have. Nobody gets stuck here.

**Important distinction before you start.** The voice must be theirs. Curated content from other people is useful for working out what to write *about*, never for how it sounds. If you train the voice on a competitor, the founder ends up publishing something that reads like an imitation, and their audience can tell. Topics can be borrowed. Voice cannot.

### Path A: they have writing

Ask for 10 to 20 samples of anything they have written in their own voice. Posts, emails, newsletters, even long messages. Pasted in, or a file path.

Read them and extract:
- Sentence length and rhythm
- Vocabulary level and any recurring words or phrases
- How they open and how they close
- Whether they use humour, and what kind
- First person singular or plural
- How direct they are, and how much they hedge
- Formatting habits: lists, line breaks, questions, emoji

### Path B: they have some writing, but not much

Five or six real samples is enough to work from. Read them the same way as Path A, then fill the gaps with two or three interview questions from Path C. Say plainly that a smaller sample is fine and that you will check the result with them before anything gets built on it.

### Path C: they have nothing written

Many early-stage and B2C founders have no body of writing. This is normal. Do not make it awkward.

Run a short interview instead, and capture how they *speak*:
- Tell me about the last customer you really enjoyed working with.
- What do people get wrong about your industry?
- What would you say to someone about to make the mistake your product prevents?
- What is the thing you find yourself explaining over and over?

Their answers to these are the voice sample. Pay attention to how they actually phrase things, not what they say.

### Source material, all three paths

Separately from voice, ask what they already read and who they follow in their space. Competitors, industry accounts, newsletters, creators. This is not for voice. It is so the content engine knows what conversations their audience is already having, and what the founder wants to agree with or argue against.

Record five to ten of these in the Brain under Source material. A founder with a strong point of view and no writing history will produce better content from this than a founder with fifty posts and nothing to react to.

### Voice profile

Either path produces the same output: a description specific enough that another writer could imitate it. Include three or four verbatim phrases they actually use.

Then show the founder a two-sentence sample written in their captured voice and ask: does this sound like you? Adjust until they say yes. Do not skip this check.

## Writing the file

Write `./growth-engine/founder-brain.md` in this shape:

```markdown
# Founder Brain

- **Founder:**
- **Business:**
- **Track:** b2b | b2c
- **Hybrid:** true | false
- **Stage:**
- **Locked:** YYYY-MM-DD

## Thesis
One sentence: who they serve, the problem in the customer's words, why them.

## Offer
What they sell, how it is priced, the problem it solves in customer language, and why them.

## Audience
B2B: ICP firmographics, buyer persona, trigger events, three named best-fit accounts.
B2C: persona, desire, attention map, adjacent purchases.

## Proof
Results, numbers, named customers, testimonials, credentials, and the plain counts from their own diary or invoices, written as they said them. Note explicitly if thin, and write unknown rather than guessing.

## Goal, next 90 days

## Channels
Active, dormant, and account status. Note IG account type for B2C, domain status and work email provider (Google, Microsoft 365, other) for B2B.

## Source material
Five to ten accounts, competitors, newsletters or feeds their audience already reads. Topics only, not voice.

## Voice
Description of how they write or speak, plus three or four verbatim phrases.

## Flags
Anything the mentor team needs to know. Thin proof, no list, personal IG, fresh domain, unclear offer.
```

The Flags section is what the mentor team reads before the session. Be honest in it. A brain that hides a problem is worse than one that names it.

## After writing

1. Show the founder a short summary and confirm it is right.
2. Tell them the Brain is now locked and every other engine reads from it. Locked means nothing rewrites it behind their back. It does not mean it can never change, and if they ask later they are not being difficult.
3. Give them their gate submission line: track, business name, the thesis, and confirmation the file exists.
4. Tell them what happens next, based on track:
   - **B2B**: if the domain is fresh, set up SPF, DKIM and DMARC today and start sending ten to twenty real messages a day. Correct setup beats long warmup at 25-message volume, but it needs the weeks between now and Atlanta, not the last one.
   - **B2C**: convert Instagram to Business or Creator today, and link it to a Facebook Page.

Both of those are time-critical and founders will forget. Say them last so they are the thing remembered.
