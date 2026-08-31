/**
 * app/content/skill-allowlist.ts
 *
 * WHAT IT IS
 * The section 3 adaptation table of `planning/REPLIT-BUILD.md`, written out so
 * a test can hold it. One row per difference between a ported skill body and
 * its original in the public content repo.
 *
 * WHY IT EXISTS
 * Without it, "we only changed about 40 lines" is a claim nobody can check.
 * With it, any other change fails the build. The failure it prevents is prose
 * drift: a founder-facing sentence edited here, never reviewed in the public
 * repo, shipped to 130 people. It also catches the reverse, an upstream edit
 * arriving with a re-vendored copy and silently not reaching the app.
 *
 * WHAT CALLS IT
 * `app/content/skill-diff.ts`, and through it `app/tests/skill-diff.test.ts`.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It is data.
 *
 * HOW TO CHANGE A SKILL BODY
 * Edit the prose in the public content repo first. Then bring it in here:
 *   npm run engine:bump -- --to <ref> --from <a checkout of the content repo>
 * That is the only supported way, and it prints what moved before it moves it.
 * Then, if the app's copy has to differ, add a row here with the group it
 * belongs to and the reason, and only then edit the file under `skills/`.
 * A row that matches nothing fails too, so a rule cannot outlive its change.
 */

/** Which group of the section 3 table a change belongs to. */
export type PortGroup =
  /** A: the prerequisite paragraph. The server sets cwd, so there is no wrong folder. */
  | "A"
  /** B: namespaced slash commands and plugin references. Neither exists in the app. */
  | "B"
  /** C: the working folder rule. Replaced with the app's own promise. */
  | "C"
  /** E: the four additions the port forces. */
  | "E"
  /** T: the track markers section 4 requires around both tracks' prose. */
  | "T";

export interface AllowRule {
  readonly skill: string;
  readonly group: PortGroup;
  /** Why this change is allowed. Read by a human when the test fails. */
  readonly why: string;
  /** How many times this exact hunk is expected in this file. Almost always 1. */
  readonly times: number;
  /** The original lines, exactly. */
  readonly removed: readonly string[];
  /** The replacement lines, exactly. Empty means the lines were deleted. */
  readonly added: readonly string[];
}

export interface ForbiddenMention {
  readonly pattern: RegExp;
  readonly why: string;
}

export interface RewriteRule {
  readonly skill: string;
  readonly why: string;
  /** Lines section 3 group D keeps word for word. */
  readonly mustSurviveVerbatim: readonly string[];
  /** Subjects group D deletes outright. */
  readonly mustNotMention: readonly ForbiddenMention[];
}

export interface PortedSkill {
  /** The skill's name in the app. */
  readonly name: string;
  /** Its directory in the content repo. Differs only where a skill was renamed. */
  readonly origin: string;
  /** True when the body was rewritten rather than ported, so a line diff says nothing. */
  readonly rewritten?: boolean;
}

/**
 * The nine bodies. `setup` is renamed to `help` because "setup" now means the
 * app's own onboarding, and two things called setup puts founders in the wrong
 * one.
 */
export const PORTED_SKILLS: readonly PortedSkill[] = [
  { name: "founder-brain", origin: "founder-brain" },
  { name: "content-engine", origin: "content-engine" },
  { name: "outreach-b2b", origin: "outreach-b2b" },
  { name: "audience-b2c", origin: "audience-b2c" },
  { name: "ghl-workflows", origin: "ghl-workflows" },
  { name: "growth-plan", origin: "growth-plan" },
  { name: "status", origin: "status" },
  { name: "playbook-export", origin: "playbook-export" },
  { name: "help", origin: "setup", rewritten: true },
];

