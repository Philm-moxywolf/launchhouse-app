# app/content

The product's words. Not founder-facing itself: this file is for whoever maintains the app.

The nine skill bodies are the product. Everything else in this repository is delivery.

## What is here

| Path | What it is | Edited by hand? |
|---|---|---|
| `skills/` | The nine ported skill bodies | Only with an allowlist row |
| `skill-allowlist.ts` | Every authorised difference from the public repo | Yes, on purpose |
| `skill-diff.ts` | The diff and the check that runs it | Yes |
| `routes.ts` | The routing table, and the only place Track and Model become a route name | Yes |
| `gates.md` | Byte for byte copy of `plugins/growth-engine/schemas/gates.md` | No |
| `gates-parse.ts` | Turns `gates.md` into data | Yes |
| `gates.ts` | Generated from `gates.md` | **No.** Regenerate it |
| `gen-gates.ts` | The generator | Yes |
| `scopes.ts` | The seven GoHighLevel scopes, and the three that were cut | Yes |
| `ghl-walk.ts` | Every string in the token walk | Yes. This is where the copy is edited |

## Where prose is edited

Skill bodies are edited in the public content repo, `Philm-moxywolf/Atlanta`, and nowhere else. That repo is the review surface. This one is private and holds 130 founders' business data, so it is not where a sentence gets reviewed.

To change a skill body:

1. Edit it in the content repo. Run `./scripts/validate.sh` there.
2. Tag the content repo and move the submodule pin here.
3. Run the diff test. It fails, naming the line that changed.
4. Copy the change into `skills/`, and if the app's copy has to differ from the original, add a row to `PORT_ALLOWLIST` with the group and the reason.

A row that matches nothing also fails, so an allowlist rule cannot outlive the change it was written for.

## Where copy is edited

`ghl-walk.ts` is the token walk, which is the hardest thing a non-technical founder does in this programme. Change the strings there and nothing else. Every screen names the doubt first, answers it, and ends on one action, and the tests check the shape of that.

## Running the tests

```
npm test
```

Before the submodule is checked out, point the diff at a local content repo:

```
GE_CONTENT_ROOT=../Atlanta npm test
```

That override is refused when `CI` is set, because the pinned submodule is the version that actually ships.

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
