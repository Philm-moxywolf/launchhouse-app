/**
 * src/server/integrations/contracts/pending.ts
 *
 * WHAT THIS IS
 *   A hole that throws. `pending(spike, note)` stands in for a vendor detail
 *   nobody has verified, and any attempt to read it fails immediately, naming the
 *   spike section that would settle it.
 *
 * WHY IT EXISTS
 *   The GoHighLevel and Apollo spikes have never run. `spike-findings.md` still
 *   says "Status: not started". So every endpoint, header name, field name, status
 *   code and CSV column in this product is unverified, and there are two ways to
 *   write a file under that condition.
 *
 *   The first is to put in a plausible value and a TODO. That value then looks like
 *   knowledge. It gets copied into a screen, read out to a founder, printed in a
 *   playbook, and the day the spike runs it turns out to be wrong in a way nobody
 *   can trace, because by then four files agree with each other.
 *
 *   The second is this. A contract file reads honestly, with holes rather than
 *   guesses, and the hole is louder than a wrong value: it throws on first touch
 *   and the message says which spike would fill it in. There is no placeholder
 *   path anywhere in this directory, deliberately. Inventing one would be the first
 *   kind of writing wearing the clothes of the second.
 *
 *   THE FAILURE THIS PREVENTS IS 130 FOUNDERS AT 10PM. They tick a list of
 *   permissions three weeks before the event, from a screen we wrote. If one string
 *   on that screen is a guess that reads as a fact, the token comes out short a
 *   permission and the failure surfaces in session 3, with the founder mid task and
 *   no way to add a permission to a token that already exists.
 *
 * WHAT CALLS IT
 *   Every file in this directory. Nothing outside it, because nothing outside it
 *   holds a vendor detail.
 *
 * READS   nothing.
 * WRITES  nothing. It throws.
 */

/**
 * The marker the `get` trap answers instead of throwing.
 *
 * A proxy that threw on genuinely every access could not be asked whether it is a
 * hole, and then the boot check could not find one. One symbol, answered, and every
 * real property still throws. `Symbol.for` rather than a fresh symbol so that two
 * copies of this module loaded under different paths still recognise each other.
 */
const PENDING = Symbol.for('launchhouse.contract.pending');

export interface PendingDetail {
  /** The spike section that would settle it, for example "S-02". */
  readonly spike: string;
  /** What is actually missing, in a sentence. */
  readonly note: string;
}

/** Reading a hole. Names the spike, and names what was being read at the time. */
export class PendingContractError extends Error {
  readonly code = 'contract_pending';
  readonly spike: string;
  readonly note: string;
  /** The property somebody tried to read. Usually the whole story. */
  readonly accessed: string;

  constructor(detail: PendingDetail, accessed: string) {
    super(
      [
        `This vendor detail has not been verified, so there is nothing to read: ${accessed}.`,
        `What is missing: ${detail.note}`,
        `What would settle it: spike ${detail.spike}.`,
        'Do not fill this in from documentation, memory or a plausible guess. Run the spike, write down what came back, and replace the hole with the answer.',
      ].join('\n'),
    );
    this.name = 'PendingContractError';
    this.spike = detail.spike;
    this.note = detail.note;
    this.accessed = accessed;
  }
}

/**
 * A stand in for a vendor detail nobody has checked.
 *
 * Typed as whatever the call site says it will eventually be, so the rest of the
 * code can be written against the real shape and typechecked today. That is the
 * point: the shape is ours to decide and the values are the vendor's to tell us.
 *
 * The target is a function so that a pending call site fails the same way a pending
 * value does. `pending<() => string>(...)()` throws, rather than failing with
 * "is not a function" and sending somebody looking in the wrong place.
 */
export function pending<T>(spike: string, note: string): T {
  const detail: PendingDetail = { spike, note };
  const target = function pendingContract(): never {
    throw new PendingContractError(detail, 'it was called');
  };

  return new Proxy(target, {
    get(_target, property) {
      if (property === PENDING) return detail;
      // Throws on the read itself rather than returning something that throws
      // later. A hole that hands back a value and fails one line further on sends
      // whoever hits it looking in the wrong file.
      throw new PendingContractError(detail, `reading .${String(property)}`);
    },
    apply() {
      throw new PendingContractError(detail, 'it was called');
    },
    has(_target, property) {
      return property === PENDING;
    },
    ownKeys() {
      throw new PendingContractError(detail, 'its keys were listed');
    },
  }) as T;
}

/**
 * The detail behind a hole, or null when the value is a real one.
 *
 * This is what makes the boot check possible: walk a contract, ask each entry, and
 * refuse to start if a feature that is switched on depends on one that answers.
 */
export function isPending(value: unknown): PendingDetail | null {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return null;
  const detail = (value as Record<symbol, unknown>)[PENDING];
  if (detail === undefined) return null;
  return detail as PendingDetail;
}

/** Every hole in one contract object, named. Used by the boot check and the tests. */
export function pendingEntries(
  contract: Readonly<Record<string, unknown>>,
): Array<{ entry: string; spike: string; note: string }> {
  const out: Array<{ entry: string; spike: string; note: string }> = [];
  for (const [entry, value] of Object.entries(contract)) {
    const detail = isPending(value);
    if (detail !== null) out.push({ entry, spike: detail.spike, note: detail.note });
  }
  return out;
}
