/**
 * confidence.ts: how loud each thing this folder can find is allowed to be.
 *
 * WHY IT EXISTS
 *
 *   The rules in this folder are detectors. They read a file and say what they
 *   found. Nothing was stopping a detector that is often wrong from costing a
 *   founder their work, because each one set its own severity, next to its own
 *   argument, and no single place asked the only question that matters:
 *
 *     Am I confident, and is the harm real?
 *
 *   This file is that question asked once, out loud, for every single thing the
 *   folder can report. One table. A reviewer reads it in two minutes and can
 *   say whether the gate is too loud, which was not possible when the answer
 *   was spread across five modules and forty comments.
 *
 * THE CONSTRAINT THIS WAS BUILT UNDER, in the client's words: these founders
 *   are not technical, so a founder must almost never be interrupted. A founder
 *   should be able to work all afternoon and never see this thing. That is the
 *   bar. Not "the gate is defensible". Not "the rule has an argument". A gate
 *   that speaks on a guess teaches 130 people to click past it, and then it is
 *   not protecting anybody from the one time it is right.
 *
 * WHAT WAS MEASURED, because an argument for precision is not precision.
 *
 *   Twenty sentences an ordinary founder would type, against a Brain that
 *   grounds none of the numbers in them. They are in `confidence.test.ts` and
 *   they are the ordinary kind: "I have 1,200 followers", "I charge 2,500 GBP
 *   for a full survey", "the workshop holds 8 people". Before this file,
 *   fourteen of the twenty were held back from the founder. Fourteen. Every one
 *   of those is a founder whose content plan came back short because they told
 *   the truth about their own business.
 *
 *   After this file, one of the twenty is held. It is "We saved a client 11
 *   hours a week", which is a result claim about somebody else's business, and
 *   it is the shape rule 5 exists for. The test keeps that count honest and
 *   fails if it climbs above two.
 *
 * THE THREE VOLUMES
 *
 *   held     The file does not reach the founder. Reserved for a finding that
 *            is confident AND harmful. Everything on this level has been run
 *            against ordinary founder writing and does not fire on it.
 *   note     The file reaches the founder with a line beside it that they can
 *            read or ignore. Nothing is taken away.
 *   nothing  Kept for the audit trail and never shown. This is where a
 *            detector that is thinking out loud belongs. "I could not tell what
 *            this number is" is not information a founder can act on.
 *
 * IT IS A CEILING, NOT AN OVERRIDE, and that direction is the whole safety
 *   argument. A rule may be quieter than its ceiling for a good local reason:
 *   `ownership.not-listed` already drops itself to a note when the file is
 *   somewhere the founder can see, and that judgement is better made where the
 *   folder is known. A rule may never be louder. So this table can only ever
 *   quieten, and a mistake in it costs a founder nothing but a missing note.
 *
 * AN UNKNOWN CODE BECOMES A NOTE. Not a hold. A finding nobody has argued for
 *   is by definition a finding nobody has argued is worth a founder's
 *   afternoon, and the safe default for a gate whose job is to stay out of the
 *   way is to stay out of the way. `confidence.test.ts` fails if any code a
 *   rule can emit is missing from the table, so the default is a backstop
 *   rather than a place codes quietly live.
 *
 * WHAT THIS FILE DOES NOT DECIDE. What a hold COSTS is `harvest-gate.ts`:
 *   whether the one file is held or the whole turn is rolled back. Two
 *   decisions, deliberately apart, because they multiply.
 *
 * CALLED BY: index.ts, on every artifact, through `quieten`.
 * READS:     nothing on disk.
 * WRITES:    nothing.
 */

import type { Confirmed, RuleResult, Severity, Violation } from './types.ts';

/** What a founder actually experiences when a rule finds this thing. */
export type FounderSees = 'held' | 'note' | 'nothing';

