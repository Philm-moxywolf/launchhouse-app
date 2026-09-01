/**
 * src/server/integrations/apollo-sequences.ts
 *
 * WHAT THIS IS
 *   Building a founder's sequence in Apollo and putting their 25 people into it, paused.
 *
 * THE LINE THIS FILE DOES NOT CROSS
 *   Apollo creates a sequence inactive unless you send `active: true`, and activating is
 *   a separate call. Neither is here and neither may be added. `emailer_campaigns/
 *   approve` has no client in this product and must not get one.
 *
 *   That is what makes the sentence on the Apollo setup screen true: nothing sends until
 *   the founder presses send, in their own Apollo account, looking at the messages. The
 *   app writes the words and fills the list. A person decides to send them.
 *
 * WHY IT IS ONE FUNCTION AND NOT FIVE TOOLS
 *   The chain is contacts, then a sequence, then contacts into the sequence. Exposed as
 *   three tools a model can half-finish, leaving a founder with a sequence containing
 *   four of their twenty five and no way to tell. One call does all of it or reports
 *   what it managed.
 *
 * READS  `connections`. WRITES nothing of ours: everything it creates lives in Apollo.
 */

import { readApolloKey } from './apollo-token-store.ts';
import {
  APOLLO_AUTH_DOCUMENTED,
  APOLLO_CREATE_CONTACT_DOCUMENTED,
  APOLLO_HOST_DOCUMENTED,
  APOLLO_MAILBOXES,
  APOLLO_SCHEDULES_VERIFIED,
  APOLLO_SEQUENCE_DOCUMENTED,
} from './contracts/apollo.ts';
import { outcomeForApolloStatus, type ApolloKeyOutcome } from './apollo-key-check.ts';
import { vendorFetch, type VendorAnswer } from './http.ts';

/** Somebody to put in a sequence. Every field came from an enrichment. */
export interface SequenceMember {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly title?: string;
  readonly company?: string;
}

export type ApolloSequenceOutcome =
  | {
      readonly kind: 'ok';
      readonly sequenceId: string;
      readonly added: number;
      readonly skipped: readonly string[];
    }
  | { readonly kind: 'no_key' }
  /** No mailbox connected in Apollo, so a sequence has nothing to send from. */
  | { readonly kind: 'no_mailbox' }
  | { readonly kind: 'no_schedule' }
  | Exclude<ApolloKeyOutcome, { kind: 'ok' }>;

type Refusal = Exclude<ApolloKeyOutcome, { kind: 'ok' }>;

