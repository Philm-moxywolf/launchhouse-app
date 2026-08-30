#!/bin/sh
# 19-accounts.sh: golden test for ge accounts, the cached list of pages to post to.
#
# WHY IT EXISTS: publishing reads an account id out of this file, so a cache that
#                is half the accounts is worse than yesterday's cache: the missing
#                page looks like a page that was never connected, and the founder
#                reconnects something that was already fine. Worse, the account
#                list arrives in the same response as the token that fetched it,
#                so a paste can carry the token into a file that is then in a
#                snapshot, a backup and the next support screenshot.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/19-accounts/   WRITES: tests/.work/<shell>/19-accounts/
# POSTURE:       fail-closed. One bad row refuses the whole write, and every
#                refusal is followed by a byte comparison of the cache.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# For rl_arrow, which tells the two recovery shapes apart. Used once, on the
# arrow this refusal prints above its last line.
. "$TESTS/lib/recovery.sh"

t_start 19-accounts

WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"
CACHE="$WORKDIR/growth-engine/.state/ghl-accounts.md"

# 1. No folder.
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME
sh "$GE" accounts list > "$CASEWORK/nofolder.out" 2>&1
assert_exit 1 $? "ge accounts with no folder exits 1"
assert_raw_equal "$FIX/expect.out/nofolder.txt" "$CASEWORK/nofolder.out" "the no folder refusal"
HOME=$OLDHOME
export HOME

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 2. No verb prints what it does. A founder reaching for this has usually been
#    sent here by a skill and does not know the row shape.
sh "$GE" accounts > "$CASEWORK/usage.out" 2>&1
assert_exit 0 $? "ge accounts with no verb exits 0"
assert_raw_equal "$FIX/expect.out/usage.txt" "$CASEWORK/usage.out" "what ge accounts says it does"
# The shape, with the gaps marked. This used to be held to showing
# acc_1|facebook|Lumen Skin, which reads like somebody's real account and is
# exactly what a founder copies whole and sends. A gap has to look like a gap,
# so it is written in angle brackets and the check says so both ways round.
assert_contains "$CASEWORK/usage.out" '<account id>|<platform>|<name>' \
  "and shows the shape of a row with the parts they fill in marked"
assert_lacks "$CASEWORK/usage.out" 'acc_1|facebook|Lumen Skin' \
  "and never shows a made up account that reads like a real one"

sh "$GE" accounts refresh > "$CASEWORK/badverb.out" 2>&1
assert_exit 1 $? "a verb ge accounts does not have exits 1"
assert_raw_equal "$FIX/expect.out/badverb.txt" "$CASEWORK/badverb.out" "the unknown verb refusal"

# 3. Nothing cached yet.
sh "$GE" accounts list > "$CASEWORK/nocache.out" 2>&1
assert_exit 1 $? "ge accounts list with nothing cached exits 1"
assert_contains "$CASEWORK/nocache.out" '→ take the setup step' "and names what fills it in"

# 4. The write. Comments and blank lines are skipped, because what is piped in
#    is usually pasted, and an account with no name is recorded as having none
#    rather than being given one ge invented.
printf '# the four pages\n\nacc_1|facebook|Lumen Skin\nacc_2|instagram|lumen.skin\nacc_3|facebook|\n' \
  | sh "$GE" accounts set > "$CASEWORK/set.out" 2>&1
assert_exit 0 $? "ge accounts set exits 0"
assert_raw_equal "$FIX/expect.out/set.txt" "$CASEWORK/set.out" "what it says it cached"
assert_snapshots .state/ghl-accounts.md 0 "the first write took no backup, because there was nothing to lose"

sh "$GE" accounts list > "$CASEWORK/list.out" 2>&1
assert_exit 0 $? "ge accounts list exits 0"
assert_raw_equal "$FIX/expect.out/list.txt" "$CASEWORK/list.out" "the accounts read back"
assert_contains "$CASEWORK/list.out" 'acc_3|facebook|-' \
  "an account with no name is a dash, never a name ge made up"
