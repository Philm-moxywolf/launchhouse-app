/**
 * The sequence chain, and mostly one property: it never activates anything.
 *
 * Apollo creates a sequence inactive unless `active: true` is sent, and activating is a
 * separate call. Both absences are load bearing, and an absence is exactly the kind of
 * safety property that survives until somebody adds a field "for completeness". So it is
 * asserted against the actual outgoing requests rather than trusted to the code reading
 * correctly.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepareSequenceWithKey } from './apollo-sequences.ts';

const MEMBERS = [{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', title: 'Head', company: 'Acme' }];

/** Records every request, and answers each path the way a real account would. */
function apollo(opts: { mailboxes?: unknown[] } = {}) {
  const sent: { url: string; body: string }[] = [];
  const impl = (async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    sent.push({ url, body: init?.body ?? '' });
    const json = (o: unknown, status = 200) =>
      new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/email_accounts')) return json({ email_accounts: opts.mailboxes ?? [{ id: 'mb1' }] });
    if (url.includes('/emailer_schedules')) return json({ emailer_schedules: [{ id: 'sch1', default: true }] });
    if (url.includes('/contacts')) return json({ contact: { id: 'c1' } });
    if (url.includes('/add_contact_ids')) return json({ ok: true });
    if (url.includes('/sequences')) return json({ emailer_campaign: { id: 'seq1' } });
    return json({}, 404);
  }) as unknown as typeof globalThis.fetch;
  return { impl, sent };
}

describe('preparing a sequence', () => {
  test('never asks Apollo to activate anything, and never calls approve', async () => {
    const { impl, sent } = apollo();
    await prepareSequenceWithKey('not-a-real-key', 'My first 25', MEMBERS, impl);
    const everything = sent.map((s) => `${s.url} ${s.body}`).join(' ');
    assert.doesNotMatch(everything, /"active"\s*:\s*true/, 'a sequence must never be created active');
    assert.doesNotMatch(everything, /approve/, 'approve is the founder\'s button and this product must not press it');
  });

  test('uses the schedule Apollo marked default, without asking the founder for an id', async () => {
    const { impl, sent } = apollo();
    const out = await prepareSequenceWithKey('not-a-real-key', 'My first 25', MEMBERS, impl);
    assert.equal(out.kind, 'ok');
    const create = sent.find((s) => s.url.includes('/sequences') && !s.url.includes('add_contact_ids'));
    assert.match(create?.body ?? '', /sch1/);
  });

  test('a founder with no mailbox is told that, before anything is created', async () => {
    // Apollo answered {"email_accounts": []} on a real account. Without one there is no
    // send_email_from_email_account_id, so a sequence would be built and be unable to
    // send, and somebody would have to unpick it by hand.
    const { impl, sent } = apollo({ mailboxes: [] });
    const out = await prepareSequenceWithKey('not-a-real-key', 'My first 25', MEMBERS, impl);
    assert.equal(out.kind, 'no_mailbox');
    assert.equal(sent.length, 1, 'it must stop at the mailbox check, not after creating contacts');
  });

  test('the founder\'s own name for it is what reaches Apollo', async () => {
    // They will look for it in Apollo's list next week. A name we invented is one they
    // cannot find.
    const { impl, sent } = apollo();
    await prepareSequenceWithKey('not-a-real-key', 'Schools, batch one', MEMBERS, impl);
    const create = sent.find((s) => s.body.includes('emailer_schedule_id'));
    assert.match(create?.body ?? '', /Schools, batch one/);
  });

  test('contacts are deduplicated, so nobody gets the opener twice', async () => {
    const { impl, sent } = apollo();
    await prepareSequenceWithKey('not-a-real-key', 'My first 25', MEMBERS, impl);
    const contact = sent.find((s) => s.url.includes('/contacts'));
    assert.match(contact?.url ?? '', /run_dedupe=true/);
  });
});
