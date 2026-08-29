/**
 * mcp/ge-argv.test.ts
 *
 * WHAT: Tests the argv arrays the model's two tools hand to ge, and the way
 *       ge's three exit codes are read back.
 *
 * WHY IT EXISTS: These arrays are the only thing the model can make ge do. If
 *       one of them is shaped wrong, ge refuses and a founder mid conversation
 *       is told something confusing. If a value can be read as an option, the
 *       model can reach a verb nobody meant it to reach.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/mcp/ge-argv.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ArgvRefusal,
  describeGeResult,
  personAddProspectArgv,
  personAddTargetArgv,
  rememberArgv,
  PERSON_SOURCES,
  REMEMBER_KINDS,
  TARGET_PLATFORMS,
} from './ge-argv.js';

test('remember matches the shape scripts/cmd/remember.sh documents', () => {
  assert.deepEqual(rememberArgv({ kind: 'decision', text: 'chose the b2b track' }), [
    'remember',
    'decision',
    'chose the b2b track',
  ]);
  assert.deepEqual(
    rememberArgv({ kind: 'voice', text: 'never says solutions', detail: 'ops log 12 Sep' }),
    ['remember', 'voice', 'never says solutions', '--detail', 'ops log 12 Sep'],
  );
});

test('the six kinds are the six kinds ge accepts', () => {
  assert.deepEqual([...REMEMBER_KINDS], ['decision', 'worked', 'didnot', 'voice', 'angle', 'thread']);
});

test('a prospect is added the way ge person add prospect expects', () => {
  assert.deepEqual(
    personAddProspectArgv({
      email: 'sam@example.com',
      name: 'Sam Reed',
      company: 'Northfield',
      title: 'Ops Director',
      source: 'apollo',
      priority: 1,
    }),
    [
      'person', 'add', 'prospect', 'sam@example.com', 'Sam Reed',
      '--company', 'Northfield',
      '--title', 'Ops Director',
      '--source', 'apollo',
      '--priority', '1',
    ],
  );
});

test('a target is added the way ge person add target expects', () => {
  assert.deepEqual(
    personAddTargetArgv({ platform: 'ig', handle: 'lumen.studio', name: 'Ada Kane' }),
    ['person', 'add', 'target', 'ig', 'lumen.studio', 'Ada Kane'],
  );
});

test('the platforms and sources are ge own lists', () => {
  assert.deepEqual([...TARGET_PLATFORMS], ['ig', 'fb', 'other']);
  assert.deepEqual([...PERSON_SOURCES], ['apollo', 'manual', 'import', 'form']);
});

test('empty optional values are left out rather than passed as empty flags', () => {
  assert.deepEqual(
    personAddProspectArgv({ email: 'a@b.co', name: 'A B', company: '   ', note: '' }),
    ['person', 'add', 'prospect', 'a@b.co', 'A B'],
  );
});

test('a value that starts with a dash is refused, because ge would read it as an option', () => {
  assert.throws(
    () => rememberArgv({ kind: 'decision', text: '--detail something' }),
    ArgvRefusal,
  );
  assert.throws(
    () => personAddProspectArgv({ email: '--help', name: 'X' }),
    ArgvRefusal,
  );
});

test('the refusal tells the model what to do instead', () => {
  try {
    rememberArgv({ kind: 'thread', text: '-x' });
    assert.fail('should have refused');
  } catch (err) {
    assert.ok(err instanceof ArgvRefusal);
    assert.ok(err.message.includes('without the leading dash'));
  }
});

test('a multi line memory line is refused, because memory is one line each', () => {
  assert.throws(
    () => rememberArgv({ kind: 'worked', text: 'line one\nline two' }),
    ArgvRefusal,
  );
});

test('exit 0 hands the model what ge printed', () => {
  const reply = describeGeResult(
    { exitCode: 0, stdout: 'OK  added Sam Reed\n', stderr: '', timedOut: false },
    'that prospect',
  );
  assert.equal(reply.isError, false);
  assert.ok(reply.text.includes('added Sam Reed'));
});

test('exit 2 is not a failure, it is an offer to add them', () => {
  const reply = describeGeResult(
    { exitCode: 2, stdout: '', stderr: 'no such person', timedOut: false },
    'that note',
  );
  assert.equal(reply.isError, false);
  assert.ok(reply.text.includes('Offer to add them'));
});

test('exit 1 passes ge own refusal through rather than rewriting it', () => {
  const reply = describeGeResult(
    {
      exitCode: 1,
      stdout: '',
      stderr: 'FAIL  that file is damaged.\n      → run: ge check\n',
      timedOut: false,
    },
    'that memory line',
  );
  assert.equal(reply.isError, true);
  assert.ok(reply.text.includes('→ run: ge check'));
  assert.ok(reply.text.includes('keeping any line that starts with an arrow'));
});

test('a timeout says nothing was written', () => {
  const reply = describeGeResult(
    { exitCode: 0, stdout: '', stderr: '', timedOut: true },
    'that prospect',
  );
  assert.equal(reply.isError, true);
  assert.ok(reply.text.includes('nothing was written'));
});

test('no reply to the model contains a dash the house style bans', () => {
  const replies = [
    describeGeResult({ exitCode: 0, stdout: '', stderr: '', timedOut: false }, 'x'),
    describeGeResult({ exitCode: 2, stdout: '', stderr: '', timedOut: false }, 'x'),
    describeGeResult({ exitCode: 1, stdout: '', stderr: '', timedOut: false }, 'x'),
    describeGeResult({ exitCode: 0, stdout: '', stderr: '', timedOut: true }, 'x'),
  ];
  for (const r of replies) assert.ok(!/[–—]/.test(r.text));
});