/**
 * One row of the table: a finding, with both questions answered.
 *
 * `sure` and `harm` are prose on purpose. A boolean would let somebody flip a
 * row without writing down why, and the writing down is the mechanism. If you
 * cannot finish the sentence, the answer is no.
 *
 * NEITHER FIELD IS EVER SHOWN TO A FOUNDER. They are written for whoever comes
 * to change a row, so they name rules by number and talk about the gate. What a
 * founder reads is the rule's own `message` and `why`, and those never do either.
 */
export interface Judgement {
  code: string;
  /** Am I confident? What was measured, not what was argued. Not founder facing. */
  sure: string;
  /** Is the harm real? What happens to the founder, not to the rule. Not founder facing. */
  harm: string;
  sees: FounderSees;
  /**
   * May the founder say "no, that is true, keep it" and have it stick?
   *
   * True where the founder is the authority on the answer, which is anything
   * about the facts of their own business. False where they are not, and there
   * is exactly one of those: rule 2. A founder can be completely right that
   * they want automated cold DMs and still lose their Instagram account for it,
   * because the party that decides is Instagram. An override there would be the
   * app helping somebody agree to something it knows will cost them.
   */
  overridable: boolean;
}

/**
 * Every finding this folder can report, with how loud it is allowed to be.
 *
 * Grouped by rule, in the order `runRules` runs them, so this reads in the same
 * order a founder would meet them.
 */
