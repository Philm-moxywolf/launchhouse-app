#!/bin/sh
# 14-check.sh: golden test for ge check, the doctor a founder is sent to.
#
# WHY IT EXISTS: every recovery line in this toolkit ends up pointing here, so
#                this is the last page between a founder and giving up. Two ways
#                it fails are worse than not having it. A leg that reports from
#                no evidence, which is a green tick over a check that never ran.
#                And a leg that says a thing is fine when it is not, which is how
#                a folder whose anchor has moved passes a doctor and then loses a
#                session's work into a folder nobody opens again.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/14-check/   WRITES: tests/.work/<shell>/14-check/
# POSTURE:       fail-closed. Every leg is asserted by name, so a leg that stops
#                running is a failure rather than one fewer line in a report
#                nobody counts.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# The doctor is the one report that prints several ways out at once, one per leg
# that has something to say. This is where they are read: every arrow in the
# report, not only the last one, and the way out of the shortened log is run
# here the way a founder runs it.
. "$TESTS/lib/recovery.sh"

t_start 14-check

# The folder goes one level down, so the folder beside it can be a place with no
# growth-engine folder anywhere above it. ge walks up from where it is run and
# reads HOME as well, so "nowhere" has to be built on purpose.
WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"

# 1. No folder at all. This is a founder running the doctor before they have run
#    anything else, which happens on the first morning of every cohort.
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME
sh "$GE" check > "$CASEWORK/nofolder.out" 2>&1
assert_exit 1 $? "ge check with no folder anywhere exits 1"
assert_raw_equal "$FIX/expect.out/nofolder.txt" "$CASEWORK/nofolder.out" "the no folder refusal"
assert_contains "$CASEWORK/nofolder.out" '→ run: ge init' "and it names the command that fixes it"
HOME=$OLDHOME
export HOME

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 2. The index gone. This case used to reach that state by running the doctor
#    straight after ge init, which is the founder's first two commands, and it
#    held that a failure there was correct. It was not: a folder ge had just
#    made was reported broken to somebody who had done nothing wrong. ge init
#    now builds the index, so the state has to be made on purpose, and what is
#    held here is what it was always for. One leg fails and names the command
#    that builds it, and the other legs still run: a doctor that stops at the
#    first fault tells the founder one thing and hides the rest.
rm -f growth-engine/.state/index.md
sh "$GE" check > "$CASEWORK/noindex.out" 2>&1
assert_exit 1 $? "ge check with no index exits 1"
assert_contains "$CASEWORK/noindex.out" 'FAIL  index' "the index leg fails"
assert_contains "$CASEWORK/noindex.out" '→ run: ge index' "and names the command that builds it"
assert_contains "$CASEWORK/noindex.out" 'PASS  anchor' "the anchor leg still ran"
assert_contains "$CASEWORK/noindex.out" '9 checks ran. 1 failed.' "all nine legs ran, one failed"

# 3. The happy path. Every leg by name, because a leg that quietly stops running
#    takes its own evidence with it and nothing else would notice.
sh "$GE" index > /dev/null 2>&1 || t_die "ge index failed inside the sandbox." "sh tests/run.sh again"
sh "$GE" check > "$CASEWORK/clean.out" 2>&1
assert_exit 0 $? "ge check on a folder with nothing wrong exits 0"
assert_contains "$CASEWORK/clean.out" 'Your Launchhouse folder, checked' "the report opens with its heading"
assert_contains "$CASEWORK/clean.out" 'PASS  anchor' "the anchor leg passes"
assert_contains "$CASEWORK/clean.out" "$WORKDIR/growth-engine" "and the anchor leg names the folder"
assert_contains "$CASEWORK/clean.out" 'PASS  write' "the write leg passes"
assert_contains "$CASEWORK/clean.out" 'PASS  index' "the index leg passes"
assert_contains "$CASEWORK/clean.out" 'PASS  people' "the people leg passes"
assert_contains "$CASEWORK/clean.out" 'PASS  lint' "the lint leg passes"
assert_contains "$CASEWORK/clean.out" 'PASS  snapshots' "the snapshots leg passes"
assert_contains "$CASEWORK/clean.out" 'SKIP  log' "the log leg is skipped until there is a mark"
assert_contains "$CASEWORK/clean.out" 'SKIP  receipt' "the receipt leg is skipped until there is a receipt"
assert_contains "$CASEWORK/clean.out" 'SKIP  token' "the token leg is skipped until there is a token date"
assert_contains "$CASEWORK/clean.out" '9 checks ran. 0 failed.' "nine legs ran and none failed"
assert_contains "$CASEWORK/clean.out" 'Nothing to fix.' "and it says so in plain words"