export const PORT_REWRITES: readonly RewriteRule[] = [
  {
    skill: "help",
    why:
      "Section 3 group D. The 87 line setup skill was about installing, updating, " +
      "surfaces and folders, none of which exist in the app. What survives is the " +
      "part that was never about any of that.",
    mustSurviveVerbatim: [
      // setup/SKILL.md:10. The tone instruction, and the most valuable line in the file.
      "Be plain and unhurried. Many founders on this programme are not technical and will already feel behind.",
      // setup/SKILL.md:49 to 54. The two items that quietly break the weekend.
      "Read `./growth-engine/founder-brain.md` if it exists and check the Flags section.",
      "- **B2B**: is the sending domain sorted, with SPF, DKIM and DMARC configured? If the Brain flags a fresh domain and nothing has happened, raise it now.",
      "- **B2C**: is Instagram converted to Business or Creator and linked to a Facebook Page? Nothing publishes or captures inbound without it.",
      "Raise these even if the founder asked about something else. They are the two items that quietly break the weekend.",
      // setup/SKILL.md:45. Status is one skill, not two.
      "Hand off to the status skill rather than duplicating it here.",
      // setup/SKILL.md:79. Rule 2, said to the founder who thinks it is a bug.
      //
      // THE WORDING MOVED ON PURPOSE, and the old wording is why. "Automated
      // cold DMs get accounts restricted" is a delegate word and a channel word
      // in one short sentence, so `no-dm-automation.ts` scored it as an offer
      // and rescued it back down to a warning on the refusal. The founder still
      // read a note against the one line the product told the model to write,
      // on the screen where they had already been told no. The rule is the
      // same; it is now stated as what the platform allows rather than as what
      // a tool could do, which carries no delegate word for the net to find.
      '**"It will not let me automate Instagram DMs."** Correct behaviour, not a bug. Instagram only opens a reply window once somebody has written to you first, and the accounts that get round that are the ones that get restricted. Say that plainly, then take them to the inbound side and build it with them.',
      // setup/SKILL.md:81. The line that stops a founder losing an hour.
      '**"I cannot get any of this working."** Do not keep troubleshooting past two failed attempts. Tell them to post in the Slack channel and that someone will sort it individually. A founder stuck alone for an hour is worse than a founder who asked for help after ten minutes.',
      // setup/SKILL.md:87. The boundary.
      "It does not change any founder content. Diagnosis and repair of setup only.",
      // commands/doctor.md:7 and :9. Section 3 group F: the doctor framing
      // survives verbatim as an entry mode.
      "The founder has a problem, so start by asking what is happening in their own words, then run the checks most likely to be relevant rather than all of them in order.",
      "If two attempts do not resolve it, stop and tell them to post in the Slack channel. Do not leave them grinding.",
    ],
    mustNotMention: [
      {
        pattern: /\bCowork\b/,
        why: "There are no surfaces in the app, so the Cowork and Claude Code choice is gone",
      },
      {
        pattern: /\bplugin\b/i,
        why: "Founders never install anything, so nothing can be said about a plugin",
      },
      {
        pattern: /\/growth-engine:/,
        why: "Namespaced slash commands do not exist in the app",
      },
      {
        pattern: /parent folder|home directory|working folder|which folder/i,
        why: "The server sets cwd, so there is no folder for a founder to find or remember",
      },
      {
        pattern: /marketplace|reinstall|\/reload-plugins/i,
        why: "There is nothing to install, update or reload",
      },
    ],
  },
];

/**
 * Every authorised difference. Generated once from the real diff and then
 * annotated by hand, so each row says which group it belongs to and why.
 */
