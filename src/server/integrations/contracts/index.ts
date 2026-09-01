/**
 * src/server/integrations/contracts/index.ts
 *
 * WHAT THIS IS
 *   The way in to the contracts, and the check that runs at boot: for every feature
 *   that is switched on, walk the contract entries it depends on, and refuse to
 *   start in production if any of them is still a hole.
 *
 * WHY IT EXISTS
 *   Holes that throw are only half the guarantee. The other half is finding out
 *   before a founder does. Without this check, a feature flag flipped on by someone
 *   who believed the spike had landed produces a green deploy, a founder pressing a
 *   button, and a `PendingContractError` in front of them during a live session.
 *   With it, the same mistake is a deploy that does not start and one screen of
 *   output naming the feature, the entry and the spike.
 *
 *   That is the difference between "we shipped on a guess" being discouraged and
 *   being impossible, and it is the reason the build document asks for it by name.
 *
 * IT WAS NOT CONNECTED, AND WHAT CONNECTING IT TURNED UP
 *   This header used to say `src/server/index.ts` called it at boot. Nothing did.
 *   The mechanism the build document asks for by name was a function with one test
 *   and no caller, which is the same as not having it.
 *
 *   Wiring it as written would have refused to start, and that is worth saying out
 *   loud rather than quietly working around: `csvExport` was listed here as on, and
 *   it depends on `GHL.socialPlannerCsvHeader`, which is spike S-05 and has never
 *   run. So the check did exactly what it was built to do the first time it ran.
 *
 *   THE CALL, AND WHY. The check gates boot, and the list it is given is corrected.
 *   `csvExport` is not on. Nothing in this app reads `socialPlannerCsvHeader`, there
 *   is no exporter and there is no page for the caveat that entry's comment claimed
 *   was on it. It was marked on by mistake, and gating the feature instead of the
 *   boot would have made the mistake permanent: a wrong flag would sit here reading
 *   as fact until somebody built the exporter against it. Rewording the assertion
 *   would have been worse again, because a promise downgraded to a comment is the
 *   failure this whole directory exists to prevent. So: boot walks FEATURES_ON, and
 *   the day somebody adds `csvExport` to that list before S-05 has run, the
 *   deployment refuses to start and names the spike.
 *
 * WHAT CALLS IT
 *   `src/server/index.ts`, inside `main()`, before anything binds a port. It is
 *   given FEATURES_ON below. Tests call `contractProblems` directly, which is why
 *   that returns a list and only `assertContractsReady` throws.
 *
 * READS   the contract objects in this directory. Nothing on disk, no network.
 * WRITES  nothing. It returns a list, or it throws.
 */

import { APOLLO } from './apollo.ts';
import { GHL } from './ghl.ts';
import { isPending, type PendingDetail } from './pending.ts';

export * from './pending.ts';
export * from './ghl.ts';
export * from './apollo.ts';

/**
 * Every feature this product can have, and the contract entries each one needs.
 *
 * The left column is a feature a founder can reach; the right column is what has to
 * be true before it can be. A feature with an empty list needs no vendor detail at
 * all, and most of this product is in that state on purpose: the Founder Brain, the
 * 30 pieces, the 25 openers, the hook bank, the inbound scripts, the ops copy and
 * the 90 day plan are all text the founder owns and none of it needs a vendor.
 *
 * THIS TABLE SAYS WHAT A FEATURE NEEDS. IT DOES NOT SAY WHAT IS ON. That is
 * FEATURES_ON below, and the two are separate because they change for different
 * reasons: a row here changes when a spike lands, a name there changes when
 * somebody decides to ship something.
 */
export const FEATURE_CONTRACTS: Readonly<Record<string, readonly unknown[]>> = {
  /** Content generation, the ledger and the files view. No vendor call in it. */
  content: [],
  /** The ops engine copy. No vendor call in it either. */
  ops: [],
  /** The Social Planner CSV export. */
  csvExport: [GHL.socialPlannerCsvHeader],
  /** Connecting a GoHighLevel token and verifying it. */
  ghlConnect: [GHL.hosts, GHL.baseUrl, GHL.headerNames, GHL.readLocation, GHL.listSocialAccounts],
  /** Publishing the 30 pieces as drafts. */
  ghlPublishDrafts: [GHL.hosts, GHL.baseUrl, GHL.headerNames, GHL.createPost, GHL.readPost],
  /** Publishing with a time on it. This is the one that stays off longest. */
  ghlSchedule: [GHL.hosts, GHL.baseUrl, GHL.headerNames, GHL.createPost, GHL.readPost, GHL.scheduleEncoding],
  /** Pushing the founder's people into the CRM. */
  ghlContacts: [GHL.hosts, GHL.baseUrl, GHL.headerNames, GHL.readContacts, GHL.createContact],
  /**
   * Apollo, all of it.
   *
   * The host, the auth header and both endpoint paths are documented now and are
   * exported as `_DOCUMENTED` constants rather than holes, so they are not in this
   * list. What is left is what a real call would settle: the field names that come
   * back, and whether a sequence can be written to at all.
   */
  apollo: [APOLLO.searchResponse, APOLLO.enrichResponse, APOLLO.sequences],
};

