#!/bin/sh
# 27-doctor-evidence.sh: ge check never passes a leg it did not actually look at.
#
# WHY IT EXISTS: ge check is the line printed at the bottom of nearly every
#                refusal in this toolkit, so it is the last door a founder tries.
#                It used to say PASS index while a file the index listed had been
#                deleted, PASS token while the setup receipt recorded that the
#                token had been rejected, and PASS lint above a count of seven
#                warnings and below the words "Nothing to fix". A doctor that is
#                wrong in that direction is worse than no doctor: the founder
#                stops looking, and finds out at the gate on the Friday rather
#                than on the Monday. Every leg here is put in a state it should
#                report, and then the report is read.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/27-doctor-evidence/
# POSTURE:       fail-closed. A leg that says PASS on evidence it did not read is
#                a failure, and so is a closing summary that disagrees with the
#                lines above it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 27-doctor-evidence

# fresh <name>: a folder the doctor has nothing to say about, so that whatever is
# broken next is the only thing it could be reporting.
fresh() {                               # <name>
  fr="$SANDBOX/$1"
  mkdir -p "$fr" || t_die "the $1 folder could not be made." "df -h ${TMPDIR:-/tmp}"
  HOME=$fr
  export HOME
  cd "$fr" || t_die "the $1 folder is not there." "sh tests/run.sh again"
  GE_T_HOME="$fr/growth-engine"
  sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed in $1." "sh tests/run.sh again"
  sh "$GE" index > /dev/null 2>&1 || t_die "ge index failed in $1." "sh tests/run.sh again"
}

# adds_up <file>: the closing summary against the lines above it. A report that
# counts one number and prints another is how "PASS lint, 7 warnings" and
# "Nothing to fix" came to sit four lines apart.
adds_up() {                             # <output file> <label>
  au_said=$(sed -n 's/^[0-9][0-9]* checks ran\. \([0-9][0-9]*\) failed.*/\1/p' "$1")
  au_seen=$(grep -c '^FAIL' "$1")
  assert_equals "$au_seen" "$au_said" "$2: the count at the end matches the FAIL lines above it"
}

# ---------------------------------------------------------------- the baseline

fresh clean
sh "$GE" check > "$CASEWORK/clean.out" 2>&1
assert_exit 0 $? "a folder with nothing wrong with it passes"
assert_lacks "$CASEWORK/clean.out" 'FAIL' "and nothing in it is reported as broken"
assert_contains "$CASEWORK/clean.out" 'Nothing to fix.' "and it says so"
adds_up "$CASEWORK/clean.out" "the clean folder"

# ------------------------------------------------- a file the index still lists

fresh gone
printf '# Founder brain\n\nTrack: b2b\n' > growth-engine/founder-brain.md
sh "$GE" index > /dev/null 2>&1
assert_contains growth-engine/.state/index.md 'founder-brain.md' "the index lists the Brain"

# The way it really goes: a tidy-up, a rename, or a sync client that moved it.
mv growth-engine/founder-brain.md "$SANDBOX/founder-brain-BACKUP.md" \
  || t_die "the Brain could not be moved aside." "ls -l growth-engine"

sh "$GE" check > "$CASEWORK/gone.out" 2>&1
assert_exit 1 $? "a file the index lists and is not there any more fails the check"
assert_contains "$CASEWORK/gone.out" 'founder-brain.md' "and the report names the file"
assert_lacks "$CASEWORK/gone.out" 'Nothing to fix.' "and it does not end by saying there is nothing to fix"
adds_up "$CASEWORK/gone.out" "the missing file"
assert_equals 0 "$(grep -c '^PASS  index' "$CASEWORK/gone.out")" \
  "and the index leg does not report PASS on a file it did not look for"

# The session summary reads the same index, so it cannot say the gate is done.
sh "$GE" context > "$CASEWORK/gone-context.out" 2>&1
assert_lacks "$CASEWORK/gone-context.out" 'gate A: 1 of 1 file ready' \
  "and the session summary does not call the gate ready with the Brain gone"
assert_contains "$CASEWORK/gone-context.out" 'founder-brain.md' \
  "and it says which file is missing"

# --------------------------------------------------------- no index at all

fresh noindex
rm -f growth-engine/.state/index.md || t_die "the index could not be removed." "ls -l growth-engine/.state"
sh "$GE" check > "$CASEWORK/noindex.out" 2>&1
assert_equals 0 "$(grep -c '^PASS  index' "$CASEWORK/noindex.out")" \
  "with no index at all, the index leg does not report PASS"
adds_up "$CASEWORK/noindex.out" "no index at all"