# 4. The write probe is cleaned up after itself. A file named after a process id
#    left in the founder's folder is a file they will find in a fortnight and
#    have no way to place. Its name is never printed either: it is ge's own
#    working file, it carries a process id, and it is gone by the time anybody
#    reads the line, so a founder shown it has been handed nothing they can use.
assert_equals 0 "$(ls -a growth-engine | grep -c 'ge-write-probe')" \
  "the write probe left nothing behind"
assert_equals 0 "$(ls -a growth-engine/.state/snapshots | grep -c 'ge-ring-probe')" \
  "and neither did the ring probe"
assert_lacks "$CASEWORK/clean.out" 'ge-write-probe' "and the report never names the write probe"
assert_lacks "$CASEWORK/clean.out" 'ge-ring-probe' "nor the ring probe"

# 4b. A probe left behind by an earlier run is swept by the next one. The name
#     carries the process id of the run that made it, so nothing else would ever
#     go back for it and it would sit in the folder the founder opens daily.
printf 'left over\n' > growth-engine/.ge-write-probe.999999
printf 'left over\n' > growth-engine/.state/snapshots/.ge-ring-probe.999999
sh "$GE" check > /dev/null 2>&1
assert_absent growth-engine/.ge-write-probe.999999 "an old write probe is swept up"
assert_absent growth-engine/.state/snapshots/.ge-ring-probe.999999 "and so is an old ring probe"

# 5. The ring leg counts what is really there, from the same listing the ring is
#    filled by. It once said there were no backups while backups sat in the folder.
sh "$GE" remember decision "b2b track, my buyers are agencies" > /dev/null 2>&1
sh "$GE" index > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/ring.out" 2>&1
assert_snapshots memory.md 1 "there is one backup in the ring"
assert_contains "$CASEWORK/ring.out" '1 backup of 1 file' "and the doctor counts it, in words that read"

# 6. The log leg reads the file and the mark, and prints both numbers.
sh "$GE" log note "checked the log" > /dev/null 2>&1
sh "$GE" index > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/log.out" 2>&1
log_bytes=$(wc -c < growth-engine/ops-log.md | tr -d ' ')
assert_contains "$CASEWORK/log.out" "ops-log.md is $log_bytes bytes" \
  "the log leg names the size the file really is"
assert_contains "$CASEWORK/log.out" "never below the $log_bytes it was marked at" \
  "and the mark it is being held against"

