# launchhouse-app

The runtime. One Fastify process on a Replit Reserved VM. Founders sign in, talk to the app,
and the nine engines run server side. No terminal, no plugin, no install.

**This repository is private and stays private.** It holds an API key funding 130 people, 130
GoHighLevel tokens, Apollo credentials, and 130 founders' real business data including named
prospects with email addresses. The engine content lives in the public repo and is
vendored into `vendor/`, pinned by commit in `vendor/content-pin.json`. It was a submodule
and is not any more: a founder remixing this into their own Replit account has no GitHub
credential, and a submodule they cannot fetch is an app that does not start. Prose is edited
in the content repo and moved here with `npm run engine:bump -- --to <ref>`. The app never
edits it.

The full specification is `planning/REPLIT-BUILD.md` in the Launchhouse working folder. This
file is how to run what is in this repository. Where the two disagree, the build document
wins and this file is out of date.

---

## Start here: the deployment probe

Before anything else is built, one question has to be answered, and it cannot be answered on
a laptop: how does the deployment container actually behave. `scripts/probe-deployment.ts` is
a tiny app whose only job is to answer it.

```bash
npm install
npm run probe          # then open http://localhost:5000
```

Locally it answers what it can. The five answers that matter come from a real deployment.
`scripts/PROBE.md` is the deploy walkthrough, written for somebody who is not a developer.

Nothing in section 5 of the build document should be written before the probe has run.

---

## What you need

| Thing | Why |
|---|---|
| Node 22 | The Agent SDK ships the Linux CLI binary the agent loop spawns as a per platform optional dependency, and the SDK's reference implementation is the npm package |
| Postgres | The record. Everything else is a cache |
| An Anthropic API key | One key funds the whole cohort, which is why the spend caps are required |
| The content submodule | `git submodule update --init`. Without it there is no `ge`, and `ge` is how every founder file is written |

## Running it locally

```bash
git submodule update --init          # brings in vendor/growth-engine
npm install
cp .env.example .env                 # then fill it in. There are no values in the example
npm run db:migrate
npm run dev                          # API on PORT, default 5000
npm run dev:web                      # the React app, proxied to the API
```

`npm run dev` refuses to start if the environment is not usable, and prints every problem at
once with the variable named. That refusal is the feature. Fixing one variable, restarting,
and finding the next one is four restarts and forty minutes.

## The commands

| Command | What it does |
|---|---|
| `npm run dev` | The server, watched. TZ is pinned to UTC |
| `npm run dev:web` | Vite, serving `src/web`, proxying the API |
| `npm run build` | Typecheck both halves, then build the browser bundle to `dist/web` |
| `npm start` | The server, as the deployment runs it |
| `npm run probe` | The deployment probe. See `scripts/PROBE.md` |
| `npm test` | Every test. One runner. See the note below |
| `npm run typecheck` | Both tsconfigs. Vite does not typecheck, so this is the only thing that does |
| `npm run lint` | The four safety rules, plus ordinary linting |
| `npm run db:generate` | Generate a migration from `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run skills:gen` | Rebuild the typed skill prompt map from `app/content/skills/` |
| `npm run engine:bump` | Move the content submodule pin and print the prose diff |

### One note on tests

There is one test runner: Node's own built in `node:test`, with `node:assert/strict` for the
assertions. There is no test dependency to install and no config file. `npm test` runs the
whole suite in about four seconds, and exits 1 the moment anything in it fails.

This was two runners until 28 August 2026. Ten files imported vitest and the rest imported
`node:test`, so whichever command you ran, the other set failed on the import rather than on
anything real. Reading a red suite that is red for no reason is how a real failure gets
missed. The ten moved to `node:test`, and vitest, `vitest.config.ts` and the `test:vitest`
script went with them.

Two things the vitest config used to do are now written where they belong:

- `--test-timeout=30000` in the `test` script, replacing vitest's `testTimeout`. Node's own
  default is no timeout at all. Some tests spawn a real child process, so a hung one has to end
  as a failure rather than hold the run open for ever. Three tests in `src/server/ge/run.test.ts`
  need longer or shorter and say so themselves, in the form
  `it('...', { timeout: 60_000 }, async () => {`. A per test option wins over the flag.
- The globs in the `test` script name the three folders that hold tests, so nothing walks into
  `vendor/`. The content repo has its own 32 case shell suite and it runs in that repo, not
  this one.

If you are writing a new test, the shape is `import { describe, it } from 'node:test'` and
`import assert from 'node:assert/strict'`. There is no `expect`. `it.each` does not exist
either: write an ordinary `for` loop around the `it`, which keeps one test per case so a
failure still names the case.

## The shape, in one paragraph