export const JUDGEMENTS: readonly Judgement[] = [
  /* Rule 1: two tracks, forked once. ------------------------------------- */
  {
    code: 'track.wrong-track-file',
    sure: 'Yes. A file name matched exactly against the list in gates.md. No sentence is read and no judgement is made.',
    harm: 'A b2b founder opens a file of Instagram DM openers. It is work they cannot use, and it makes them doubt the rest of the folder.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.not-chosen-yet',
    sure: 'Yes. The same exact file name match, made before any track exists to compare it against.',
    harm: 'Half a set of work for a track the founder has not picked, which they then have to be talked out of.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.missing-from-brain',
    sure: 'Yes. The Track line is either in the Brain or it is not, and no sentence is being read.',
    harm: 'Eleven later steps read that one line. Without it the founder gets asked which track they are on at every step.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.unknown-value',
    sure: 'Yes. The line reads b2b, or it reads b2c, or it reads something else. Nothing to interpret.',
    harm: 'The same as a missing line. The fork has nothing to match on, so the founder is asked again at every step.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.brain-disagrees',
    sure: 'Yes. The track on the session and the track in the Brain, compared as strings.',
    harm: 'One of them picks the steps and the other picks the content, so half the work gets built for the wrong track.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.person-no-kind',
    sure: 'Yes. The kind line is present in the person file or it is absent. An exact test on a field.',
    harm: 'A prospect record that later steps cannot read, so the person quietly stops appearing.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.person-unknown-kind',
    sure: 'Yes. The kind is one of a fixed set of words, or it is not one of them.',
    harm: 'The same. The record sits in the folder and nothing downstream can read it, so the person is invisible.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.person-wrong-kind',
    sure: 'Yes. The session track compared against the fixed set of kinds each track uses.',
    harm: 'The other track leaking into the founder\'s own people list, which is the one place they will trust without checking.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.person-both-kinds',
    sure: 'Yes. Two lines that cannot both be true about one person are both in the file.',
    harm: 'A record that reads differently depending on which step opens it.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.wrong-track-word',
    sure: 'The blocking half of the vocabulary list is jargon that does not turn up by accident: Apollo, ICP, firmographics, DKIM, hook bank, DM openers. A b2c founder does not write DKIM in a post about their skincare line.',
    harm: 'The founder reads a paragraph of the other track\'s method and follows it. That is the fork breaking, which is rule 1.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'track.wrong-track-word-maybe',
    sure: 'No, and the code says so. These are ordinary words, "sequence" and "prospect" and "Instagram", that lean one way and belong to nobody.',
    harm: 'Usually none. A b2b founder can say the word Instagram.',
    sees: 'note',
    overridable: true,
  },

  /* Rule 2: no Instagram DM automation, ever. ---------------------------- */
  {
    code: 'dm.offered',
    sure: 'Two signals have to agree: a named channel and a hand off verb, in one sentence, not refusing, about somebody who did not write in first. Measured against twelve sentences about DMs, it fired on the three that were offers and none of the nine that were not.',
    harm: 'The founder takes the suggestion elsewhere, sends automated cold DMs, and Instagram restricts the account. There is nobody to appeal to, and the whole B2C track runs through that account.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'dm.offered-by-inference',
    sure: 'No. The channel was inferred from a word that means an opening message. The sentence never says DM at all, so it may be about email, where none of this applies.',
    harm: 'Real if the guess is right, nothing if it is wrong, and the rule cannot tell which.',
    sees: 'note',
    overridable: false,
  },
  {
    code: 'dm.possible-offer',
    sure: 'No. One signal, on its own, with nothing agreeing with it.',
    harm: 'Unknown, which is the honest answer when one signal fired and nothing agreed with it.',
    sees: 'note',
    overridable: false,
  },
  {
    code: 'dm.mentioned-while-refusing',
    sure: 'The line is refusing to automate DMs, which is the product working exactly as designed. The audience skill tells the model to write this sentence.',
    harm: 'None at all. Asking a founder to double check the one line that states the rule correctly is the gate wasting their attention on itself.',
    sees: 'nothing',
    overridable: false,
  },

  /* Rule 5: never invent proof. ------------------------------------------ */
  {
    code: 'proof.invented-result',
    sure: 'Only the narrow shape survives here: a quantity that moved, an outcome verb with somebody it happened to, or a rate about the founder\'s own business. Measured against twenty ordinary founder sentences, one fired, and that one was a result claim about a client.',
    harm: 'The founder puts a figure in front of a buyer, the buyer asks where it came from, and the answer is nowhere. In a small industry somebody always asks.',
    sees: 'held',
    overridable: true,
  },
  {
    code: 'proof.unbacked-figure',
    sure: 'No. This is the wide half of rule 5: counts, prices, followers, bookings. Measured, it fires on ordinary founder writing about half the time, because ordinary founder writing is full of true numbers the Brain has not been told yet.',
    harm: 'Real when the figure is invented. Nothing when the founder simply has not written it down yet, which is the common case.',
    sees: 'note',
    overridable: true,
  },
  {
    code: 'proof.ungrounded-number',
    sure: 'No, and the rule says so in its own name. It could not read the sentence around the number.',
    harm: 'Unknown. A founder cannot act on "I could not tell what this is", and neither can anybody else.',
    sees: 'nothing',
    overridable: true,
  },
  {
    code: 'proof.nothing-to-check-against',
    sure: 'Yes. The Brain has either been written or it has not, and nothing here is reading a sentence.',
    harm: 'Not a lie, an order of work. Writing posts before the Brain means writing them twice.',
    sees: 'note',
    overridable: false,
  },

  /* House style, and rule 3. --------------------------------------------- */
  {
    code: 'prose.dash',
    sure: 'Yes. The character class comes from validate.sh and it is either in the text or it is not.',
    harm: 'None. It is a punctuation preference the founder never agreed to, and taking away a whole content plan over one is the gate serving itself.',
    sees: 'note',
    overridable: true,
  },
  {
    code: 'prose.banned-word',
    sure: 'Yes. A word list lifted from validate.sh and matched exactly, with the same word boundaries the pre commit check uses.',
    harm: 'None to the founder. It is flat copy, not a false claim, and they can change a word.',
    sees: 'note',
    overridable: true,
  },
  {
    code: 'prose.banned-phrase',
    sure: 'Yes. The same lifted list, matched exactly, so the two checks cannot drift apart.',
    harm: 'None to the founder. Flat copy rather than a false claim, and they can change a phrase in ten seconds.',
    sees: 'note',
    overridable: true,
  },
  {
    code: 'prose.range-dash',
    sure: 'Yes. A digit, a dash and a digit, with dates and code spans masked out first.',
    harm: 'Small. The range still reads, and the worst case is a stray character when the font changes.',
    sees: 'note',
    overridable: true,
  },
  {
    code: 'prose.promise-reply',
    sure: 'Reasonably. The rule separates a line that makes the promise from one that refuses to, and the refusing half was the failure it was rewritten to fix.',
    harm: 'Rule 3. The founder sends twenty five messages expecting a number of replies that nobody can hand them, and blames the work when it does not come.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'prose.promise-reply-unclear',
    sure: 'No. The words are in one sentence and the rule cannot tell which way round.',
    harm: 'Real if it is a promise, none if it is a disclaimer.',
    sees: 'note',
    overridable: true,
  },

  /* Rule 4: everything lands in the founder's folder. -------------------- */
  {
    code: 'ownership.absolute-path',
    sure: 'Yes. The path either starts from the root of a disk or it does not. No reading involved.',
    harm: 'The file lands on a machine the founder cannot reach, so it is nobody\'s.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'ownership.escapes-folder',
    sure: 'Yes. The path either has two dots as a whole segment or it does not. No reading involved.',
    harm: 'The same, and it writes outside the folder while doing it.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'ownership.backslash-path',
    sure: 'Yes. A backslash is either in the path or it is not, and no founder writing is being judged.',
    harm: 'A file with a backslash in its name, which nothing downstream can open.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'ownership.odd-path',
    sure: 'Yes. Whitespace at one end of the path, or an empty path. Both are exact tests.',
    harm: 'A file the founder cannot click on, because its name is not what it looks like.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'ownership.unlistable-person-file',
    sure: 'Yes. Person files follow one naming rule, always, and this file name either follows it or it does not.',
    harm: 'A prospect the founder cannot look up and cannot delete.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'ownership.not-listed',
    sure: 'Yes. A path compared against a list. The rule already quietens itself when the file sits somewhere the founder can see, and that judgement stays where the folder is known.',
    harm: 'Outside a known folder, a file that exists and cannot be opened or downloaded.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'ownership.rewrote-yours',
    sure: 'Yes. Two stored versions of the same section, compared. Nothing is being interpreted.',
    harm: 'The founder\'s own words came back changed. That is the one promise this product makes about their writing, and it is worth a held file every time.',
    sees: 'held',
    overridable: false,
  },
  {
    code: 'ownership.rewrote-outside-markers',
    sure: 'Yes as a comparison, but the parts outside the markers were never promised to come back untouched.',
    harm: 'Small. Usually a heading moved or a trailing space went, in a part nobody promised to preserve.',
    sees: 'note',
    overridable: true,
  },
];

