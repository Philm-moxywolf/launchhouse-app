#!/bin/sh
# 18-receipt.sh: golden test for ge receipt, the one writer of the setup record.
#
# WHY IT EXISTS: one line of this file decides whether a founder is warned that
#                their GoHighLevel token is about to stop working. If the line is
#                written in a shape nothing can read, the warning never fires,
#                and the first they hear of a dead token is a post that will not
#                send during the event weekend. The other half of the file's job
#                is a refusal: the receipt records that a token exists and the
#                day it was made, never the token, because a secret written here
#                is then in a snapshot, a backup and the next support screenshot.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/18-receipt/   WRITES: tests/.work/<shell>/18-receipt/
# POSTURE:       fail-closed. Every refusal is followed by a byte comparison of
#                the receipt, because a refusal that half wrote a token is the
#                worst outcome this file has.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# For rl_ends. The two token refusals cannot end on a command: only the founder
# knows what they meant to write where the token is, so those two are a bare
# arrow and the rest are commands. Both shapes are asserted by name, so neither
# can drift into the other without somebody saying so.
. "$TESTS/lib/recovery.sh"

t_start 18-receipt

WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"
RECEIPT="$WORKDIR/growth-engine/.state/receipt.md"

# 1. No folder.
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME
sh "$GE" receipt show > "$CASEWORK/nofolder.out" 2>&1
assert_exit 1 $? "ge receipt with no folder exits 1"
assert_raw_equal "$FIX/expect.out/nofolder.txt" "$CASEWORK/nofolder.out" "the no folder refusal"
HOME=$OLDHOME
export HOME

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 2. No verb is a founder asking what this is. It is not an error.
sh "$GE" receipt > "$CASEWORK/usage.out" 2>&1
assert_exit 0 $? "ge receipt with no verb exits 0"
assert_raw_equal "$FIX/expect.out/usage.txt" "$CASEWORK/usage.out" "what ge receipt says it does"

# 3. A verb it does not have.
sh "$GE" receipt fetch > "$CASEWORK/badverb.out" 2>&1
assert_exit 1 $? "a verb ge receipt does not have exits 1"
assert_raw_equal "$FIX/expect.out/badverb.txt" "$CASEWORK/badverb.out" "the unknown verb refusal"

# 4. Nothing has checked the setup yet, so there is nothing to show. The recovery
#    line names the thing that fills it in rather than the command they just ran.
#    It is the bare arrow shape, because the thing that fills it in is a step the
#    founder takes and not a program a shell can run.
sh "$GE" receipt show > "$CASEWORK/noshow.out" 2>&1
assert_exit 1 $? "ge receipt show with no receipt exits 1"
assert_contains "$CASEWORK/noshow.out" '→ take the setup step' "and names what fills it in"
assert_lacks "$CASEWORK/noshow.out" '→ run: /' \
  "and never offers a slash command as a line to paste"

# 5. The first check written. There was no file, so nothing was overwritten and
#    nothing needed backing up.
sh "$GE" receipt set plugin PASS "growth-engine 0.2.0" > "$CASEWORK/first.out" 2>&1
assert_exit 0 $? "ge receipt set exits 0"
assert_raw_equal "$FIX/expect.out/first.txt" "$CASEWORK/first.out" "what it says it recorded"
assert_contains "$RECEIPT" 'plugin PASS growth-engine 0.2.0' "and the line is in the file"
assert_snapshots .state/receipt.md 0 "the first write took no backup, because there was nothing to lose"

# 6. A second check, and the day the token was made. Both are appended, and the
#    write of each one backs up what it is replacing first.
sh "$GE" receipt set ghl PASS "location connected, 4 social accounts" > /dev/null 2>&1
assert_exit 0 $? "a second check exits 0"
# Today, not a fixed day. This used to read 2026-09-14, which was a day in the
# future for most of the life of this suite, and a day in the future is exactly
# what pit-created now refuses: it is how a mistyped year turns the token expiry
# warning off. The fixture is scrubbed, so the day itself never fixes the output.
PITDAY=$(date '+%Y-%m-%d')
sh "$GE" receipt set pit-created "$PITDAY" > "$CASEWORK/pit.out" 2>&1
assert_exit 0 $? "ge receipt set pit-created exits 0"
assert_files_equal "$FIX/expect.out/pit.txt" "$CASEWORK/pit.out" "what it says about the token"
assert_snapshots .state/receipt.md 2 "each write over an existing receipt took a backup first"

# 7. Setting a check that is already there replaces that one line. Nothing else
#    moves, because everything else in the file is somebody's evidence.
sh "$GE" receipt set plugin FAIL "the marketplace entry is missing" > /dev/null 2>&1
assert_exit 0 $? "setting a check again exits 0"
assert_equals 1 "$(grep -c '^plugin ' "$RECEIPT")" "the check has one line, not two"
assert_contains "$RECEIPT" 'plugin FAIL the marketplace entry is missing' "and it is the new one"
assert_contains "$RECEIPT" 'ghl PASS location connected, 4 social accounts' \
  "and the other check is exactly where it was"

sh "$GE" receipt show > "$CASEWORK/show.out" 2>&1
assert_exit 0 $? "ge receipt show exits 0"
assert_files_equal "$FIX/expect.out/show.txt" "$CASEWORK/show.out" "the receipt read back"

cp "$RECEIPT" "$CASEWORK/before-refusals.keep"

