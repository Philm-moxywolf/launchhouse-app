/**
 * src/server/routes/zip.test.ts
 *
 * WHAT THIS IS. The archive builder, checked against the format rather than
 * against itself.
 *
 * WHY IT EXISTS. This is a hand written binary format with no dependency
 * behind it, so "it produced some bytes" proves nothing. The CRC is checked
 * against the published value for a known string, the header fields are read
 * back at their documented offsets, and the DOS date is checked for a real
 * month and a real day, because the first version of this file wrote day zero
 * and `unzip -l` printed a date that does not exist.
 *
 * WHAT IT DOES NOT PROVE: that a founder's own extractor opens it. That was
 * checked once by hand with the system `unzip`, which reported no errors and
 * restored the tree. It is not a test because unzip is not on every machine
 * this runs on.
 *
 * WHAT IT CALLS. ./zip.ts.
 * WHAT IT READS AND WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ZipTooLarge, buildZip, crc32 } from './zip.ts';

const LOCAL_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;

test('CRC32 MATCHES THE PUBLISHED VALUE, SO A CORRUPT ENTRY IS DETECTABLE', () => {
  // The check value from the CRC32 specification. If this is wrong, every
  // archive we hand a founder reports as corrupt in their own extractor.
  assert.equal(crc32(Buffer.from('123456789', 'utf8')), 0xcbf43926);
  assert.equal(crc32(Buffer.from('', 'utf8')), 0);
  assert.equal(crc32(Buffer.from('The quick brown fox jumps over the lazy dog', 'utf8')), 0x414fa339);
});

test('THE ARCHIVE OPENS WITH A LOCAL HEADER AND ENDS WITH A CENTRAL DIRECTORY', () => {
  const zip = buildZip([{ name: 'growth-engine/founder-brain.md', bytes: Buffer.from('# Brain\n', 'utf8') }]);
  assert.equal(zip.readUInt32LE(0), LOCAL_SIG);
  assert.equal(zip.readUInt32LE(zip.length - 22), EOCD_SIG);
  assert.equal(zip.readUInt16LE(zip.length - 22 + 8), 1, 'one entry on this disk');
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 1, 'one entry in total');
  // Stored, not deflated. Deflate output depends on the zlib build, so the same
  // bytes through a different container image would produce a different file.
  assert.equal(zip.readUInt16LE(8), 0, 'compression method is stored');
  assert.equal(zip.readUInt32LE(18), zip.readUInt32LE(22), 'compressed size equals uncompressed size');
});

test('THE FIXED DATE IS A REAL DATE, WHICH IS HOW THIS WAS WRONG THE FIRST TIME', () => {
  const zip = buildZip([{ name: 'a.md', bytes: Buffer.from('x') }]);
  const dosDate = zip.readUInt16LE(12);
  const day = dosDate & 0x1f;
  const month = (dosDate >> 5) & 0x0f;
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  // Day and month are one based. A zero in either prints as a month that does
  // not exist, and `unzip -l` showed exactly that.
  assert.ok(day >= 1 && day <= 31, `day ${String(day)}`);
  assert.ok(month >= 1 && month <= 12, `month ${String(month)}`);
  assert.ok(year >= 1980, `year ${String(year)}`);
});

test('TWO BUILDS OF THE SAME FILES ARE BYTE IDENTICAL, IN ANY ORDER', () => {
  const files = [
    { name: 'growth-engine/content-30.csv', bytes: Buffer.from('date,post\n', 'utf8') },
    { name: 'growth-engine/founder-brain.md', bytes: Buffer.from('# Brain\n', 'utf8') },
    { name: 'growth-engine/people/sam-example-com.md', bytes: Buffer.from('# Sam\n', 'utf8') },
  ];
  const forwards = buildZip(files);
  const backwards = buildZip([...files].reverse());
  assert.ok(forwards.equals(backwards), 'entry order is decided here, not by the caller');

  // A founder comparing checksums between two downloads gets one answer, which
  // is what makes a support argument short.
  assert.ok(buildZip(files).equals(forwards));
});

test('THE ENTRY NAMES ARE IN THE ARCHIVE, WITH THEIR FOLDER PREFIX', () => {
  const zip = buildZip([
    { name: 'growth-engine/people/sam-example-com.md', bytes: Buffer.from('# Sam\n', 'utf8') },
    { name: 'growth-engine/.state/index.md', bytes: Buffer.from('| file |\n', 'utf8') },
  ]);
  const text = zip.toString('latin1');
  assert.match(text, /growth-engine\/people\/sam-example-com\.md/);
  assert.match(text, /growth-engine\/\.state\/index\.md/);
});

test('AN ARCHIVE BIGGER THAN THE LIMIT IS REFUSED RATHER THAN BUILT IN MEMORY', () => {
  // A founder folder is capped at 50 MB by storage, so reaching this means
  // something is wrong rather than a founder being prolific, and building it
  // would take the process down for everybody else.
  const huge = { name: 'big.bin', bytes: Buffer.alloc(65 * 1024 * 1024) };
  assert.throws(() => buildZip([huge]), ZipTooLarge);
});

test('AN EMPTY ARCHIVE IS STILL A VALID ARCHIVE', () => {
  const zip = buildZip([]);
  assert.equal(zip.length, 22);
  assert.equal(zip.readUInt32LE(0), EOCD_SIG);
  assert.equal(zip.readUInt16LE(10), 0);
});