# ------------------------------------------------- a FAIL recorded in the receipt

fresh receipt
sh "$GE" receipt set plugin PASS "the toolkit answered" > /dev/null 2>&1
sh "$GE" receipt set token FAIL "GoHighLevel rejected it" > /dev/null 2>&1
sh "$GE" receipt set pit-created 2026-08-20 > /dev/null 2>&1
assert_contains growth-engine/.state/receipt.md 'token' "the receipt records the check that failed"

sh "$GE" check > "$CASEWORK/receipt.out" 2>&1
assert_exit 1 $? "a FAIL recorded in the setup receipt fails the check"
assert_contains "$CASEWORK/receipt.out" 'token' "and the report names the check that failed"
assert_lacks "$CASEWORK/receipt.out" 'Nothing to fix.' \
  "and it does not end by saying there is nothing to fix"
assert_equals 0 "$(grep -c '^PASS  receipt' "$CASEWORK/receipt.out")" \
  "and the receipt leg does not report PASS over a recorded failure"
adds_up "$CASEWORK/receipt.out" "the failing receipt"

# ------------------------------------------------------ a token that has expired

fresh token
sh "$GE" receipt set pit-created 2026-01-01 > /dev/null 2>&1
sh "$GE" check > "$CASEWORK/token.out" 2>&1
assert_exit 1 $? "a token past 90 days fails the check"
assert_equals 0 "$(grep -c '^PASS  token' "$CASEWORK/token.out")" \
  "and the token leg does not report PASS on a token that has stopped working"
sh "$GE" context > "$CASEWORK/token-context.out" 2>&1
assert_contains "$CASEWORK/token-context.out" 'stopped' \
  "and the session summary says the same thing rather than the opposite"
adds_up "$CASEWORK/token.out" "the expired token"

# -------------------------------------------------------- warnings left in lint

fresh warnings
# A Brain with the field the whole product forks on set to something that is not
# one of the two values, and a date in the wrong order. Both are things the
# linter has an opinion about, and both used to sit under the words PASS lint.
printf '# Founder brain\n\nTrack: B2B\nLocked: 14/09/2026\n' > growth-engine/founder-brain.md
sh "$GE" index > /dev/null 2>&1
sh "$GE" lint > "$CASEWORK/warn-lint.out" 2>&1
LINT_WARNS=$(grep -c '^WARN' "$CASEWORK/warn-lint.out")
[ "$LINT_WARNS" -gt 0 ] && t_pass || t_fail "the linter had nothing to warn about, so this section proves nothing"

sh "$GE" check > "$CASEWORK/warn-check.out" 2>&1
assert_equals 0 "$(grep -c '^PASS  lint' "$CASEWORK/warn-check.out")" \
  "the lint leg does not report PASS while the linter has warnings"
assert_lacks "$CASEWORK/warn-check.out" 'Nothing to fix.' \
  "and the report does not end by saying there is nothing to fix"
assert_contains "$CASEWORK/warn-check.out" 'ge lint' "and it says where to read them"
adds_up "$CASEWORK/warn-check.out" "the folder with warnings"

# ------------------------------------------------------- the people folder gone

fresh nopeople
rm -rf growth-engine/people || t_die "the people folder could not be removed." "ls -l growth-engine"
sh "$GE" check > "$CASEWORK/nopeople.out" 2>&1
assert_exit 1 $? "a folder with no people folder fails the check"
assert_equals 0 "$(grep -c '^PASS  people' "$CASEWORK/nopeople.out")" \
  "and the people leg does not report PASS on a folder that is not there"
assert_lacks "$CASEWORK/nopeople.out" 'Nothing to fix.' \
  "and it does not end by saying there is nothing to fix"
adds_up "$CASEWORK/nopeople.out" "the missing people folder"

# ------------------------------------------------- the log cut down to nothing

fresh shortlog
sh "$GE" log note "day one, picked the b2b track" > /dev/null 2>&1
sh "$GE" log note "day two, wrote the first five" > /dev/null 2>&1
# Cut by hand, which is what a bad paste or a half-finished sync leaves behind.
# Only the raw size changes, so the leg that reads it has to be reading the mark
# rather than the file's shape.
printf '# Ops log\n' > growth-engine/ops-log.md
sh "$GE" check > "$CASEWORK/shortlog.out" 2>&1
assert_exit 1 $? "an ops log that has been cut fails the check"
assert_equals 0 "$(grep -c '^PASS  log' "$CASEWORK/shortlog.out")" \
  "and the log leg does not report PASS on a log that has lost entries"
adds_up "$CASEWORK/shortlog.out" "the shortened log"

t_done