const BY_CODE = new Map(JUDGEMENTS.map((j) => [j.code, j]));

/**
 * How loud this code is allowed to be. A code nobody has argued for is a note.
 *
 * `held.` prefixed codes come back out of harvest-gate.ts, where a held file is
 * described to the founder alongside the files that saved. Those are already a
 * note by construction, so the prefix is read through to the judgement behind
 * it rather than falling to the default.
 */
export function founderSees(code: string): FounderSees {
  const bare = code.startsWith('held.') ? code.slice('held.'.length) : code;
  return BY_CODE.get(bare)?.sees ?? 'note';
}

/** The row behind a code, for anything that needs to explain the decision. */
export function judgementFor(code: string): Judgement | undefined {
  return BY_CODE.get(code);
}

/** Can the founder say "that one is true, keep it" about this finding? */
export function isOverridable(code: string): boolean {
  return BY_CODE.get(code)?.overridable ?? false;
}

/** The ceiling as a severity, for the two levels a violation can carry. */
function ceiling(code: string): Severity | null {
  switch (founderSees(code)) {
    case 'held':
      return 'block';
    case 'note':
      return 'warn';
    case 'nothing':
      return null;
  }
}

/**
 * What the founder already told us to stop asking about.
 *
 * Matched on the rule and the exact text that tripped, because those two are
 * what the founder saw. Confirming the figure 1,200 must not also silence an em
 * dash, and confirming it in one file must silence it in the next one, since
 * the founder was answering about their business rather than about a file.
 *
 * Case and surrounding space are ignored. A founder confirms "1,200" and the
 * next post writes "1,200 " with a trailing space, and asking twice about the
 * same figure is exactly the thing this is here to stop.
 */
