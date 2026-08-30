/**
 * scripts/seed.ts
 *
 * WHAT THIS IS. Fictional founders in the database, so the app can be driven end
 * to end. `npm run seed`.
 *
 * WHY IT EXISTS. Three reasons, and the first one is why it had to be written
 * before anything could be proved.
 *
 *   NOTHING CAN BE DRIVEN WITHOUT A FOUNDER. Sign in looks an address up in the
 *   `founder` table, and that table IS the roster: an address that is not in it
 *   is refused with the honest screen. So an empty database is an app nobody can
 *   get into, including whoever is building it.
 *
 *   A FOUNDER NEEDS A WRAPPED DATA KEY, AND ONE CANNOT BE TYPED. Every blob a
 *   founder owns is encrypted under a per founder key wrapped by GE_MASTER_KEY.
 *   A row inserted by hand with a null or a made up `wrapped_key` produces a
 *   founder who signs in fine and whose first turn fails inside the cipher, a
 *   long way from the mistake.
 *
 *   THE ONLY SOURCE OF DEMO DATA, ON PURPOSE. The README says there is no path
 *   from prod to anywhere and no restore from prod, ever. Reproducing a
 *   founder's bug means reproducing the shape by hand. That rule is what
 *   actually protects the 25 to 35 named prospects each founder holds, and it
 *   only holds if there is a sanctioned way to make a fake founder. This is it.
 *
 * THE FOUNDERS BELOW ARE INVENTED AND THEIR ADDRESSES ARE AT example.com, which
 * is reserved by RFC 2606 and cannot receive mail. Outside prod the mailer also
 * fails closed against MAIL_ALLOWLIST, so this is two belts on the same thing: a
 * seeded founder can never cause a real email to a real person.
 *
 * NO TRACK IS SEEDED ONTO THE FIRST TWO, and that is rule 1 rather than
 * laziness. The fork happens once, in the Founder Brain, and the build
 * document's first run screen says out loud that setup does not ask for it. A
 * seeded founder with a track already set would never exercise the path every
 * real founder takes on their first run. The last two do carry the column,
 * because driving the later engines by hand should not need a whole interview
 * first, and the column is only a cache: founder-brain.md wins over it every
 * time they disagree.
 *
 * WHAT CALLS IT. `npm run seed`. Nothing imports it.
 *
 * WHAT IT READS. The environment, through src/server/env.ts.
 * WHAT IT WRITES. `founder` rows, and nothing else. It refuses to run against
 * prod, and `--reset` refuses to run against anything but dev.
 */

import { inArray } from 'drizzle-orm';

import { loadEnv } from '../src/server/env.ts';

const env = loadEnv();

import { closeDb, getDb } from '../src/server/db/client.ts';
import { founders } from '../src/server/db/schema.ts';
import { createFounderKey } from '../src/server/storage/crypto.ts';
import { FOUNDER_ID_RE } from '../src/server/storage/paths.ts';

/** RFC 2606 reserves this. It cannot receive mail, which is the point. */
const SEED_DOMAIN = 'example.com';

/**
 * The event is in Atlanta, so the seeded founders are. A founder in Atlanta at
 * 22:00 on the 24th must not get a heading dated the 25th, and seeding UTC would
 * hide every bug of that shape until somebody in a different zone found it.
 */
const SEED_TIMEZONE = 'America/New_York';

interface SeedFounder {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  /** The cached column only. founder-brain.md is the authority. See the header. */
  readonly track: 'b2b' | 'b2c' | null;
  readonly why: string;
}

/**
 * Fixed ids, not random ones.
 *
 * A seed that produces a different id every run is a seed you cannot put in a
 * bug report, a curl command or a log filter. These are valid founder ids under
 * `FOUNDER_ID_RE`, which is checked below rather than assumed, because a bad id
 * becomes a path segment and storage refuses it a long way from here.
 */
const SEEDS: readonly SeedFounder[] = [
  {
    id: '01K3SEED000000000000000001',
    email: `priya.raman@${SEED_DOMAIN}`,
    displayName: 'Priya Raman',
    track: null,
    why: 'no track yet. The first run every real founder takes.',
  },
  {
    id: '01K3SEED000000000000000002',
    email: `marcus.hale@${SEED_DOMAIN}`,
    displayName: 'Marcus Hale',
    track: null,
    why: 'no track yet. The second unforked founder, for the two demo runs.',
  },
  {
    id: '01K3SEED000000000000000003',
    email: `nadia.okonkwo@${SEED_DOMAIN}`,
    displayName: 'Nadia Okonkwo',
    track: 'b2b',
    why: 'b2b in the cache, so the b2b sidebar paints without an interview first.',
  },
  {
    id: '01K3SEED000000000000000004',
    email: `tom.whitfield@${SEED_DOMAIN}`,
    displayName: 'Tom Whitfield',
    track: 'b2c',
    why: 'b2c in the cache, for the same reason on the other fork.',
  },
];

