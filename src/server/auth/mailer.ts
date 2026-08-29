/**
 * src/server/auth/mailer.ts
 *
 * WHAT THIS IS. The two mail transports the app has, and the allowlist that
 * sits in front of both of them outside prod.
 *
 * WHY IT EXISTS. Mechanism three of the four that keep founder data out of dev
 * and preview: the mailer fails closed. `scripts/seed.ts` generates fictional
 * founders, and a fictional founder can plausibly carry a real address, either
 * because somebody typed one to test with or because a seed generator picked a
 * domain that exists. Outside prod, a recipient that is not on MAIL_ALLOWLIST
 * throws. It does not warn and continue, because a warning nobody reads is the
 * same as no check at all.
 *
 * WHY SMTP IS A HARD FAILURE TODAY. There is no SMTP client in this app's
 * dependencies, and inventing one would mean guessing at a wire protocol
 * nobody here has run against the real server. A prod deployment that cannot
 * send mail is one nobody can sign in to, so the failure is at boot, naming the
 * variable, rather than at the first founder pressing the button. env.ts
 * already refuses `MAIL_TRANSPORT=log` in prod, so the two checks together mean
 * prod cannot start until this is wired.
 *
 * WHAT CALLS IT. src/server/index.ts builds one and hands it to the auth
 * plugin. ./magic-link.ts is the only caller of send().
 *
 * WHAT IT READS. Its config, passed in. Never process.env.
 * WHAT IT WRITES. The log, in the log transport. Nothing else.
 */

import type { Logger, Mailer, OutboundMail } from './types.ts';

export interface MailerConfig {
  readonly transport: 'log' | 'smtp';
  readonly from: string;
  readonly appEnv: 'dev' | 'preview' | 'prod';
  /** Lower case addresses that may receive mail outside prod. Ignored in prod. */
  readonly allowlist: readonly string[];
  readonly smtpUrl: string | undefined;
}

export class MailRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MailRefused';
    this.code = code;
  }
}

/**
 * The allowlist gate, on its own so it can be tested without a transport and so
 * both transports are covered by one rule rather than two copies of it.
 */
export function allowedRecipient(cfg: MailerConfig, to: string): boolean {
  if (cfg.appEnv === 'prod') return true;
  return cfg.allowlist.includes(to.trim().toLowerCase());
}

/**
 * Build the mailer this environment is allowed to have.
 *
 * Throws at construction rather than at send for an unwired transport. That
 * puts the failure in the boot report next to the variable that caused it,
 * which is the difference between a deploy that refuses to start and a founder
 * pressing a button that does nothing.
 */
export function createMailer(cfg: MailerConfig, log: Logger): Mailer {
  if (cfg.transport === 'smtp') {
    if (cfg.smtpUrl === undefined || cfg.smtpUrl.length === 0) {
      throw new MailRefused('smtp_url_missing', 'MAIL_TRANSPORT is smtp and SMTP_URL is not set.');
    }
    throw new MailRefused(
      'smtp_not_wired',
      'MAIL_TRANSPORT is smtp, and this build has no SMTP client. Sign in is a magic link, so a deployment that cannot send mail is one nobody can sign in to. Wire a transport here before deploying with MAIL_TRANSPORT=smtp.',
    );
  }
  return new LogMailer(cfg, log);
}

/**
 * The dev and preview transport. Prints the message where whoever is running
 * the app can read it, including the link, so a laptop with no mail server can
 * still complete a sign in end to end.
 *
 * env.ts refuses this transport in prod, so the link never reaches a production
 * log line.
 */
export class LogMailer implements Mailer {
  constructor(
    private readonly cfg: MailerConfig,
    private readonly log: Logger,
  ) {}

  send(message: OutboundMail): Promise<void> {
    if (!allowedRecipient(this.cfg, message.to)) {
      throw new MailRefused(
        'not_on_allowlist',
        `Refusing to send to ${message.to}. Outside prod the mailer only sends to MAIL_ALLOWLIST, so a seeded founder cannot cause a real email to a real person.`,
      );
    }
    // The body carries a live sign in link. That is the point of this transport
    // and it is why env.ts will not allow it in prod.
    this.log.info(
      { to: message.to, from: this.cfg.from, subject: message.subject, body: message.text },
      'mail, log transport',
    );
    return Promise.resolve();
  }
}

/** Collects instead of sending. Tests read what a founder would have received. */
export class CollectingMailer implements Mailer {
  readonly sent: OutboundMail[] = [];

  constructor(private readonly cfg?: MailerConfig) {}

  send(message: OutboundMail): Promise<void> {
    if (this.cfg && !allowedRecipient(this.cfg, message.to)) {
      throw new MailRefused('not_on_allowlist', `Refusing to send to ${message.to}.`);
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  last(): OutboundMail | undefined {
    return this.sent[this.sent.length - 1];
  }
}