assert_equals 3 "$(grep -c . "$CASEWORK/list.out")" "three accounts, three lines"
assert_contains "$CACHE" 'Do not hand edit.' "the file says who writes it"

cp "$CACHE" "$CASEWORK/before-refusals.keep"

# 5. One bad row refuses the whole write. Half a cache is the failure this is
#    shaped to prevent, so the refusal has to name the line and leave the rest.
printf 'acc_1|facebook|Lumen Skin\njust one field\n' | sh "$GE" accounts set > "$CASEWORK/badrow.out" 2>&1
assert_exit 1 $? "a row that is not an account row exits 1"
assert_raw_equal "$FIX/expect.out/badrow.txt" "$CASEWORK/badrow.out" "the bad row refusal"
assert_contains "$CASEWORK/badrow.out" 'line 2 is not an account row' "it names the line"
assert_contains "$CASEWORK/badrow.out" 'Your cached accounts are exactly as they were.' \
  "and says what did not happen"
# The shape a row has to be is shown, and it is an example rather than a
# command: ge cannot know the founder's own account id. So it is written with
# the gaps in angle brackets, and it must never appear after "→ run: ", which is
# the slot a founder selects and pastes. Stated as the danger rather than as a
# wording, so rewording the sentence cannot leave this passing on nothing.
assert_contains "$CASEWORK/badrow.out" '<account id>|<platform>|<name>' \
  "the refusal shows the shape a row has to be, with the gaps marked"
assert_lacks "$CASEWORK/badrow.out" '→ run: <account id>' \
  "and never offers that shape as a command to paste"
assert_lacks "$CASEWORK/badrow.out" 'acc_1|facebook|Lumen Skin' \
  "and never shows a made up account that reads like a real one"
# Every arrow in the message, whichever line it is on, held to the rule for the
# shape it is. Both recovery cases read the last line of a refusal and stop, so
# without this an arrow anywhere above it could say anything at all.
rl_every_arrow "$CASEWORK/badrow.out" "the bad row refusal"
rl_ends "$CASEWORK/badrow.out" run "and the message ends on a command, and on nothing else"

# 5b. Several bad rows at once, which is what a founder pasting a whole page
#     gets. The refusal names every line it could not read and then ends on one
#     way out for the lot of them, so what is asserted is that every arrow in
#     the message is sound and not how many there are.
printf 'just one field\nalso bad\n|facebook|No Id\nacc_9|nope\n' \
  | sh "$GE" accounts set > "$CASEWORK/badrows.out" 2>&1
assert_exit 1 $? "four rows that cannot be read exits 1"
assert_contains "$CASEWORK/badrows.out" '4 of the lines could not be read' "and it counts them"
assert_contains "$CASEWORK/badrows.out" 'line 3 is missing the account id or the platform' \
  "and names each one by the line it is on"
assert_contains "$CASEWORK/badrows.out" 'line 4 is not an account row' "and the last one too"
rl_every_arrow "$CASEWORK/badrows.out" "the four bad rows refusal"
rl_ends "$CASEWORK/badrows.out" run "and the message ends on a command, and on nothing else"

# 6. A row missing the id or the platform. The name is optional, those two are not.
printf '|facebook|Lumen Skin\n' | sh "$GE" accounts set > "$CASEWORK/noid.out" 2>&1
assert_exit 1 $? "a row with no account id exits 1"
assert_contains "$CASEWORK/noid.out" 'missing the account id or the platform' "and says which part"

# 7. A token in the paste. This is the one that would otherwise end up in a
#    backup, in the ring and in a screenshot.
printf 'pit-abc123def|facebook|Lumen Skin\n' | sh "$GE" accounts set > "$CASEWORK/token.out" 2>&1
assert_exit 1 $? "a line carrying a token exits 1"
assert_contains "$CASEWORK/token.out" 'looks like it carries a GoHighLevel token' "and says so"
assert_contains "$CASEWORK/token.out" 'never a token' "and what this file is for"
# And the refusal does not print the token back. Every other bad row is quoted
# under the line that names it, which is what makes the message readable, and a
# token quoted the same way is a token in the terminal, in the scrollback and in
# whatever screenshot gets sent to a mentor.
assert_lacks "$CASEWORK/token.out" 'pit-abc123def' \
  "and the token itself is never echoed back into the message"