The browser holds an SSE stream open and posts messages over an ordinary POST that returns
202 immediately. The agent loop is `query()` from the Agent SDK, which spawns a Claude Code
CLI subprocess with its working directory set to a per founder scratch folder. The model gets
Read, Write, Edit, Glob, Grep, Skill, TodoWrite and our own MCP tools. **The model never gets
Bash.** The server spawns `ge` itself, as a child process, with an argv array, never with
`shell: true`. Postgres is the record. The container filesystem is a cache and is not durable.

Those last two sentences are the two most misread lines in the design. The model having no
shell and the server spawning a shell program are different things, and both hold.

## Why the choices are the way they are

**Reserved VM, not Autoscale.** A turn runs 30 to 180 seconds and Autoscale enforces request
timeouts. SSE connections idle for minutes while a founder types and Autoscale scales to zero
and cuts them. Each live session is a spawned subprocess that wants a stable machine. The
queue and the live session map are in memory, so one VM means one place that state lives. The
reasoning is written out in full in `.replit`, next to the instruction not to hand write the
deployment target key.

**Fastify plus a Vite SPA, one process, not Next.js.** An agent run is a long lived stateful
subprocess holding an open stream. A request scoped server components runtime fights that.

**`tsx`, not a compile step.** `tsc` is the checker and Vite is the only thing that emits.
One less build artefact to go stale, and one less path to be wrong about on the deployment.
The cost is a one off transpile at boot on a process that runs for days.

**TypeScript pinned to 5.9.** typescript-eslint supports TypeScript below 6.1, and lint rules
that stop working are lint rules nobody notices are gone.

**Model ids are required environment variables with no default.** A model id in the source is
a cached table that goes stale silently. Somebody looks the current ids up on the day.

**The three spend caps are required with no default.** A cap with a default is a cap nobody
chose. Real cost per engine is not known until the two demo founder runs, and the founder cap
gets fixed after those, not before.

## The rules that are structure, not prose

Six product rules govern this app. Four of them are enforced by code rather than by asking
nicely, and it is worth knowing where they live before changing anything.

| Rule | Where it lives in the runtime |
|---|---|
| Two tracks, forked once in the Founder Brain | A database column and a server side switch in the router. The other track's rows are absent from the sidebar, not greyed out |
| No Instagram DM automation, ever | Five layers. The scope list on the token, a path allowlist, a build breaking denylist test, a frozen tool registry, and propose and commit |
| B2B outreach is 25 low volume messages, never promise replies | Prose, in the skills. The runtime does not weaken it, and the queue's own copy follows the same discipline: never promise a wait we cannot meet |
| Everything a founder makes is theirs, visible and downloadable | `ge_file` and `ge_file_version` in Postgres, a live file panel, per file download, whole folder ZIP |
| Never invent proof | Prose in the skills, plus a runtime gate that flags a number in generated output which is not in the Brain |
| Voice comes from the founder | Voice samples are files under the founder's own `growth-engine/voice-samples/` |

Four lint rules back this up and they fail in the editor: no `shell: true` anywhere, no
`process.env` outside `src/server/env.ts`, no `fetch` against a vendor outside one function,
and no date formatting inside the GoHighLevel modules outside one file. `eslint.config.js`
explains each one where it is defined.

## Environments

Three, and they never share a database, a bucket or a key.

| Name | What is in it | Who looks at it |
|---|---|---|
| `dev` | Seeded fictional founders only | Whoever is building |
| `preview` | Its own deployment, its own database | The team and the client |
| `prod` | The 130 | Founders |

There is no path from prod to anywhere. There is no restore from prod, ever. Reproducing a
founder's bug means reproducing the shape by hand. That is the mechanism that actually
protects the named prospects, and `scripts/seed.ts` is the only source of demo data.

Outside prod the mailer fails closed against `MAIL_ALLOWLIST`, so a seeded founder with a
plausible address cannot cause a real email to a real person.

Show progress by pointing at preview. Never at prod.

## What is not verified

Nothing in this repository names a GoHighLevel field, an Apollo field, an endpoint path or a
CSV column as fact. The spike has not run. Every unverified shape lives behind
`src/server/integrations/contracts/` and is marked there.

If you need a field name you do not have, do not guess it. Leave it pending and say so.

## House style for anything a founder reads

No em dashes or en dashes. Ranges written as "11 to 13". No marketing language. Short
sentences. Explain jargon inline. Name the reader's doubt first, then answer it. End on an
action.

That applies to every string the app renders and to the skill prose, and the runtime rules
gate enforces the dash rule and the banned word list on generated artifacts before they are
saved. `validate.sh` in the content repo is the same rules at commit time on files a human
wrote. The gate here is the same rules at runtime on files a model wrote, which is where they
now actually matter.