function refuseInProd(): void {
  // Two checks, not one. APP_ENV says what this process thinks it is, and
  // DATABASE_ENV_TAG says what the database it is pointed at thinks it is. A
  // dev process pointed at the prod database passes the first and fails this.
  if (env.APP_ENV === 'prod' || env.DATABASE_ENV_TAG === 'prod') {
    throw new Error(
      [
        'seed refuses to run against prod.',
        `APP_ENV is ${env.APP_ENV} and DATABASE_ENV_TAG is ${env.DATABASE_ENV_TAG}.`,
        'prod holds the 130 real founders. There is no fictional data in it and there is no path from it to anywhere.',
      ].join('\n'),
    );
  }
}

async function seed(): Promise<number> {
  const db = getDb();
  let written = 0;

  for (const person of SEEDS) {
    // The id becomes a path segment, /tmp/ge/<id>/, so it passes the same rule
    // storage/paths.ts refuses folder names with. Checked here rather than
    // discovered on the founder's first turn.
    if (!FOUNDER_ID_RE.test(person.id)) {
      throw new Error(`seed id ${person.id} is not a founder id. 26 characters, Crockford base 32, no I L O or U.`);
    }

    // The wrapped key is made here and nowhere else. It is the reason a founder
    // row cannot be written by hand.
    const { wrapped } = createFounderKey(person.id);

    const inserted = await db
      .insert(founders)
      .values({
        id: person.id,
        email: person.email,
        displayName: person.displayName,
        timezone: SEED_TIMEZONE,
        track: person.track,
        wrappedKey: wrapped,
      })
      // Idempotent, so seeding twice is not an error and does not rewrite a
      // founder's key. Rewriting a key would make every blob they already own
      // undecryptable, which is the worst thing this script could do.
      .onConflictDoNothing({ target: founders.id })
      .returning({ id: founders.id });

    if (inserted.length > 0) written += 1;
    process.stdout.write(
      `${inserted.length > 0 ? 'made   ' : 'already'}  ${person.id}  ${person.email.padEnd(30)}  ${person.track ?? 'no track'}  ${person.why}\n`,
    );
  }
  return written;
}

/**
 * Remove the seeded founders and everything that hangs off them.
 *
 * DEV ONLY, AND ONLY THESE FOUR IDS. Every founder owned table cascades from
 * `founder`, so this is a real delete of real rows, and it is guarded twice: the
 * environment has to be dev on both sides, and the WHERE clause names the four
 * ids in this file rather than anything typed at a prompt.
 */
async function reset(): Promise<number> {
  if (env.APP_ENV !== 'dev' || env.DATABASE_ENV_TAG !== 'dev') {
    throw new Error(
      `--reset only runs in dev. APP_ENV is ${env.APP_ENV} and DATABASE_ENV_TAG is ${env.DATABASE_ENV_TAG}.`,
    );
  }
  const ids = SEEDS.map((s) => s.id);
  const removed = await getDb().delete(founders).where(inArray(founders.id, ids)).returning({ id: founders.id });
  return removed.length;
}

async function main(argv: readonly string[]): Promise<number> {
  refuseInProd();

  if (argv.includes('--reset')) {
    const removed = await reset();
    process.stdout.write(`removed ${String(removed)} seeded founders and everything that hung off them\n`);
    return 0;
  }

  const written = await seed();
  process.stdout.write(
    [
      '',
      `${String(written)} new, ${String(SEEDS.length - written)} already there.`,
      '',
      'To sign one of them in:',
      `  open ${env.APP_BASE_URL}/auth/signin and type the passphrase.`,
      // Sign in is OWNER_PASSPHRASE now, not a mailed link. These two lines changed because
      // the mailer was deleted, not because seeding changed. Seeding 130 fictional founders
      // is itself a leftover from the cohort shape, and retiring this script belongs to
      // whoever owns it.
      '  The passphrase is OWNER_PASSPHRASE, from Replit Secrets or your .env file.',
      '',
      'The track column on the last two is a cache. founder-brain.md is the authority,',
      'so the first Founder Brain a seeded founder runs is what actually forks them.',
      '',
    ].join('\n'),
  );
  return 0;
}

const code = await main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  return 1;
});
await closeDb();
process.exit(code);
