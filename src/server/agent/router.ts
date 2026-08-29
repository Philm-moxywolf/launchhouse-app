/**
 * router.ts
 *
 * WHAT: Decides which skill body a run loads. The sidebar and the chat box both
 *       come through here, and nothing else chooses.
 *
 * WHY IT EXISTS: commands/engine2.md today reads "Read founder-brain.md and
 *       check the track field. If track is b2b, use the outreach-b2b skill."
 *       That trusts a model to branch correctly 130 times. Here it is a switch
 *       on a column, so rule 1 is structural rather than hoped for. Two more
 *       things fall out of that. Which skill ran becomes a fact in the log
 *       rather than an inference from the transcript. And a founder can never
 *       be handed the other track's engine, because the other track's rows are
 *       not candidates at any point in this file.
 *
 * CALLED BY: the route layer (POST /api/threads/:id/messages, and the sidebar's
 *       startRun). Never by the model. The model has no way to reach it.
 * READS:  the routing table (RouteCatalogue port) and the founder's track.
 *         WRITES: nothing. It returns a decision and logs it.
 *
 * The confirm step is not politeness. Stage two is a classifier, and a
 * classifier that is wrong once in fifty drops a founder into a 30 piece
 * generation they did not ask for. Every plain language route shows a chip
 * first. A sidebar click does not, because the founder just clicked the thing.
 */

import { matchPhrase } from './phrases.js';
import type { Logger, RouteCatalogue } from './ports.js';
import type { RouteId, RouteRow, Track } from './types.js';

/** Stage two. Returns a route id from the table, or null for "no idea". */
export interface IntentClassifier {
  classify(text: string, candidates: readonly RouteRow[]): Promise<RouteId | null>;
}

export type RouteDecision =
  /** Run it now. The founder asked for this by name or by clicking it. */
  | { readonly kind: 'run'; readonly route: RouteRow }
  /** Ask first. Carries the words to put on the chip. */
  | {
      readonly kind: 'confirm';
      readonly route: RouteRow;
      readonly question: string;
    }
  /** Nothing matched. The chat box handles it as ordinary conversation. */
  | { readonly kind: 'none' }
  /** Refused, with a founder readable reason. */
  | { readonly kind: 'refused'; readonly reason: string };

export interface RouterDeps {
  readonly catalogue: RouteCatalogue;
  readonly log: Logger;
  /** Optional. Without it, stage two never runs and stage one is the whole router. */
  readonly classifier?: IntentClassifier;
}

/**
 * THE FORK. Every engine 2 entry point lands here and it is four lines.
 *
 * It takes a track, not a founder id and not a file, because by the time it is
 * called the track has already been read from founder-brain.md by the facts
 * source. There is no path through this function that reads a model's opinion.
 */
export function engineTwoFor(track: Track): RouteId {
  switch (track) {
    case 'b2b':
      return 'outreach-b2b';
    case 'b2c':
      return 'audience-b2c';
    default: {
      // Unreachable while Track has two members. Left in so that adding a third
      // track fails the build here, where the decision belongs, rather than
      // silently sending a third of the cohort to the B2B engine.
      const never: never = track;
      throw new Error(`no engine 2 for track ${String(never)}`);
    }
  }
}

export class Router {
  constructor(private readonly deps: RouterDeps) {}

  /**
   * What the sidebar renders. Rows for this track only, in build order, with
   * hidden rows left out. The other track's rows are absent, not greyed out. A
   * B2C founder has no idea an Outreach Engine exists.
   */
  visibleRoutes(track: Track): readonly RouteRow[] {
    return this.deps.catalogue
      .all()
      .filter((r) => !r.hidden && r.tracks.includes(track));
  }

  /** A sidebar click. Still checked, because a route id can arrive over HTTP. */
  fromSidebar(track: Track, routeId: RouteId): RouteDecision {
    const route = this.resolve(track, routeId);
    if (route.kind !== 'run') return route;
    this.deps.log.info(
      { routeId: route.route.id, track, via: 'sidebar' },
      'route chosen',
    );
    return route;
  }

  /**
   * Plain language. Stage one is the phrase list and is free. Stage two is one
   * cheap classifier call constrained to the enum, and only runs when stage one
   * found nothing. Either way the founder confirms before anything starts.
   */
  async fromText(track: Track, text: string): Promise<RouteDecision> {
    const candidates = this.visibleRoutes(track);

    const phrase = matchPhrase(text, candidates, track);
    if (phrase) {
      const decision = this.resolve(track, phrase.routeId);
      if (decision.kind !== 'run') return decision;
      this.deps.log.info(
        { routeId: decision.route.id, track, via: 'phrase', phrase: phrase.phrase },
        'route chosen',
      );
      return this.asConfirm(decision.route);
    }

    if (!this.deps.classifier) return { kind: 'none' };

    const guess = await this.deps.classifier.classify(text, candidates);
    if (guess === null) return { kind: 'none' };

    const decision = this.resolve(track, guess);
    if (decision.kind !== 'run') {
      // A classifier that names a route this founder cannot have is a bug in
      // the constraint, not a founder problem. Log it loudly, say nothing.
      this.deps.log.warn({ track, guess }, 'classifier named an unavailable route');
      return { kind: 'none' };
    }
    this.deps.log.info(
      { routeId: decision.route.id, track, via: 'classifier' },
      'route chosen',
    );
    return this.asConfirm(decision.route);
  }

  /**
   * The engine 2 entry point, for the one sidebar row and the one command that
   * mean "the second engine, whichever mine is".
   */
  engineTwo(track: Track): RouteDecision {
    const decision = this.resolve(track, engineTwoFor(track));
    if (decision.kind === 'run') {
      this.deps.log.info(
        { routeId: decision.route.id, track, via: 'engine2-fork' },
        'route chosen',
      );
    }
    return decision;
  }

  /**
   * The one check every entry point goes through. A route not on this track is
   * refused here, which is the second place rule 1 holds after the sidebar
   * filter, and the one that a crafted HTTP request meets.
   */
  private resolve(track: Track, routeId: RouteId): RouteDecision {
    const route = this.deps.catalogue.all().find((r) => r.id === routeId);
    if (!route) {
      this.deps.log.error({ routeId, track }, 'unknown route id');
      return {
        kind: 'refused',
        reason: 'That is not something this app can build. Pick one from the list on the left.',
      };
    }
    if (!route.tracks.includes(track)) {
      // Not "you are not allowed". The founder did nothing wrong and the other
      // track's engine is not a thing they should learn exists.
      this.deps.log.warn({ routeId, track }, 'route refused, wrong track');
      return {
        kind: 'refused',
        reason: 'That one is not part of your track. The list on the left is everything you build.',
      };
    }
    return { kind: 'run', route };
  }

  private asConfirm(route: RouteRow): RouteDecision {
    return {
      kind: 'confirm',
      route,
      question: `Start ${route.label}?`,
    };
  }
}

/**
 * Files a route needs before it can run. Checked by the caller against the
 * live file list, because the router does not read the filesystem or the
 * database. Returns the missing ones, in the order the table names them.
 */
export function missingRequirements(
  route: RouteRow,
  present: readonly string[],
): readonly string[] {
  const have = new Set(present);
  return route.requires.filter((r) => !have.has(r));
}
