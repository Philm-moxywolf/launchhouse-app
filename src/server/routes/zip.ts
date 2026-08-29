/**
 * src/server/routes/zip.ts
 *
 * WHAT THIS IS. A ZIP archive, built in memory from bytes we already hold.
 * About a hundred and fifty lines, no dependency.
 *
 * WHY IT EXISTS. Rule 4: everything a founder makes is theirs, visible and
 * downloadable. "Download everything" is one ZIP containing `growth-engine/`
 * exactly as a laptop would have had it. Three properties matter and each is a
 * decision in the code below.
 *
 *   TWO DOWNLOADS OF THE SAME VERSION ARE BYTE IDENTICAL. Fixed entry order,
 *   fixed timestamps, and no compression. That makes support arguments short:
 *   two founders comparing checksums get the same answer, and a founder who
 *   downloads twice does not have two different files to worry about. It is
 *   also why the entries are STORED rather than deflated. Deflate output is a
 *   function of the zlib build, so the same bytes through a different container
 *   image would produce a different archive, and the guarantee would quietly
 *   stop being true.
 *
 *   NO DEPENDENCY. A founder's whole corpus is a few hundred kilobytes of
 *   markdown and CSV. Adding an archiver to carry that is a supply chain and a
 *   version to keep current, for a format whose stored variant is a header, the
 *   bytes, and a table at the end.
 *
 *   NOTHING USER SUPPLIED BECOMES A PATH. Entry names come from `ge_file` rows,
 *   which the storage layer has already validated. This file adds the prefix
 *   and nothing else.
 *
 * WHAT CALLS IT. ./files.ts.
 * WHAT IT READS AND WRITES. Nothing. Buffers in, one Buffer out.
 */

/**
 * ZIP stores a DOS date and time. Fixed, so two downloads cannot differ by a
 * clock, which is what makes the archive reproducible.
 *
 * The packing is year since 1980 in bits 9 to 15, month in bits 5 to 8, day in
 * bits 0 to 4. Day and month are ONE BASED, so a zero in either is a date no
 * extractor can render: the first attempt at this printed "08-00-1996" in
 * `unzip -l`, which is a month that does not exist. Written out below rather
 * than as a magic number, because that is how it was wrong.
 */
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((1996 - 1980) << 9) | (1 << 5) | 1; // 1 January 1996

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const VERSION_NEEDED = 20;
const METHOD_STORED = 0;
/** Bit 11: the name is UTF-8. Every path here is ASCII today, and this makes it not matter. */
const FLAG_UTF8 = 0x0800;

export interface ZipEntry {
  /** The path inside the archive, forward slashes, no leading slash. */
  readonly name: string;
  readonly bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Refused above this. A founder folder is capped at 50 MB by storage, so
 * reaching this means something is wrong rather than a founder being prolific,
 * and building it in memory would take the process down for everybody else.
 */
export const ZIP_LIMIT_BYTES = 64 * 1024 * 1024;

export class ZipTooLarge extends Error {
  constructor(bytes: number) {
    super(`refusing to build a ${String(bytes)} byte archive in memory`);
    this.name = 'ZipTooLarge';
  }
}

/**
 * Build the archive.
 *
 * Entries are sorted by name here rather than trusted from the caller, because
 * "fixed order" has to be a property of this function or it is not a property
 * at all.
 */
export function buildZip(entries: readonly ZipEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  let total = 0;
  for (const e of sorted) total += e.bytes.length + e.name.length * 2 + 92;
  if (total > ZIP_LIMIT_BYTES) throw new ZipTooLarge(total);

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of sorted) {
    const name = Buffer.from(entry.name, 'utf8');
    const body = Buffer.from(entry.bytes);
    const crc = crc32(body);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METHOD_STORED, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); // compressed
    local.writeUInt32LE(body.length, 22); // uncompressed
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // no extra field, which is one more thing that cannot vary
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4); // made by
    central.writeUInt16LE(VERSION_NEEDED, 6); // needed to extract
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METHOD_STORED, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes, so no permission bits vary by host
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // disk with the central directory
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // no archive comment

  return Buffer.concat([...locals, ...centrals, eocd]);
}