rl_every_arrow "$CASEWORK/token.out" "the token row refusal"

# 8. Nothing piped in at all. An empty write would read as a location with no
#    accounts connected, which is a different thing and would send a founder off
#    to reconnect pages that are fine.
printf '' | sh "$GE" accounts set > "$CASEWORK/empty.out" 2>&1
assert_exit 1 $? "nothing piped in exits 1"
assert_contains "$CASEWORK/empty.out" 'would look like a location with no accounts' "and says why it will not"
assert_contains "$CASEWORK/empty.out" 'ge accounts clear' "and names the command that does mean that"
# The arrow line used to be ge accounts clear. A founder who follows the arrow
# out of habit would then delete the accounts they still have, which is the
# opposite of a way out, so the arrow is the command they meant to type and
# clearing is offered in the sentence above it.
assert_contains "$CASEWORK/empty.out" '→ run: printf' \
  "while the way out is the pipe they meant to type, not the one that deletes"

# 9. Not one of those refusals touched the cache or the ring.
assert_bytes_equal "$CASEWORK/before-refusals.keep" "$CACHE" "four refusals leave the cache byte for byte"
assert_snapshots .state/ghl-accounts.md 0 "and take no backups, because nothing was overwritten"
assert_equals 0 "$(ls -a growth-engine/.state | grep -c 'ghl-accounts.rows')" \
  "and leave no half read row file behind"

# 10. A real second write replaces the whole cache, and backs up what it replaced
#     first. Setting is not adding: the founder is told that in the usage text.
printf 'acc_9|facebook|Northfield\n' | sh "$GE" accounts set > "$CASEWORK/second.out" 2>&1
assert_exit 0 $? "a second write exits 0"
assert_contains "$CASEWORK/second.out" 'Cached 1 account.' "one account reads as one account, not 1 accounts"
assert_snapshots .state/ghl-accounts.md 1 "and it backed up what it replaced first"
sh "$GE" accounts list > "$CASEWORK/list2.out" 2>&1
assert_equals 1 "$(grep -c . "$CASEWORK/list2.out")" "the cache is the new write, whole"

# 11. write is the same verb as set. The connect skill was written against that
#     name, so it has to keep working.
printf 'acc_1|facebook|Lumen Skin\n' | sh "$GE" accounts write > "$CASEWORK/write.out" 2>&1
assert_exit 0 $? "ge accounts write is the same verb as set"
assert_contains "$CASEWORK/write.out" 'Cached 1 account.' "and says the same thing"

# 12. Clearing backs up first, and says plainly that nothing at GoHighLevel moved.
#     A founder who reads "cleared" and thinks their pages were disconnected has
#     been given a fright by their own toolkit.
sh "$GE" accounts clear > "$CASEWORK/clear.out" 2>&1
assert_exit 0 $? "ge accounts clear exits 0"
assert_contains "$CASEWORK/clear.out" 'A backup was taken first.' "and says a backup was taken"
assert_contains "$CASEWORK/clear.out" 'Nothing in GoHighLevel changed.' "and that nothing there moved"
assert_absent "$CACHE" "the cache file is gone"
assert_snapshots .state/ghl-accounts.md 3 "and every state it held is still in the ring"

sh "$GE" accounts clear > "$CASEWORK/clear2.out" 2>&1
assert_exit 0 $? "clearing an empty cache exits 0"
assert_contains "$CASEWORK/clear2.out" 'nothing changed' "and says nothing changed"
assert_snapshots .state/ghl-accounts.md 3 "and takes no backup of a file that is not there"

t_done