# 7. A shortened log. An append only file that got smaller is the one fault here
#    that cannot be put right afterwards, so it has to be seen the day it happens.
#
#    WHAT THIS CHECK USED TO DEMAND, AND WHY IT WAS THE DANGEROUS ONE.
#    It held the report to ending on "→ run: ge restore ops-log.md". ge only
#    adds to the ops log, so on almost every folder there is no backup of it and
#    that line came back refusing, run after run. Where there IS one it is worse
#    than useless here: the backup is older than the file, so putting it back
#    throws away every entry written since, which is the loss the leg exists to
#    report. check.sh says so in its own comment where the carriage return
#    branch is: a mark from an older build read as a shortened log, the answer
#    was a restore, and the restore destroyed the entries in between. A test
#    that demands that line is a test that would push somebody into it.
#
#    So the state is built with no backup of the log, which is the state 130
#    founders will be in, and what is asserted is what ge can honestly do: say
#    the words cannot be put back, say to put your own copy there first, and
#    then mark the size the file is now so the fault is not reported for ever
#    over a log the founder trimmed themselves. Nothing here is thrown away.
cp growth-engine/ops-log.md "$CASEWORK/log.keep"
head -n 2 "$CASEWORK/log.keep" > growth-engine/ops-log.md
cp growth-engine/ops-log.md "$CASEWORK/log.short.keep"
assert_snapshots ops-log.md 0 "there is no backup of the ops log, which is the usual state"
sh "$GE" check > "$CASEWORK/short.out" 2>&1
assert_exit 1 $? "a shortened ops log fails the doctor"
assert_contains "$CASEWORK/short.out" 'so the log has been shortened' "and it says what happened"
assert_contains "$CASEWORK/short.out" 'it keeps no backup of it to put back' \
  "and says plainly that ge cannot put the words back"
assert_contains "$CASEWORK/short.out" 'If you have a copy of your own, put it there first.' \
  "and names the one thing that can, before offering the line that settles for less"
# The negative, and it is the point of this block. A report that named a restore
# here would be handing a founder the command that destroys what is left.
assert_lacks "$CASEWORK/short.out" 'ge restore ops-log.md' \
  "and never names the restore, which would throw away what is still in the file"

# Every way out on the page, held to the rule for the shape it is. The doctor is
# the one thing in this toolkit that prints several at once, one beside each leg
# with something to say, and both recovery cases read the last line of a message
# and stop. On a report the last line is a sentence, not an arrow, so until now
# every arrow the doctor has ever printed was read by nothing at all.
rl_every_arrow "$CASEWORK/short.out" "the report on a shortened log"

# And the way out of THIS leg, run exactly as it was printed, with a ge on PATH,
# because that is what a founder does with it. Taken from beside the leg by name
# rather than off the bottom of the page: the doctor is a report, so the line a
# founder acts on sits next to the fault it belongs to.
rl_setup "$SANDBOX/.ge-bin"
short_fix=$(awk 'seen && index($0, "→") { print; exit } /^FAIL  log / { seen = 1 }' \
  "$CASEWORK/short.out")
rl_command_ok "$short_fix" "the shortened log leg"
rl_exec "$RL_AFTER" /dev/null
assert_exit 0 "$RL_RC" "the way out the shortened log leg prints runs"
sh "$GE" check > "$CASEWORK/short-again.out" 2>&1
assert_lacks "$CASEWORK/short-again.out" 'so the log has been shortened' \
  "and running it clears the fault rather than printing it again"
assert_contains "$CASEWORK/short-again.out" 'PASS  log' "the log leg passes afterwards"
# And it cleared it by adding, never by replacing. What was left in the file is
# still the first bytes of the file, so the way out cost the founder nothing.
# This is the whole difference between the line ge prints and the one this case
# used to demand.
short_b=$(wc -c < "$CASEWORK/log.short.keep" | tr -d ' ')
head -c "$short_b" growth-engine/ops-log.md > "$CASEWORK/log.head" 2>/dev/null
assert_bytes_equal "$CASEWORK/log.short.keep" "$CASEWORK/log.head" \
  "and what was still in the log is still the start of it, byte for byte"
cp "$CASEWORK/log.keep" growth-engine/ops-log.md

# 8. The anchor moved. This is a folder that was copied or synced somewhere else,
#    and it is the failure the whole anchor idea exists for.
cp growth-engine/.state/HOME "$CASEWORK/anchor.keep"
printf '%s\n' "$SANDBOX/somewhere-else/growth-engine" > growth-engine/.state/HOME
sh "$GE" check > "$CASEWORK/moved.out" 2>&1
assert_exit 1 $? "a folder whose anchor points elsewhere fails the doctor"
assert_contains "$CASEWORK/moved.out" 'FAIL  anchor' "the anchor leg fails"
assert_contains "$CASEWORK/moved.out" "$SANDBOX/somewhere-else/growth-engine" \
  "and the report names the path the folder says it is at"