export const PORT_ALLOWLIST: readonly AllowRule[] = [
  {
    skill: "founder-brain",
    group: "B",
    why:
      "Plugin reference in the description. There is no plugin, so no growth-engine namespace to name",
    times: 1,
    removed: [
      "description: Build or update the Founder Brain, the single locked record of a founder's business, audience, offer, proof, and writing voice. Use at the very start of the Launchhouse programme, before any content, outreach, audience, or operations work. Trigger on \"build my founder brain\", \"set up my brain\", \"start launchhouse\", \"update my brain\", \"change my track\", or whenever another growth-engine skill reports that no founder-brain.md exists.",
    ],
    added: [
      "description: Build or update the Founder Brain, the single locked record of a founder's business, audience, offer, proof, and writing voice. Use at the very start of the Launchhouse programme, before any content, outreach, audience, or operations work. Trigger on \"build my founder brain\", \"set up my brain\", \"start launchhouse\", \"update my brain\", \"change my track\", or whenever another engine reports that no founder-brain.md exists.",
    ],
  },
  {
    skill: "founder-brain",
    group: "B",
    why:
      "Plugin reference in the body. Nothing is installed, so nothing can fail to be installed",
    times: 1,
    removed: [
      "The Founder Brain is the input to every other engine. Nothing else in this plugin runs without it.",
    ],
    added: [
      "The Founder Brain is the input to every other engine. Nothing else runs without it.",
    ],
  },
  {
    skill: "founder-brain",
    group: "C",
    why:
      "The working folder rule. Replacement text is quoted verbatim from REPLIT-BUILD.md section 3, group C",
    times: 1,
    removed: [
      "**Working folder.** Every skill in this plugin reads and writes to `./growth-engine/` relative to wherever Claude Code was opened. Tell the founder at the end of this skill to note which folder they are in and always open Claude Code there. Scattered work is the most common failure in the runway.",
    ],
    added: [
      "**Where the work lives.** Every file this makes for the founder sits in their `growth-engine/` folder, held for them, and they can see and download any of it from Files at any time. There is no folder to remember and nothing to keep in one place. Say this once, near the end, because founders arrive expecting to have to manage it.",
    ],
  },
  {
    skill: "founder-brain",
    group: "A",
    why:
      "The prerequisite paragraph. The server sets cwd, so there is no other folder the Brain could be in and no second conflicting Brain to warn about",
    times: 1,
    removed: [
      "Check whether `./growth-engine/founder-brain.md` already exists. If it is not in the current folder, check the parent folder and the home directory before concluding it does not exist. A founder who already built a Brain in another folder must not be re-interviewed into a second, conflicting one; point them at the folder they built in instead.",
    ],
    added: [
      "Check whether `./growth-engine/founder-brain.md` already exists.",
    ],
  },
  {
    skill: "founder-brain",
    group: "E",
    why:
      "Group E1. schemas/brain.md:185 records that this template never wrote a Model line, and 00-scope.md:62 makes b2c-ecom a first class route. Asked of B2C founders only, so it carries a track marker",
    times: 1,
    removed: [],
    added: [
      "<!-- TRACK:b2c -->",
      "**If track is B2C**, ask one more question: do they sell a service people book, or products people buy from a shop? Record the answer as `Model`, either `service` or `ecommerce`. It decides which operations snapshot they get and how their content is shaped. Never ask this of a B2B founder.",
      "<!-- /TRACK -->",
      "",
    ],
  },
  {
    skill: "founder-brain",
    group: "T",
    why:
      "Section 4 track marker opening the B2B audience branch",
    times: 1,
    removed: [],
    added: [
      "<!-- TRACK:b2b -->",
    ],
  },
  {
    skill: "founder-brain",
    group: "T",
    why:
      "Section 4 track marker closing the B2B and then the B2C audience branch",
    times: 2,
    removed: [],
    added: [
      "<!-- /TRACK -->",
    ],
  },
  {
    skill: "founder-brain",
    group: "T",
    why:
      "Section 4 track marker opening the B2C audience branch",
    times: 1,
    removed: [],
    added: [
      "<!-- TRACK:b2c -->",
    ],
  },
  {
    skill: "founder-brain",
    group: "E",
    why:
      "Group E1. The Model line the schema already expects in the header block",
    times: 1,
    removed: [],
    added: [
      "- **Model:** service | ecommerce, B2C only, leave out for B2B",
    ],
  },
  {
    skill: "founder-brain",
    group: "E",
    why:
      "Group E4. ge lint already warns when the Numbers heading is absent and the 90 day plan needs it to project from. Placed where the schema's own valid example puts it, between Channels and Source material",
    times: 1,
    removed: [],
    added: [
      "## Numbers",
      "Labelled lines the 90 day plan projects from. Customers now, average monthly value, target in 90 days. Write unknown where they do not know yet.",
      "",
    ],
  },
  {
    skill: "content-engine",
    group: "A",
    why:
      "The prerequisite paragraph. The server sets cwd, so there is no different folder to have opened",
    times: 1,
    removed: [
      "Read `./growth-engine/founder-brain.md`. If it does not exist, check the parent folder and the home directory before concluding it is missing. Founders commonly open a different folder from the one they built in.",
    ],
    added: [
      "Read `./growth-engine/founder-brain.md`.",
    ],
  },
  {
    skill: "content-engine",
    group: "B",
    why:
      "Namespaced slash command. Both the interface name and the plain language phrase, because both routes into the Brain exist",
    times: 1,
    removed: [
      "If it genuinely does not exist, stop and tell the founder to run `/growth-engine:brain` first, or to say \"build my founder brain\". Do not guess at their business or voice.",
    ],
    added: [
      "If it genuinely does not exist, stop and tell the founder to open Founder Brain, or to say \"build my founder brain\". Do not guess at their business or voice.",
    ],
  },
  {
    skill: "content-engine",
    group: "T",
    why:
      "Section 4 track marker opening the B2B format branch",
    times: 1,
    removed: [],
    added: [
      "<!-- TRACK:b2b -->",
    ],
  },
  {
    skill: "content-engine",
    group: "T",
    why:
      "Section 4 track marker closing the B2B and then the B2C format branch",
    times: 2,
    removed: [],
    added: [
      "<!-- /TRACK -->",
    ],
  },
  {
    skill: "content-engine",
    group: "T",
    why:
      "Section 4 track marker opening the B2C format branch",
    times: 1,
    removed: [],
    added: [
      "<!-- TRACK:b2c -->",
    ],
  },
  {
    skill: "content-engine",
    group: "E",
    why:
      "Group E3. Gate B is proved by ledger rows at approved, and nothing told the founder that reading is not approving",
    times: 1,
    removed: [],
    added: [
      "Reading a piece is not approving it. A piece counts towards the gate once it is marked approved, so tell the founder to mark each one as they finish reading it.",
      "",
    ],
  },
  {
    skill: "outreach-b2b",
    group: "A",
    why:
      "The prerequisite paragraph, deleted, and the namespaced slash command in the sentence below it, rewritten. They are adjacent, so the diff reads them as one change",
    times: 1,
    removed: [
      "If it does not exist, check the parent folder and the home directory before concluding it is missing. Founders commonly open Claude Code in a different folder from the one they built in.",
      "",
      "If it genuinely does not exist, stop. Tell the founder to run `/growth-engine:brain` first (or to say \"build my founder brain\") and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.",
    ],
    added: [
      "If it genuinely does not exist, stop. Tell the founder to open Founder Brain, or to say \"build my founder brain\", and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.",
    ],
  },
  {
    skill: "audience-b2c",
    group: "A",
    why:
      "The prerequisite paragraph, deleted, and the namespaced slash command in the sentence below it, rewritten. They are adjacent, so the diff reads them as one change",
    times: 1,
    removed: [
      "If it does not exist, check the parent folder and the home directory before concluding it is missing. Founders commonly open Claude Code in a different folder from the one they built in.",
      "",
      "If it genuinely does not exist, stop. Tell the founder to run `/growth-engine:brain` first (or to say \"build my founder brain\") and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.",
    ],
    added: [
      "If it genuinely does not exist, stop. Tell the founder to open Founder Brain, or to say \"build my founder brain\", and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.",
    ],
  },
  {
    skill: "ghl-workflows",
    group: "A",
    why:
      "The prerequisite paragraph, deleted, and the namespaced slash command in the sentence below it, rewritten. They are adjacent, so the diff reads them as one change",
    times: 1,
    removed: [
      "If it does not exist, check the parent folder and the home directory before concluding it is missing. Founders commonly open Claude Code in a different folder from the one they built in.",
      "",
      "If it genuinely does not exist, stop. Tell the founder to run `/growth-engine:brain` first (or to say \"build my founder brain\") and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.",
    ],
    added: [
      "If it genuinely does not exist, stop. Tell the founder to open Founder Brain, or to say \"build my founder brain\", and do not proceed. Do not ask them to describe their business again from scratch, and do not guess at their offer, audience or voice. Everything this skill produces is only as good as the Brain behind it.",
    ],
  },
  {
    skill: "growth-plan",
    group: "A",
    why:
      "The prerequisite paragraph and the namespaced slash command, both on one line in this file",
    times: 1,
    removed: [
      "If `founder-brain.md` itself is missing, check the parent folder and home directory first. If it genuinely does not exist, stop and tell the founder to run `/growth-engine:brain`, or to say \"build my founder brain\". There is no plan to build without it.",
    ],
    added: [
      "If `founder-brain.md` itself is missing, stop and tell the founder to open Founder Brain, or to say \"build my founder brain\". There is no plan to build without it.",
    ],
  },
  {
    skill: "growth-plan",
    group: "E",
    why:
      "Group E2. 00-scope.md:52 records that this skill never read the track, so both tracks were receiving an identical plan",
    times: 1,
    removed: [],
    added: [
      "Read the `track` field. A B2B plan sequences the sequence, the list and the sending. A B2C plan sequences the DMs, the hooks and the inbound machine. Never put the other track's work in a founder's plan.",
      "",
    ],
  },
  {
    skill: "status",
    group: "A",
    why:
      "The prerequisite paragraph. The whole section goes, heading included: the app sets the working folder, so there is nothing to look for and nowhere else it could be. Leaving the heading with no body would be worse than deleting it",
    times: 1,
    removed: [
      "## Check the folder",
      "",
      "Look for `./growth-engine/`. If it is not in the current folder, check the parent folder and the home directory before concluding it does not exist.",
      "",
      "If you cannot find it, ask the founder where they built it. Do not assume they have done nothing. Scattered work is far more common than no work.",
      "",
    ],
    added: [],
  },
  {
    skill: "playbook-export",
    group: "A",
    why:
      "The prerequisite paragraph. The server sets cwd, so the folder cannot be missing",
    times: 1,
    removed: [
      "Read every file in `./growth-engine/`. If the folder is missing, check the parent folder and home directory before concluding the founder has done nothing.",
    ],
    added: [
      "Read every file in `./growth-engine/`.",
    ],
  },
  {
    skill: "playbook-export",
    group: "B",
    why:
      "Namespaced slash command. Both the interface name and the plain language phrase",
    times: 1,
    removed: [
      "If `founder-brain.md` does not exist, stop and tell the founder to run `/growth-engine:brain` (or say \"build my founder brain\"). There is nothing to compile.",
    ],
    added: [
      "If `founder-brain.md` does not exist, stop and tell the founder to open Founder Brain, or to say \"build my founder brain\". There is nothing to compile.",
    ],
  },
];