function alreadyConfirmed(v: Violation, confirmed: readonly Confirmed[]): boolean {
  if (!isOverridable(v.code)) return false;
  const found = v.found.trim().toLowerCase();
  if (found === '') return false;
  return confirmed.some((c) => c.rule === v.rule && c.found.trim().toLowerCase() === found);
}

/**
 * ONE REPORT PER KIND OF THING, PER FILE.
 *
 * WHY, and this is the second half of the noise problem rather than a tidy up.
 * Lowering a finding from held to note fixes what it costs. It does not fix how
 * often a founder reads it. A thirty post content plan carries forty numbers
 * and a founder was going to be shown forty notes, all saying the same
 * sentence with a different figure in it. Nobody reads the fortieth. Most
 * people stop at the third, and after that the gate is furniture.
 *
 * So repeats of the same code fold into the first one, and the first one says
 * how many others there were. A founder reads one line, learns one thing, and
 * can act on it once for the whole file. The full list stays in `notes` for the
 * audit trail, so nothing is lost, it is just not all shouted.
 *
 * BLOCKS FOLD TOO. A file that is held is held once. `explainHold` already
 * shows the founder one cause and one way out, so five copies of it in the
 * array were only ever going to be counted and thrown away by a screen.
 */
function foldRepeats(violations: readonly Violation[]): { kept: Violation[]; folded: string[] } {
  const first = new Map<string, Violation>();
  const extras = new Map<string, number>();
  const folded: string[] = [];

  for (const v of violations) {
    if (!first.has(v.code)) {
      first.set(v.code, v);
      continue;
    }
    extras.set(v.code, (extras.get(v.code) ?? 0) + 1);
    folded.push(`${v.code} was also on line ${v.where.line}, on "${v.found}".`);
  }

  const kept = [...first.values()].map((v) => {
    const more = extras.get(v.code) ?? 0;
    if (more === 0) return v;
    // "like it" rather than "the same", because two banned words are the same
    // kind of problem and not the same word, and telling a founder they wrote
    // "seamless" twice when they wrote it once and "unlock" once is a small lie.
    const tail =
      more === 1
        ? 'There is one more like it in this file.'
        : `There are ${more} more like it in this file.`;
    return { ...v, message: `${v.message} ${tail}` };
  });

  return { kept, folded };
}

/**
 * Apply the ceiling to one rule's answer.
 *
 * Anything at `nothing` leaves the violation list and becomes a line in
 * `notes`, so the audit trail keeps it and the founder never reads it. `ok` is
 * recomputed from what is left, which is the point: a finding that is only a
 * note does not hold a file.
 */
export function quieten(result: RuleResult, confirmed: readonly Confirmed[] = []): RuleResult {
  const loud: Violation[] = [];
  const notes = [...result.notes];

  for (const v of result.violations) {
    if (alreadyConfirmed(v, confirmed)) {
      notes.push(`"${v.found}" was left alone, because you said it was right.`);
      continue;
    }
    const cap = ceiling(v.code);
    if (cap === null) {
      notes.push(`${v.code} was found on line ${v.where.line} and not shown, because it is a guess.`);
      continue;
    }
    // min of the two: a rule that chose `warn` for a local reason keeps it.
    const severity: Severity = cap === 'warn' || v.severity === 'warn' ? 'warn' : 'block';
    loud.push(severity === v.severity ? v : { ...v, severity });
  }

  const { kept, folded } = foldRepeats(loud);

  return {
    rule: result.rule,
    ok: !kept.some((v) => v.severity === 'block'),
    checked: result.checked,
    violations: kept,
    notes: [...notes, ...folded],
  };
}

/**
 * The record to store when a founder says a finding is right.
 *
 * Built here so the button, the store and the rules cannot disagree about what
 * a confirmation is. See the header of `types.ts` for where it is kept.
 */
export function confirmationFor(violation: Violation): Confirmed | null {
  if (!isOverridable(violation.code)) return null;
  const found = violation.found.trim();
  if (found === '') return null;
  return { rule: violation.rule, found };
}