# 8. A token. This is the refusal the file exists for, and it is checked on the
#    evidence and on the check name, because a founder pasting a whole response
#    can land it in either.
sh "$GE" receipt set ghl PASS "pit-abc123def456" > "$CASEWORK/token-ev.out" 2>&1
assert_exit 1 $? "evidence that looks like a token exits 1"
assert_contains "$CASEWORK/token-ev.out" 'looks like a GoHighLevel token' "and says why"
assert_contains "$CASEWORK/token-ev.out" 'never the token itself' "and what this file is for"
rl_ends "$CASEWORK/token-ev.out" bare "and it ends on guidance, not on a command to paste"

sh "$GE" receipt set pit-abc123 PASS "connected" > "$CASEWORK/token-name.out" 2>&1
assert_exit 1 $? "a check name that looks like a token exits 1"
rl_ends "$CASEWORK/token-name.out" bare "and it ends on guidance, not on a command to paste"

# 9. A date nobody chose. GNU date reads "last tuesday" happily and hands back a
#    real day, so the shape is checked before the date library ever sees it.
sh "$GE" receipt set pit-created "last tuesday" > "$CASEWORK/date-words.out" 2>&1
assert_exit 1 $? "a date written in words exits 1"
assert_contains "$CASEWORK/date-words.out" 'is not a date this can read' "and says so"
assert_contains "$CASEWORK/date-words.out" '→ run: ge receipt set pit-created' "and shows the shape"

sh "$GE" receipt set pit-created 2026-13-40 > "$CASEWORK/date-real.out" 2>&1
assert_exit 1 $? "a date that is the right shape and not a real day exits 1"
assert_contains "$CASEWORK/date-real.out" 'is not a day on the calendar' "and says which part is wrong"

# A day that is not on the calendar, counted here rather than handed to date.
# BSD date rolls 30 February forward to 2 March and takes it, GNU date refuses
# it, so a receipt written on a Mac would read one way there and another way on
# a founder's Windows machine.
sh "$GE" receipt set pit-created 2026-02-30 > "$CASEWORK/date-feb.out" 2>&1
assert_exit 1 $? "the thirtieth of February exits 1 on both date programs"
assert_contains "$CASEWORK/date-feb.out" 'is not a day on the calendar' "and says so"
sh "$GE" receipt set pit-created 2026-02-29 > "$CASEWORK/date-leap.out" 2>&1
assert_exit 1 $? "and so does 29 February in a year that is not a leap year"

# A day that has not happened yet. One mistyped digit in the year turns the token
# expiry warning off until that year, and the warning is the only thing standing
# between a founder and a dead connection during the event.
sh "$GE" receipt set pit-created 2030-01-01 > "$CASEWORK/date-future.out" 2>&1
assert_exit 1 $? "a day in the future exits 1"
assert_contains "$CASEWORK/date-future.out" 'has not happened yet' "and says why"
assert_contains "$CASEWORK/date-future.out" "→ run: ge receipt set pit-created $PITDAY" \
  "and the way out is today's date, which is a command that runs"

sh "$GE" receipt set pit-created > "$CASEWORK/date-none.out" 2>&1
assert_exit 1 $? "pit-created with no day at all exits 1"
rl_ends "$CASEWORK/date-none.out" run "and it ends on a command, and on nothing else"

# 10. The other refusals: a result the file cannot hold, a check name that is not
#     one word, a check with no result, and evidence that runs to two lines.
sh "$GE" receipt set plugin MAYBE "half working" > "$CASEWORK/status.out" 2>&1
assert_exit 1 $? "a result that is not PASS, FAIL or SKIP exits 1"
assert_contains "$CASEWORK/status.out" 'The three it holds are PASS, FAIL and SKIP.' "and names all three"

sh "$GE" receipt set "two words" PASS "ok" > "$CASEWORK/name.out" 2>&1
assert_exit 1 $? "a check name with a space in it exits 1"
assert_contains "$CASEWORK/name.out" 'is one word' "and says what a check name is"

sh "$GE" receipt set plugin > "$CASEWORK/noresult.out" 2>&1
assert_exit 1 $? "a check with no result exits 1"
assert_contains "$CASEWORK/noresult.out" '→ run: ge receipt set plugin PASS' "and shows the whole command"

sh "$GE" receipt set plugin PASS "first line
second line" > "$CASEWORK/twoline.out" 2>&1
assert_exit 1 $? "evidence on two lines exits 1"
assert_contains "$CASEWORK/twoline.out" 'has to fit on one line' "and says why"

# 11. Not one of those refusals touched the file, and not one of them took a
#     backup either. Nine tries at a token must not push a founder's real
#     evidence out of the ring.
assert_bytes_equal "$CASEWORK/before-refusals.keep" "$RECEIPT" \
  "twelve refusals leave the receipt byte for byte"
assert_snapshots .state/receipt.md 3 "and take no further backups, so the ring still holds only the three real writes"

# 12. The receipt never holds a token, whatever was typed at it.
assert_equals 0 "$(grep -c -i 'pit-' "$RECEIPT")" "there is no token anywhere in the receipt"

# 13. The calendar check is not simply strict. A real leap day is a real day, and
#     a check that refused it would send a founder who made their token on 29
#     February 2024 round in circles. Last, because this one writes.
sh "$GE" receipt set pit-created 2024-02-29 > "$CASEWORK/date-leap-ok.out" 2>&1
assert_exit 0 $? "29 February in a leap year is a day, and it is recorded"
assert_contains "$RECEIPT" 'pit_created 2024-02-29' "and it is the day in the file"

t_done
