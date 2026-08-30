#!/bin/sh
# 15-context.sh: golden test for ge context, the lines a session opens with.
#
# WHY IT EXISTS: this is the one subcommand a hook runs unattended, so it can
#                never be the reason a session will not start. No folder has to
#                be silence and exit 0, not an error a founder has to get past
#                before they can type anything. It is also the only place a
#                founder is told they are working in the wrong folder before
#                they have written a session's work into it.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/15-context/   WRITES: tests/.work/<shell>/15-context/
# POSTURE:       fail-open, and that is what is being asserted. Every path that
#                could stop a session starting is driven and has to exit 0.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 15-context

WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"

# 1. No folder anywhere. A hook gets silence and 0: it runs before the founder
#    has typed anything, having no folder yet is the normal state before ge init
#    rather than a fault, and a refusal here would sit in front of every session
#    they ever start.
#
#    A person who typed the command gets an answer. This case used to hold that
#    both were silent, on the same reasoning, and that was wrong for the typed
#    form: ge help sells ge context as the summary a session opens with, so a
#    blank line and success reads as "nothing to report" rather than "I could
#    not find your work".
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME
sh "$GE" context > "$CASEWORK/nofolder.out" 2>&1
assert_exit 0 $? "ge context with no folder exits 0"
assert_contains "$CASEWORK/nofolder.out" 'No growth-engine folder was found' \
  "and says it could not find one"
assert_contains "$CASEWORK/nofolder.out" '→ run: ge init' "and names what makes one"
sh "$GE" context --hook > "$CASEWORK/nofolder-hook.out" 2>&1
assert_exit 0 $? "ge context --hook with no folder exits 0"
assert_equals 0 "$(wc -c < "$CASEWORK/nofolder-hook.out" | tr -d ' ')" "and says nothing at all"
HOME=$OLDHOME
export HOME

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 2. A folder and nothing in it yet. One line, and it is the folder, because
#    that is the thing a founder most needs to be right.
sh "$GE" context > "$CASEWORK/bare.out" 2>&1
assert_exit 0 $? "ge context on a new folder exits 0"
assert_contains "$CASEWORK/bare.out" "Working folder: $WORKDIR/growth-engine" \
  "and names the folder it found"

# 3. A folder with work in it. The whole summary, word for word.
{
  printf '# Founder brain\n\n'
  printf 'Track: b2b\n'
  printf 'Locked: 2026-09-01\n\n'
  printf '## Flags\n\n'
  printf 'Anything here is something to come back to.\n\n'
  printf -- '- no proof yet, so write from observation\n'
  printf -- '- [x] the list is bought and cleaned\n'
} > growth-engine/founder-brain.md
sh "$GE" remember decision "b2b track, my buyers are agencies" > /dev/null 2>&1
sh "$GE" remember thread "waiting on the list from Juan" > /dev/null 2>&1
sh "$GE" index > /dev/null 2>&1
sh "$GE" context > "$CASEWORK/full.out" 2>&1
assert_exit 0 $? "ge context on a working folder exits 0"
assert_files_equal "$FIX/expect.out/full.txt" "$CASEWORK/full.out" "the summary a session opens with"

# 4. The template sentence under the Flags heading is guidance, not a flag, and
#    a ticked flag is one that has been dealt with. Surfacing either would train
#    founders to skip the line that matters.
assert_equals 1 "$(grep -c '^Flag: ' "$CASEWORK/full.out")" "one flag, not the sentence and not the ticked one"

# 5. A hook passes what the harness gives it, which is not always what ge takes.
#    Typed by a person it is a mistake worth naming. Passed by a hook it must
#    never stop the session.
sh "$GE" context --hook > "$CASEWORK/hook.out" 2>&1
assert_exit 0 $? "ge context --hook exits 0"
assert_bytes_equal "$CASEWORK/full.out" "$CASEWORK/hook.out" "and prints the same bytes as ge context"

sh "$GE" context nonsense > "$CASEWORK/args.out" 2>&1
assert_exit 1 $? "ge context with an argument exits 1"
assert_raw_equal "$FIX/expect.out/args.txt" "$CASEWORK/args.out" "the argument refusal"

sh "$GE" context --hook nonsense > "$CASEWORK/hook-args.out" 2>&1
assert_exit 0 $? "ge context --hook with an argument it does not know still exits 0"
assert_bytes_equal "$CASEWORK/full.out" "$CASEWORK/hook-args.out" \
  "and still prints the summary, so a hook cannot wedge the session"

# 6. An ageing token. The warning is two lines and the second is the way to fix
#    it, because a warning with no fix is a thing a founder learns to scroll past.
#
#    Past 90 days the token has already stopped. This case used to hold the
#    sentence "Nothing is broken yet, they stop working at 90" for a token 2400
#    days old, which is the opposite of the truth and is the line a founder reads
#    at the start of every session. It is held here only for the window it is
#    true in, and the past tense is held for past 90.
sh "$GE" receipt set pit-created 2020-01-01 > /dev/null 2>&1
sh "$GE" context > "$CASEWORK/token.out" 2>&1
assert_exit 0 $? "ge context with an old token exits 0"
assert_contains "$CASEWORK/token.out" 'Your GoHighLevel token is' "the token warning is there"
assert_contains "$CASEWORK/token.out" 'so this one has stopped' "and says it has already stopped"
assert_lacks "$CASEWORK/token.out" 'Nothing is broken yet' \
  "and does not tell the founder a dead token is fine"
assert_contains "$CASEWORK/token.out" '→ take the doctor step' "and names what makes a new one"

