# .state/ghl-accounts.md

## What this file is for

The list of social accounts the founder's GoHighLevel location can post to, kept
on their own machine.

Publishing needs an account id. Asking GoHighLevel for one on every post spends a
call the founder may not have and stalls when the connection is down. Without one
writer this list gets hand edited by whichever skill needed it last, and a founder
ends up publishing to the wrong page under their own name.

It lives at `growth-engine/.state/ghl-accounts.md`.

## The shape is not confirmed yet

The three part row below is the documented shape and it is what the code writes
today. It has not been checked against a real response from GoHighLevel.

Spike section S-03 in `planning/spike-findings.md` records the real
`socialmediaposting_get-account` response. When it lands, this file and
`scripts/cmd/accounts.sh` are corrected from it, together, before the freeze.
Until then, treat the field names here as ours rather than theirs.

## Who writes it

`ge accounts`, and it alone.

- `ge accounts set` replaces the whole list with the rows piped into it.
- `ge accounts clear` takes a backup and then removes the file.

`set` is spelled `write` as well, because that is the name the connect skill was
written against. Same verb.

## Who reads it

| reader | what it takes |
|---|---|
| `ge accounts list` | every row that has exactly three parts |
| the publishing flow | the account id for the platform it is posting to |
| the connect skill | how many accounts were found |

## The format, line by line

A heading, a time, two or three lines of explanation, a blank line, then one row
per account.

```
# Social accounts

stamp 2026-08-27T02:12:56
Times are UTC. Written by ge accounts. Do not hand edit.
One line per account: the account id, the platform, the name. Format: schemas/ghl-accounts.md

acc_1|facebook|Lumen Skin
acc_2|instagram|lumen.skin
```

**The time.** `stamp ` then the moment the list was fetched, in UTC, written year,
month, day, then `T`, then hours, minutes and seconds.

That shape is deliberate. It is not the shape backup files use: that one drops the
colons so it can be a filename, and it cannot be read back as a time. Publishing
has to work out how old this list is in days, so the time here is written in the
shape that parses.

**The line naming this file.** It is written only when this schema is really
inside the plugin. A line pointing at a file nobody can open teaches a founder
that the rest of the file it sits in is decoration too, so when the schema is
absent the shorter sentence is written instead.

**An account row.** Three parts, separated by the `|` character:

```
<account id>|<platform>|<display name>
```

| # | field | what it is |
|---|---|---|
| 1 | account id | what publishing sends. Never empty |
| 2 | platform | which network it is. Never empty |
| 3 | display name | what the founder calls it. A single dash when there is none |

## Allowed values

The account id and the platform come from GoHighLevel, so no list here can be
complete and none is enforced. The two rules that are enforced:

- Neither the id nor the platform may be empty.
- A row has exactly three parts. Two or four is refused, because a row that
  gained or lost a part has shifted every part after it.

An account with no name is recorded as having none, with a single dash. Inventing
a name here would put a made up page name in front of the founder later.

**Nothing that looks like a token gets in.** The account list travels in the same
response as the token that fetched it, so a paste can carry the token with it. Any
line carrying `pit-` in any case is refused, by line number, before it reaches the
file.

## What goes in, and what happens to bad lines

The rows are piped into `ge accounts set`, not typed after it:

```
printf "acc_1|facebook|Lumen Skin\nacc_2|instagram|lumen.skin\n" | ge accounts set
```

Blank lines and lines starting `#` are skipped. Carriage returns are taken off
every line first.

**One bad row refuses the whole write.** A list that is half the accounts is worse
than yesterday's list: the missing page looks like a page that was never
connected. When any line is refused, nothing is written and the cached list is
exactly as it was.

**An empty write is refused too.** No rows at all would look like a location with
no accounts, which is a different thing. Emptying the list on purpose is
`ge accounts clear`, and that is never offered on a recovery line, because a
founder following the arrow out of habit would delete the accounts they still
have.

**Setting replaces everything.** Send every account, not just the new one.

## What is guaranteed

- **A backup before every write and before the clear.** `ge accounts` calls
  `ge snapshot` first, and a backup that fails stops the write.
- **Built whole, then moved into place.** A half written list never sits on disk.
- **Nothing in GoHighLevel is changed by any of this.** This is only the copy kept
  on the founder's machine, and `ge accounts clear` says so out loud.

## What you may safely edit by hand

The file says do not hand edit, and it means it. The whole list is replaced in one
command, and a hand edit is lost the next time the connect skill runs.

Reading it is fine: `ge accounts list` prints the rows.

If a row is wrong, pipe the corrected set back in. That takes a backup, checks
every row, and replaces the file in one move.

## A valid example

```
# Social accounts

stamp 2026-09-14T10:22:04
Times are UTC. Written by ge accounts. Do not hand edit.
One line per account: the account id, the platform, the name. Format: schemas/ghl-accounts.md

acc_1|facebook|Example Ltd
acc_2|instagram|example.ltd
acc_3|linkedin|-
```

The third account has no display name in GoHighLevel, so it is recorded as having
none.

## An invalid example

```
acc_4|linkedin
```

The row has two parts and an account row has three. `ge accounts set` refuses it
by line number and writes nothing at all, so the accounts already cached are
untouched. Written as `acc_4|linkedin|-` it would be accepted.