assert_contains "$CASEWORK/moved.out" "$WORKDIR/growth-engine" "and the path it is really at"
assert_contains "$CASEWORK/moved.out" '→ run: ge init' "and names what re-anchors it"
cp "$CASEWORK/anchor.keep" growth-engine/.state/HOME

# 9. An argument. ge check takes none, and a founder who types one is usually
#    part way through a different command.
sh "$GE" check nonsense > "$CASEWORK/args.out" 2>&1
assert_exit 1 $? "ge check with an argument exits 1"
assert_raw_equal "$FIX/expect.out/args.txt" "$CASEWORK/args.out" "the argument refusal"

# 10. The doctor changed nothing while it ran. Every leg above ran against the
#     same files, and the ring is still holding the one backup it started with.
sh "$GE" index > /dev/null 2>&1
sh "$GE" check > /dev/null 2>&1
assert_snapshots memory.md 1 "the doctor takes no backups of its own"
assert_bytes_equal "$CASEWORK/log.keep" growth-engine/ops-log.md "and writes nothing to the ops log"

# 11. An index older than a file the founder has just written. Every ge log, ge
#     remember, ge person and ge ledger puts the folder in this state, so this is
#     what a folder somebody is working in looks like. It used to be reported as
#     a failure, which made red the resting colour of a healthy folder and taught
#     founders to skip the whole report. It is worth saying and it is not a fault.
sh "$GE" log note "wrote something" > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/aged.out" 2>&1
assert_exit 0 $? "a folder written to since the last ge index still exits 0"
assert_contains "$CASEWORK/aged.out" 'NOTE  index' "the index leg says so without calling it a fault"
assert_contains "$CASEWORK/aged.out" '→ run: ge index' "and names what refreshes it"
assert_contains "$CASEWORK/aged.out" '0 failed, 1 to look at.' "the count separates the two"
assert_lacks "$CASEWORK/aged.out" 'Nothing to fix.' \
  "and the last line does not contradict the line above it"
sh "$GE" index > /dev/null 2>&1

# 12. A file the index counts that is not in the folder any more. This is the
#     dangerous direction: a sync client or a tidy-up takes the Brain away, the
#     index still calls it done, and the session summary counts the gate as
#     written. Every leg used to stay green.
printf '# Founder brain\n\nTrack: b2b\n' > growth-engine/founder-brain.md
sh "$GE" index > /dev/null 2>&1
mv growth-engine/founder-brain.md "$CASEWORK/brain.keep"
sh "$GE" check > "$CASEWORK/gone.out" 2>&1
assert_exit 1 $? "an indexed file that is not there fails the doctor"
assert_contains "$CASEWORK/gone.out" 'FAIL  index' "the index leg fails"
assert_contains "$CASEWORK/gone.out" 'founder-brain.md' "and names the file that went"
# The way back, and it has to be one that works. This asked for ge restore
# founder-brain.md, and there is no backup of founder-brain.md in this folder:
# it was written by hand above and never snapshotted, so ge restore would refuse
# and leave the founder reading the doctor, running the line, and reading the
# doctor again. ge index is the command that ends this state when there is
# nothing to put back, and it is what a leg that asks before it names one gives.
assert_contains "$CASEWORK/gone.out" '→ run: ge index' "and names a way back that works"
assert_contains "$CASEWORK/gone.out" 'no backup of founder-brain.md' \
  "and says why it is not offering to put the file back"
cp "$CASEWORK/brain.keep" growth-engine/founder-brain.md
sh "$GE" index > /dev/null 2>&1

