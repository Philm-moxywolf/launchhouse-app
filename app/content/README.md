# app/content

The product's words. Not founder-facing itself: this file is for whoever maintains the app.

The nine skill bodies are the product. Everything else in this repository is delivery.

## What is here

| Path | What it is | Edited by hand? |
|---|---|---|
| `skills/` | The nine ported skill bodies | Only with an allowlist row |
| `skill-allowlist.ts` | Every authorised difference from the public repo | Yes, on purpose |
| `skill-diff.ts` | The diff and the check that runs it | Yes |
| `content-pin.ts` | Holds `vendor/growth-engine/` to the commit `vendor/content-pin.json` names | Yes |
| `routes.ts` | The routing table, and the only place Track and Model become a route name | Yes |
| `gates.md` | Byte for byte copy of `plugins/growth-engine/schemas/gates.md` | No |
| `gates-parse.ts` | Turns `gates.md` into data | Yes |
| `gates.ts` | Generated from `gates.md` | **No.** Regenerate it |
| `gen-gates.ts` | The generator | Yes |
| `scopes.ts` | The seven GoHighLevel scopes, and the three that were cut | Yes |
| `ghl-walk.ts` | Every string in the token walk | Yes. This is where the copy is edited |

## Where the content comes from

The public content repo, `Philm-moxywolf/Atlanta`, is copied into `vendor/growth-engine/` as ordinary committed files. It used to be a git submodule. It is not any more, and the difference matters: a founder who forks this app or remixes it on Replit gets the content with the code, and needs no access to a second repository. A submodule is a pointer, and a pointer to a private repo is an empty folder and a stalled Monday morning.

What holds the copy honest is `vendor/content-pin.json`. It records the commit and every file's git blob hash, which are the same numbers git stores, so anyone can check the copy against the public repo with `git ls-tree -r <commit>`.

**Vendored files are never edited here.** Editing one is how a changed skill body could be made to agree with a changed original and pass the diff test. `app/content/content-pin.test.ts` fails on any edit to any of them.

## Where prose is edited

Skill bodies are edited in the public content repo and nowhere else. That repo is the review surface. This one is private and holds 130 founders' business data, so it is not where a sentence gets reviewed.

To change a skill body:

1. Edit it in the content repo. Run `./scripts/validate.sh` there. Commit and tag.
2. Bring it in here. This is the only supported way, and it prints what moved before it moves it:

   ```
   npm run engine:bump -- --to <ref> --from <a checkout of the content repo>
   ```

3. Run the diff test. It fails, naming the line that changed.
4. Copy the change into `skills/`, and if the app's copy has to differ from the original, add a row to `PORT_ALLOWLIST` with the group and the reason.
5. Run `npm run skills:gen`, or every founder gets yesterday's prose from a map that claims to be today's.

A row that matches nothing also fails, so an allowlist rule cannot outlive the change it was written for.

## Where copy is edited

`ghl-walk.ts` is the token walk, which is the hardest thing a non-technical founder does in this programme. Change the strings there and nothing else. Every screen names the doubt first, answers it, and ends on one action, and the tests check the shape of that.

## Running the tests

```
npm test
```

There is nothing to check out or initialise first. The content is in the repository.

The diff can no longer be aimed at another copy of the content. `GE_CONTENT_ROOT` used to do that, and it is gone: a diff test that an environment variable can point somewhere else is not a diff test.

To check the copy on its own, without running everything:

```
npm run engine:bump -- --verify
```

It names every vendored file that is missing, changed, or should never have been copied in, and exits non-zero if there are any.

## Running the ge golden suite

Thirty six cases against the engine itself. It is the only tested thing in the content repo, and it runs from here:

```
cd vendor/growth-engine && ./tests/run.sh
```

It writes to `vendor/growth-engine/tests/.work/`, which is a sandbox rebuilt on every run and ignored by git.

## Regenerating gates.ts

```
npx tsx app/content/gen-gates.ts
```

Run it after any change to `gates.md`. `app/tests/gates.test.ts` fails if you forget.

## What is deliberately not decided here

Three things are marked pending and must stay marked until a spike result lands.

- Whether a real GoHighLevel token starts with `pit-`. Inferred from our own `receipt.sh:110`, never checked against a real one.
- The name of the contacts read on step 6 of the token walk. Not known at all.
- What "real content" means for a file-backed gate item. `gates.md:68` requires that a nearly empty file is called out and sets no threshold.