/**
 * WHAT IS ACTUALLY ON. This is the list boot walks, and adding a name to it is the
 * decision the check exists to catch.
 *
 * Two names, and both need nothing from a vendor. That is not a limitation, it is
 * where this product is: eight of the nine engines write text the founder owns, and
 * the ninth writes copy a founder pastes at the clinic by hand, because no API
 * creates a GoHighLevel workflow.
 *
 * WHY EVERY OTHER FEATURE IS OFF, one line each, so nobody has to reconstruct it:
 *
 *   csvExport         S-05 has never run, so nobody knows the header row GoHighLevel
 *                     expects. There is no such exporter in this repository yet, and
 *                     no template downloaded from their own UI for it to read its
 *                     header row out of. This entry was marked on in an earlier
 *                     version of this file and was not true when it was written.
 *   ghlConnect        S-02. No host, no base URL, no header names.
 *   ghlPublishDrafts  S-02. No create call, no read back, and every write is read
 *                     back before it is believed.
 *   ghlSchedule       S-03 as well as S-02. Four encodings are candidates for what a
 *                     schedule value means, and a post at the wrong hour for 130
 *                     people is worse than a post they scheduled by hand.
 *   ghlContacts       A2. The contacts read is not merely unverified, it is unknown.
 *   apollo            The Apollo spike, all of it.
 *
 * TURNING ONE ON IS TWO EDITS, NOT ONE. Fill the hole in the contract with what came
 * back from the spike, then add the name here. Doing only the second is what this
 * check refuses, at boot, before a port is bound.
 */
export const FEATURES_ON: readonly string[] = ['content', 'ops'];

export interface ContractProblem {
  feature: string;
  /** Which entry in the feature's list, by position. Names are not readable here. */
  index: number;
  spike: string;
  note: string;
}

/**
 * Every hole that a switched on feature depends on.
 *
 * Takes the set of features that are on rather than reading a flag itself, so the
 * same function answers for a test, for a preview deployment and for production
 * without any of them having to agree about where flags live.
 */
export function contractProblems(featuresOn: readonly string[]): ContractProblem[] {
  const problems: ContractProblem[] = [];
  for (const feature of featuresOn) {
    const needed = FEATURE_CONTRACTS[feature];
    if (needed === undefined) {
      throw new Error(
        `The feature "${feature}" is switched on and this file does not know what vendor details it depends on. Add it to FEATURE_CONTRACTS with its list, even if the list is empty. An unknown feature is not the same as a feature that needs nothing.`,
      );
    }
    needed.forEach((entry, index) => {
      const detail: PendingDetail | null = isPending(entry);
      if (detail !== null) {
        problems.push({ feature, index, spike: detail.spike, note: detail.note });
      }
    });
  }
  return problems;
}

/** The message whoever trips the boot check reads. Written for them. */
export function contractProblemsMessage(problems: readonly ContractProblem[]): string {
  return [
    'This deployment will not start, because a feature is switched on that depends on a vendor detail nobody has verified.',
    '',
    ...problems.map(
      (p) => `  feature "${p.feature}", entry ${p.index}, spike ${p.spike}\n    ${p.note}`,
    ),
    '',
    'Two ways out, and only two. Run the spike and write down what came back, or switch the feature off.',
    'Filling the entry in from documentation or from memory is neither of those, and it is the failure this check exists to prevent.',
  ].join('\n');
}

/**
 * Refuse to start when a switched on feature rests on a hole.
 *
 * Throws everywhere rather than only in production. A preview deployment that
 * starts on a guess teaches the team that the guess works, and then production
 * inherits it.
 *
 * The argument defaults to FEATURES_ON so that the boot call reads as the question
 * it is asking, and so a caller that passes its own list, which the tests do, is
 * visibly doing something different.
 */
export function assertContractsReady(featuresOn: readonly string[] = FEATURES_ON): void {
  const problems = contractProblems(featuresOn);
  if (problems.length > 0) throw new Error(contractProblemsMessage(problems));
}
