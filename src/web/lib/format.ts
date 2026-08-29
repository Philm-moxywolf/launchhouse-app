/**
 * src/web/lib/format.ts
 *
 * WHAT IT IS
 * Every number, date and file name the founder reads, turned into words. Pure functions.
 *
 * WHY IT EXISTS
 * The founder is not technical, and that is the entire reason this app exists. `4184` is a
 * number a developer reads without noticing. `founder-brain.md` is a file name a developer
 * reads without noticing. Neither is what somebody who has never opened a terminal reads,
 * and a screen full of them teaches a founder that this is not for them. So: plain names
 * where a plain name will do, sizes in the units a person uses, and dates that say today
 * when they mean today.
 *
 * The queue notice is here too, and it is the one string in the app that is most likely to
 * cost a session. 130 people in a room, and "mine is stuck" is the support message that
 * eats an hour. A founder waiting gets a number, immediately, and a realistic time. Never a
 * spinner, and never a promise we cannot meet.
 *
 * WHAT CALLS IT
 * The Files list, the queued notice, the first run screen, and the thread transcript.
 *
 * WHAT IT READS AND WRITES
 * Nothing. `Intl` does the timezone work, so there is no date library in the browser bundle
 * and no offset arithmetic anywhere.
 */

/**
 * The plain name of a file.
 *
 * The file name is still shown, in smaller type, because a founder downloading a folder
 * onto a laptop needs to recognise it there. What changes is which of the two is read
 * first.
 */
const PLAIN_NAMES: Readonly<Record<string, string>> = {
  "founder-brain.md": "Your Founder Brain",
  "content-30.md": "Your 30 pieces",
  "content-30.csv": "Your 30 pieces, as an upload sheet",
  "rss-feeds.md": "Your source list",
  "outreach-sequence.md": "Your outreach sequence",
  "outreach-firstlines.csv": "Your first lines, as a sheet",
  "dm-openers.md": "Your openers",
  "hook-bank.md": "Your hook bank",
  "inbound-scripts.md": "Your inbound scripts",
  "ops-workflow.md": "Your workflow",
  "90-day-plan.md": "Your 90 day plan",
  "playbook-insert.md": "Your playbook insert",
  "ledger.md": "Your approval ledger",
  "memory.md": "What we have remembered",
  "ops-log.md": "Your work log",
  "people/": "Your people",
  "index.md": "The index of your folder",
};

export function plainFileName(name: string): string {
  const known = PLAIN_NAMES[name];
  if (known !== undefined) return known;
  const base = name.replace(/\/$/, "").split("/").pop() ?? name;
  const stem = base.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  if (stem === "") return name;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/**
 * True when two file names mean the same file.
 *
 * `people/` is a row in the index and a trailing slash does not survive a round trip
 * through an address bar. Comparing the two forms in one function stops a founder clicking
 * their own people folder and being told it does not exist.
 */
export function sameFileName(a: string, b: string): boolean {
  const strip = (s: string): string => s.replace(/\/+$/, "").toLowerCase();
  return strip(a) === strip(b);
}

/**
 * A size in the units a person uses.
 *
 * Bytes below a kilobyte, because "0.004 KB" reads as nothing at all and an empty file is
 * exactly the thing the founder needs to notice.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${Math.round(bytes)} bytes`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

/** "12 Sep". The year is added only when it is not the year we are in. */
export function formatDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  const day = d.getDate();
  const month = MONTHS[d.getMonth()] ?? "";
  return sameYear ? `${day} ${month}` : `${day} ${month} ${d.getFullYear()}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * The founder's own clock, as they would read it off a wall.
 *
 * Section 6: a founder cannot check `America/New_York`, but they can check whether it is
 * quarter past four. This is what the timezone question shows them, and getting it wrong is
 * how a 90 day plan schedules a post at 4am.
 */
export function formatClock(at: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    })
      .format(at)
      .replace(/\s?([ap])m/i, (_m, p: string) => ` ${p.toLowerCase()}m`);
  } catch {
    // An unknown zone name must not blank the screen. The founder can still pick another.
    return "";
  }
}

/** The zone the browser believes it is in. The founder confirms it by reading their clock. */
export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

/** "today at 4:12 pm", "yesterday", "12 Sep". Changed today is the thing worth saying. */
export function formatWhen(iso: string | null, timezone: string | null, now: Date = new Date()): string {
  if (iso === null) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const zone = timezone ?? guessTimezone();
  const dayOf = (x: Date): string => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: zone === "" ? undefined : zone }).format(x);
    } catch {
      return x.toISOString().slice(0, 10);
    }
  };
  const today = dayOf(now);
  const then = dayOf(d);
  if (then === today) {
    const clock = zone === "" ? "" : formatClock(d, zone);
    return clock === "" ? "today" : `today at ${clock}`;
  }
  const yesterday = dayOf(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (then === yesterday) return "yesterday";
  return formatDay(iso, now);
}

/** "1st", "2nd", "7th", "11th", "21st". */
export function ordinal(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "";
  const i = Math.floor(n);
  const rem100 = i % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${i}th`;
  switch (i % 10) {
    case 1:
      return `${i}st`;
    case 2:
      return `${i}nd`;
    case 3:
      return `${i}rd`;
    default:
      return `${i}th`;
  }
}

/**
 * What a founder waiting in the queue reads.
 *
 * The number comes first because the number is the thing that stops the support message.
 * The time is hedged, always, because we do not know how long the queue in front of them
 * will take and a wait we promise and miss is worse than one we describe honestly. That is
 * the same discipline as never promising replies.
 */
export function queuedNotice(position: number): readonly string[] {
  const place = ordinal(position);
  const first = place === "" ? "You are in the queue." : `You are ${place} in line.`;
  if (position <= 9) {
    return [first, "This usually clears in about a minute.", "Leave this page open, or come back later. Your place is held."];
  }
  if (position <= 24) {
    return [first, "This usually takes a few minutes.", "Leave this page open, or come back later. Your place is held."];
  }
  return [
    first,
    "A lot of people started at the same moment, so this one will take a while.",
    "Go and do something else and come back in ten minutes. Your place is held and nothing is lost.",
  ];
}