/** One call, with the outcome mapping every Apollo call in this product shares. */
async function call(
  key: string,
  operation: string,
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  fetchImpl?: typeof globalThis.fetch,
): Promise<{ ok: true; body: unknown } | { ok: false; refusal: Refusal }> {
  let answer: VendorAnswer;
  try {
    answer = await vendorFetch(
      {
        vendor: 'apollo',
        operation,
        url: `https://${APOLLO_HOST_DOCUMENTED}${path}`,
        method,
        headers: {
          [APOLLO_AUTH_DOCUMENTED.header]: key,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        ...(body === undefined ? {} : { body }),
      },
      fetchImpl,
    );
  } catch (error: unknown) {
    return {
      ok: false,
      refusal: { kind: 'unreadable', why: error instanceof Error ? error.message : 'the call was refused' },
    };
  }
  if (answer.kind === 'no_answer') return { ok: false, refusal: { kind: 'vendor_unavailable' } };
  const mapped = outcomeForApolloStatus(answer.status);
  if (mapped !== null && mapped.kind !== 'ok') return { ok: false, refusal: mapped };
  if (answer.status < 200 || answer.status >= 300) {
    return { ok: false, refusal: { kind: 'unreadable', why: `Apollo answered ${String(answer.status)} on ${operation}` } };
  }
  return { ok: true, body: answer.body };
}

function rows(body: unknown, key: string): readonly Record<string, unknown>[] {
  if (body === null || typeof body !== 'object') return [];
  const list = (body as Record<string, unknown>)[key];
  return Array.isArray(list) ? (list.filter((r) => r !== null && typeof r === 'object') as Record<string, unknown>[]) : [];
}

function idOf(row: Record<string, unknown> | undefined, key: string): string | null {
  const v = row?.[key];
  return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * Build the sequence and fill it. Paused, always.
 *
 * `sequenceName` is the founder's, not ours: they will look for it in Apollo's own list
 * next week and a name we invented is a name they cannot find.
 */
export async function prepareSequence(
  founderId: string,
  sequenceName: string,
  members: readonly SequenceMember[],
  fetchImpl?: typeof globalThis.fetch,
): Promise<ApolloSequenceOutcome> {
  const key = await readApolloKey(founderId);
  if (key === null) return { kind: 'no_key' };
  return prepareSequenceWithKey(key, sequenceName, members, fetchImpl);
}

/**
 * The same work with the key in hand, split out for the same reason enrichment is.
 *
 * Reading the key needs a database, and everything worth proving here is on the far side
 * of it: that `active: true` is never sent, that approve is never called, that a founder
 * with no mailbox is stopped before anything is created. Those are absences, and an
 * absence asserted against real outgoing requests is a fact rather than a reading of the
 * code.
 */
export async function prepareSequenceWithKey(
  key: string,
  sequenceName: string,
  members: readonly SequenceMember[],
  fetchImpl?: typeof globalThis.fetch,
): Promise<ApolloSequenceOutcome> {
  // THE MAILBOX FIRST, because without one nothing else is worth doing. A founder with
  // no mailbox connected in Apollo cannot send, and finding that out after creating a
  // sequence and twenty five contacts is a mess somebody has to clean up by hand.
  const mailboxes = await call(key, 'list mailboxes', 'GET', APOLLO_MAILBOXES.path, undefined, fetchImpl);
  if (!mailboxes.ok) return mailboxes.refusal;
  const mailboxId = idOf(rows(mailboxes.body, APOLLO_MAILBOXES.responseKey)[0], APOLLO_MAILBOXES.idKeyAssumed);
  if (mailboxId === null) return { kind: 'no_mailbox' };

  const schedules = await call(key, 'list schedules', 'GET', APOLLO_SCHEDULES_VERIFIED.path, undefined, fetchImpl);
  if (!schedules.ok) return schedules.refusal;
  const all = rows(schedules.body, APOLLO_SCHEDULES_VERIFIED.responseKey);
  const chosen = all.find((r) => r[APOLLO_SCHEDULES_VERIFIED.defaultKey] === true) ?? all[0];
  const scheduleId = idOf(chosen, APOLLO_SCHEDULES_VERIFIED.idKey);
  if (scheduleId === null) return { kind: 'no_schedule' };

  // Contacts, one at a time, because only contacts may enter a sequence. Somebody Apollo
  // refuses is skipped by name rather than failing the batch: twenty four in a sequence
  // and one named as missing is a better morning than none.
  const contactIds: string[] = [];
  const skipped: string[] = [];
  for (const m of members) {
    const made = await call(
      key,
      'create contact',
      'POST',
      `${APOLLO_CREATE_CONTACT_DOCUMENTED.path}?${APOLLO_CREATE_CONTACT_DOCUMENTED.dedupeParam}=true`,
      {
        first_name: m.firstName,
        last_name: m.lastName,
        email: m.email,
        ...(m.title === undefined ? {} : { title: m.title }),
        ...(m.company === undefined ? {} : { organization_name: m.company }),
      },
      fetchImpl,
    );
    if (!made.ok) {
      // A refusal here is about the account, not this person, so it stops.
      if (made.refusal.kind !== 'unreadable') return made.refusal;
      skipped.push(`${m.firstName} ${m.lastName}`.trim());
      continue;
    }
    const body = made.body;
    const contact = body !== null && typeof body === 'object'
      ? ((body as Record<string, unknown>)[APOLLO_CREATE_CONTACT_DOCUMENTED.responseKey] as Record<string, unknown> | undefined)
      : undefined;
    const id = idOf(contact, APOLLO_CREATE_CONTACT_DOCUMENTED.responseIdKey);
    if (id === null) skipped.push(`${m.firstName} ${m.lastName}`.trim());
    else contactIds.push(id);
  }

  // THE SEQUENCE. `active` is never sent, so Apollo creates it inactive. That is the
  // whole safety property of this file and it is one absent key.
  const made = await call(
    key,
    'create sequence',
    'POST',
    APOLLO_SEQUENCE_DOCUMENTED.createPath,
    { name: sequenceName, emailer_schedule_id: scheduleId },
    fetchImpl,
  );
  if (!made.ok) return made.refusal;
  const campaign = made.body !== null && typeof made.body === 'object'
    ? ((made.body as Record<string, unknown>)[APOLLO_SEQUENCE_DOCUMENTED.responseKey] as Record<string, unknown> | undefined)
    : undefined;
  const sequenceId = idOf(campaign, APOLLO_SEQUENCE_DOCUMENTED.responseIdKey);
  if (sequenceId === null) {
    return { kind: 'unreadable', why: 'Apollo created something and did not say which sequence it was' };
  }

  if (contactIds.length > 0) {
    const params = new URLSearchParams();
    params.set('emailer_campaign_id', sequenceId);
    params.set('send_email_from_email_account_id', mailboxId);
    for (const id of contactIds) params.append('contact_ids[]', id);
    const added = await call(
      key,
      'add contacts to sequence',
      'POST',
      `/api/v1/emailer_campaigns/${encodeURIComponent(sequenceId)}/add_contact_ids?${params.toString()}`,
      undefined,
      fetchImpl,
    );
    if (!added.ok) return added.refusal;
  }

  return { kind: 'ok', sequenceId, added: contactIds.length, skipped };
}