# 13. The people folder. Every ge person verb refuses without it, so a doctor
#     that does not look at it calls a folder healthy that cannot hold a single
#     prospect. Both shapes of the fault: gone, and replaced by a file.
mv growth-engine/people "$CASEWORK/people.keep"
sh "$GE" check > "$CASEWORK/nopeople.out" 2>&1
assert_exit 1 $? "a missing people folder fails the doctor"
assert_contains "$CASEWORK/nopeople.out" 'FAIL  people' "the people leg fails"
assert_contains "$CASEWORK/nopeople.out" '→ run: ge init' "and names what puts it back"
printf 'not a folder\n' > growth-engine/people
sh "$GE" check > "$CASEWORK/filepeople.out" 2>&1
assert_exit 1 $? "people as a file fails the doctor too"
assert_contains "$CASEWORK/filepeople.out" 'FAIL  people' "and says so on the people leg"
rm -f growth-engine/people
cp -R "$CASEWORK/people.keep" growth-engine/people
sh "$GE" index > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/people-back.out" 2>&1
assert_contains "$CASEWORK/people-back.out" 'PASS  people' "and it passes once the folder is back"

# 14. Structural warnings. Lint is warn-only by design, so a warning is not a
#     failure. It is not a pass either: this leg used to read PASS with seven
#     warnings in its own evidence, and the report ended two lines later on
#     "Nothing to fix".
printf 'notes I made in a hurry\n' > growth-engine/people/scratch.md
sh "$GE" index > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/warn.out" 2>&1
assert_exit 0 $? "structural warnings do not fail the doctor"
assert_contains "$CASEWORK/warn.out" 'NOTE  lint' "the lint leg reports them without calling them faults"
assert_contains "$CASEWORK/warn.out" '→ run: ge lint' "and names what lists them"
assert_lacks "$CASEWORK/warn.out" 'Nothing to fix.' "and does not then say there is nothing to fix"
rm -f growth-engine/people/scratch.md
sh "$GE" index > /dev/null 2>&1

# 15. The setup receipt. It records PASS, FAIL or SKIP for every check the setup
#     skill ran, and nothing anywhere read those words: a receipt saying the
#     GoHighLevel token had been rejected sat beside a report calling the token
#     good for another three months.
sh "$GE" receipt set token FAIL "GoHighLevel rejected it" > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/receipt.out" 2>&1
assert_exit 1 $? "a recorded failure in the receipt fails the doctor"
assert_contains "$CASEWORK/receipt.out" 'FAIL  receipt' "the receipt leg fails"
assert_contains "$CASEWORK/receipt.out" 'token' "and names the check that failed"
sh "$GE" receipt set token PASS "location connected" > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/receipt-ok.out" 2>&1
assert_contains "$CASEWORK/receipt-ok.out" 'PASS  receipt' "and passes once the record says so"

# 16. The token date. A day in the future is a mistyped year, and it holds the
#     90 day warning off for as long as it stands. It used to be a pass reading
#     "-1223 days ago", which is a lie and a number that means nothing. ge
#     receipt refuses that date now, so the state is made by hand, which is how
#     a founder reaches it: by opening the file.
sh "$GE" receipt set pit-created 2026-01-02 > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/tokenold.out" 2>&1
assert_contains "$CASEWORK/tokenold.out" 'FAIL  token' "a token past 90 days fails the doctor"
assert_contains "$CASEWORK/tokenold.out" 'stopped working on' "and says it has already stopped"
sed 's/^pit_created .*/pit_created 2099-01-01/' growth-engine/.state/receipt.md \
  > "$CASEWORK/receipt.edited"
cp "$CASEWORK/receipt.edited" growth-engine/.state/receipt.md
sh "$GE" check > "$CASEWORK/future.out" 2>&1
assert_exit 1 $? "a token date in the future fails the doctor"
assert_contains "$CASEWORK/future.out" 'which has not happened yet' "and says what is wrong with it"
assert_contains "$CASEWORK/future.out" '→ run: ge receipt set pit-created' "and names what corrects it"
assert_lacks "$CASEWORK/future.out" 'days ago' "and no age at all is printed from a date it cannot count from"

t_done
