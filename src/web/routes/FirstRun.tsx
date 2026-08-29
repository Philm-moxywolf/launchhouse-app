/** @jsxRuntime automatic */
/**
 * src/web/routes/FirstRun.tsx
 *
 * WHAT IT IS
 * One screen with two questions: what to call you, and where you are.
 *
 * WHY IT EXISTS
 * The timezone is the reason. A laptop knew where the founder was and a server does not,
 * and every scheduled post and every date in a 90 day plan depends on it. It is asked here
 * because nothing later can ask it: by the time a schedule is being built, the founder is
 * mid task and a question about time zones is an interruption they will answer wrongly.
 *
 * The zone is confirmed by showing them their own clock rather than the name of the zone. A
 * founder cannot check `America/New_York`. They can check whether it is quarter past four.
 * That one substitution is what makes this question answerable by somebody who has never
 * thought about time zones.
 *
 * It is stored as an IANA name and never as an offset, because offsets change twice a year
 * and a 90 day plan built on 27 September runs into December, past the change on 1
 * November. The list is a list rather than a text box for the same reason a scope is
 * copied rather than typed: a zone name typed by hand is a silent wrong answer.
 *
 * THERE IS NO TRACK QUESTION HERE, AND THAT IS RULE 1. The fork happens once, in the
 * Founder Brain. Asking here would fork it twice, and the two answers would disagree the
 * first time somebody changed their mind. Setup does not know the track and does not need
 * to.
 *
 * WHAT CALLS IT
 * app.tsx, on the `#/start` address, and the Setup rail.
 *
 * WHAT IT READS AND WRITES
 * Reads the founder's first name and the browser's guess at the zone. Writes the name and
 * the zone through saveProfile.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { saveProfile } from "../lib/api.ts";
import type { Founder } from "../lib/api.ts";
import { formatClock, guessTimezone } from "../lib/format.ts";
import { Notice } from "../components/Notice.tsx";
import { Working } from "../components/Working.tsx";

/**
 * The zones a founder picks from.
 *
 * A curated list, not the full IANA database. The cohort is one event in Atlanta, the
 * label is the city rather than the zone name, and every row shows the current time there
 * so the founder is choosing a clock rather than a piece of jargon. A founder whose zone is
 * genuinely missing tells a mentor, which is a conversation we can have 130 times if we
 * have to, and cannot happen silently.
 */
const ZONES: readonly { readonly zone: string; readonly label: string }[] = [
  { zone: "America/New_York", label: "New York, Atlanta, Miami, Toronto" },
  { zone: "America/Chicago", label: "Chicago, Dallas, Houston" },
  { zone: "America/Denver", label: "Denver, Salt Lake City" },
  { zone: "America/Phoenix", label: "Phoenix" },
  { zone: "America/Los_Angeles", label: "Los Angeles, Seattle, Vancouver" },
  { zone: "America/Anchorage", label: "Anchorage" },
  { zone: "Pacific/Honolulu", label: "Honolulu" },
  { zone: "America/Halifax", label: "Halifax" },
  { zone: "America/Mexico_City", label: "Mexico City" },
  { zone: "America/Bogota", label: "Bogota, Lima" },
  { zone: "America/Sao_Paulo", label: "Sao Paulo" },
  { zone: "Europe/London", label: "London, Dublin, Lisbon" },
  { zone: "Europe/Paris", label: "Paris, Berlin, Madrid, Amsterdam" },
  { zone: "Europe/Athens", label: "Athens, Helsinki, Bucharest" },
  { zone: "Africa/Lagos", label: "Lagos" },
  { zone: "Africa/Johannesburg", label: "Johannesburg" },
  { zone: "Africa/Nairobi", label: "Nairobi" },
  { zone: "Asia/Dubai", label: "Dubai" },
  { zone: "Asia/Karachi", label: "Karachi" },
  { zone: "Asia/Kolkata", label: "Mumbai, Delhi, Bengaluru" },
  { zone: "Asia/Singapore", label: "Singapore, Kuala Lumpur" },
  { zone: "Asia/Hong_Kong", label: "Hong Kong" },
  { zone: "Asia/Tokyo", label: "Tokyo" },
  { zone: "Australia/Perth", label: "Perth" },
  { zone: "Australia/Sydney", label: "Sydney, Melbourne" },
  { zone: "Pacific/Auckland", label: "Auckland" },
];

export function FirstRun({
  founder,
  onDone,
}: {
  readonly founder: Founder;
  readonly onDone: () => void;
}): ReactElement {
  const guessed = founder.timezone ?? guessTimezone();
  const known = ZONES.some((z) => z.zone === guessed);
  const [name, setName] = useState(founder.displayName ?? founder.firstName);
  const [zone, setZone] = useState(known ? guessed : "America/New_York");
  const [picking, setPicking] = useState(!known);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const now = new Date();

  const save = (): void => {
    setSaving(true);
    setProblem(null);
    void saveProfile(name.trim(), zone).then((result) => {
      setSaving(false);
      if (result.ok) onDone();
      else setProblem(result.problem.text);
    });
  };

  if (saving) {
    return (
      <div className="page page-narrow">
        <Working what="Saving your answers." />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <h1>Welcome, {founder.firstName}.</h1>
      <p className="lede">Two questions, then you are in. About 30 seconds.</p>

      {problem === null ? null : <Notice tone="problem" lines={[problem]} />}

      <label className="field">
        <span className="field-label">What should we call you?</span>
        <input className="field-input" type="text" value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <div className="field">
        <span className="field-label">Where are you?</span>
        {picking ? (
          <select className="field-input" value={zone} onChange={(event) => setZone(event.target.value)}>
            {ZONES.map((option) => (
              <option key={option.zone} value={option.zone}>
                {option.label}, {formatClock(now, option.zone)}
              </option>
            ))}
          </select>
        ) : (
          <div className="clock-check">
            <p className="clock-time">It is {formatClock(now, zone)} where you are.</p>
            <p className="clock-ask">Is that right?</p>
            <div className="button-row">
              <button type="button" className="button button-quiet" onClick={() => setPicking(true)}>
                No, let me pick
              </button>
            </div>
          </div>
        )}
        <p className="field-note">
          We use this so a time in your plan means the time on your clock, and so a post goes out when you meant it
          to.
        </p>
      </div>

      <button type="button" className="button button-big" onClick={save} disabled={name.trim() === ""}>
        Start
      </button>
    </div>
  );
}