# 6b. A failure the setup checks recorded against the token. The receipt is the
#     one place that verdict was ever written down, and until now the only place
#     it was ever shown was ge receipt show, which ge help does not list.
sh "$GE" receipt set token FAIL "GoHighLevel rejected it" > /dev/null 2>&1
sh "$GE" context > "$CASEWORK/token-fail.out" 2>&1
assert_exit 0 $? "ge context with a recorded token failure exits 0"
assert_contains "$CASEWORK/token-fail.out" 'recorded the GoHighLevel token as failing' \
  "the recorded verdict is read and said"
sh "$GE" receipt set token PASS "location connected" > /dev/null 2>&1

# 6c. A day that has not happened yet is a mistyped year, and while it stands the
#     90 day warning can never fire. Made by hand, because ge receipt refuses to
#     write it, which is also how a founder reaches it: by opening the file.
sed 's/^pit_created .*/pit_created 2099-01-01/' growth-engine/.state/receipt.md \
  > "$CASEWORK/receipt.edited"
cp "$CASEWORK/receipt.edited" growth-engine/.state/receipt.md
sh "$GE" context > "$CASEWORK/token-future.out" 2>&1
assert_exit 0 $? "ge context with a token date in the future exits 0"
assert_contains "$CASEWORK/token-future.out" 'which has not happened yet' "and says so"
assert_contains "$CASEWORK/token-future.out" '→ run: ge receipt set pit-created' \
  "and names what corrects it"
rm -f growth-engine/.state/receipt.md

# 6d. A file the index counts as written that is not in the folder any more. The
#     count used to include it, so a founder whose Brain a sync client took away
#     opened a session and was told the gate was complete.
mv growth-engine/founder-brain.md "$CASEWORK/brain.keep"
sh "$GE" context > "$CASEWORK/gone.out" 2>&1
assert_exit 0 $? "ge context with a counted file missing exits 0"
assert_contains "$CASEWORK/gone.out" 'gate A: 0 of 1 file written' "the file is not counted as written"
assert_contains "$CASEWORK/gone.out" 'founder-brain.md is counted as written' "and it is named"
assert_contains "$CASEWORK/gone.out" '→ run: ge check' "and the doctor is named as the next step"
cp "$CASEWORK/brain.keep" growth-engine/founder-brain.md
sh "$GE" index > /dev/null 2>&1

# 7. Never more than fifteen lines, and never a flag dropped without saying so.
#    A summary that runs off the top of the screen is a summary nobody reads.
{
  printf '# Founder brain\n\n## Flags\n\n'
  i=1
  while [ "$i" -le 9 ]; do
    printf -- '- flag number %s\n' "$i"
    i=$((i + 1))
  done
} > growth-engine/founder-brain.md
sh "$GE" index > /dev/null 2>&1
sh "$GE" context > "$CASEWORK/many.out" 2>&1
assert_exit 0 $? "ge context with nine flags exits 0"
assert_equals 6 "$(grep -c '^Flag: flag number' "$CASEWORK/many.out")" "six flags are shown"
assert_contains "$CASEWORK/many.out" 'Flag: and 3 more in founder-brain.md' \
  "and the three it did not show are counted rather than dropped"
lines=$(grep -c '' "$CASEWORK/many.out")
[ "$lines" -le 15 ] && t_pass || t_fail "the summary is $lines lines, and fifteen is the ceiling"

# 8. The wrong folder. A founder working in a copy of their folder loses the
#    session's work into it, and this line is the only thing that says so before
#    they start rather than after.
cp growth-engine/.state/HOME "$CASEWORK/anchor.keep"
printf '%s\n' "$SANDBOX/somewhere-else/growth-engine" > growth-engine/.state/HOME
sh "$GE" context > "$CASEWORK/moved.out" 2>&1
assert_exit 0 $? "ge context on a folder whose anchor moved still exits 0"
assert_contains "$CASEWORK/moved.out" 'Wrong folder.' "and says so first"
assert_contains "$CASEWORK/moved.out" '→ run: ge check' "and names what shows both paths"
cp "$CASEWORK/anchor.keep" growth-engine/.state/HOME

# 9. Two folders. Both are named so the founder can see which one holds their
#    work. The fix named is the shared one every other verb prints, because it is
#    the only move that always clears this. It used to say to run ge check from
#    inside the folder they wanted, which is where they were already standing, so
#    the same lines came back every session for ever.
#
#    Typed, this exits 1, and that is the whole point of the change. It prints a
#    FAIL banner, and a FAIL banner over an exit 0 is a refusal that the shell
#    reports as a success: a skill reading the status carries on into the folder
#    ge has just said it cannot pick, which is how a founder's work ends up split
#    across two of them. The banner and the status now agree.
#
#    The hook is the exception, and it is asserted on its own two lines below.
#    A hook runs before the founder has typed anything and must never be the
#    reason a session will not start, so it says the same words and keeps its 0.
cp -R "$WORKDIR/growth-engine" "$SANDBOX/growth-engine" || \
  t_die "the second folder could not be made." "sh tests/run.sh again"
printf '%s\n' "$SANDBOX/growth-engine" > "$SANDBOX/growth-engine/.state/HOME"
sh "$GE" context > "$CASEWORK/two.out" 2>&1
assert_exit 1 $? "ge context typed, with two folders, exits 1 so the status matches the banner"
assert_contains "$CASEWORK/two.out" 'more than one growth-engine folder' "and says so"
assert_contains "$CASEWORK/two.out" "$WORKDIR/growth-engine" "naming the first"
assert_contains "$CASEWORK/two.out" "$SANDBOX/growth-engine" "and the second"
assert_contains "$CASEWORK/two.out" '→ run: mv ' "and names the rename that clears it"
sh "$GE" context --hook > "$CASEWORK/two-hook.out" 2>&1
assert_exit 0 $? "and a hook in the same state still exits 0"

t_done