/**
 * The track marker blocks section 4 requires, declared exactly.
 *
 * WHY THIS EXISTS AS WELL AS THE ALLOWLIST ABOVE. A marker line on its own is
 * three identical characters of comment, so an allowlist row for it would
 * authorise inserting that marker anywhere in the file, including around the
 * wrong branch. Wrapping the B2B block in a `b2c` marker would strip a B2C
 * founder's own questions and hand them the other track's, which is rule 1
 * failing in the one place it is meant to be structural. So the blocks are
 * declared here by their first and last real line and checked as a set.
 */
export interface TrackBlock {
  readonly skill: string;
  readonly track: "b2b" | "b2c";
  readonly firstLine: string;
  readonly lastLine: string;
}

export const TRACK_BLOCKS: readonly TrackBlock[] = [
  {
    skill: "founder-brain",
    track: "b2c",
    firstLine:
      "**If track is B2C**, ask one more question: do they sell a service people book, or products people buy from a shop? Record the answer as `Model`, either `service` or `ecommerce`. It decides which operations snapshot they get and how their content is shaped. Never ask this of a B2B founder.",
    lastLine:
      "**If track is B2C**, ask one more question: do they sell a service people book, or products people buy from a shop? Record the answer as `Model`, either `service` or `ecommerce`. It decides which operations snapshot they get and how their content is shaped. Never ask this of a B2B founder.",
  },
  {
    skill: "founder-brain",
    track: "b2b",
    firstLine: "**If track is B2B**, capture the ICP:",
    lastLine: "- Which companies are your best-fit customers today? Name three.",
  },
  {
    skill: "founder-brain",
    track: "b2c",
    firstLine: "**If track is B2C**, capture the persona:",
    lastLine: "- What do they already buy that sits next to your product?",
  },
  {
    skill: "content-engine",
    track: "b2b",
    firstLine: "### If track is b2b",
    lastLine:
      "Each post: a specific opening line that earns the second line, one idea, concrete detail from their proof, no generic advice. If the Brain flagged thin proof, lean on point of view and observation rather than inventing results. **Never invent numbers, customers, or outcomes.**",
  },
  {
    skill: "content-engine",
    track: "b2c",
    firstLine: "### If track is b2c",
    lastLine: "Include the on-screen text separately from the spoken line where they differ.",
  },
];
