#!/bin/sh
# 17-lint.sh: golden test for ge lint, which reports and never changes anything.
#
# WHY IT EXISTS: lint is the only thing that says a marker pair is broken before
#                the founder tries to write into it and gets a refusal they
#                cannot place. Two promises hold it up. It never blocks anyone:
#                a warning is a reading, not a fault, so it exits 0 whatever it
#                finds. And it never writes: the moment a reporter starts tidying
#                files it becomes another thing that can lose work, and nobody
#                would run it before a session again.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/17-lint/   WRITES: tests/.work/<shell>/17-lint/
# POSTURE:       fail-closed on the test. Every founder file is held byte for
#                byte across the whole run, because "it only reports" is the
#                claim this case exists to prove.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 17-lint

WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"

# 1. No folder.
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME
sh "$GE" lint > "$CASEWORK/nofolder.out" 2>&1
assert_exit 1 $? "ge lint with no folder exits 1"
assert_raw_equal "$FIX/expect.out/nofolder.txt" "$CASEWORK/nofolder.out" "the no folder refusal"
HOME=$OLDHOME
export HOME

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 2. A folder ge itself made has nothing wrong with it. If this ever warns, the
#    first thing 130 founders see after ge init is a complaint about a file they
#    have not touched.
sh "$GE" lint > "$CASEWORK/clean.out" 2>&1
assert_exit 0 $? "ge lint on a folder ge just made exits 0"
assert_raw_equal "$FIX/expect.out/clean.txt" "$CASEWORK/clean.out" "the clean report"
sh "$GE" lint --strict > /dev/null 2>&1
assert_exit 0 $? "and --strict on a clean folder exits 0 too"

# Every founder file, held aside. Nothing below may change any of them.
mkdir -p "$CASEWORK/keep"
for f in memory.md ops-log.md ledger.md; do
  cp "growth-engine/$f" "$CASEWORK/keep/$f" || t_die "growth-engine/$f is not there." "sh tests/run.sh again"
done

# 3. A marker pair broken the way a founder breaks it: they deleted a line they
#    did not understand. The warning names the file, the line, and the exact text
#    to put back, because "the block is malformed" is not something anyone can act on.
awk '!/GE:WORKED:END/' growth-engine/memory.md > "$CASEWORK/damaged" \
  || t_die "the damaged memory.md could not be prepared." "sh tests/run.sh again"
cp "$CASEWORK/damaged" growth-engine/memory.md
cp growth-engine/memory.md "$CASEWORK/keep/memory.md"

sh "$GE" lint > "$CASEWORK/broken.out" 2>&1
assert_exit 0 $? "a broken marker pair still exits 0, because lint never blocks anyone"
assert_contains "$CASEWORK/broken.out" 'the GE:WORKED block starts and never ends' \
  "the warning says what is wrong"
assert_contains "$CASEWORK/broken.out" 'growth-engine/memory.md line ' \
  "and names the file and the line it is on"
assert_contains "$CASEWORK/broken.out" '<!-- GE:WORKED:END -->' \
  "and the exact line to put back"
# A recovery line, in whichever of the two shapes fits the fault. This asked for
# "  → run: " and only that, which is the old reading and the wrong one here:
# where the founder's section stops is the one thing ge cannot work out, so lint
# prints the bare arrow and an instruction rather than a command nobody can
# paste. Both halves are checked, so neither shape can go missing.
assert_contains "$CASEWORK/broken.out" '  → ' "and every warning carries a recovery line"
assert_lacks "$CASEWORK/broken.out" '  → run: ' \
  "and a fault only the founder can settle is not dressed up as a command to paste"
assert_contains "$CASEWORK/broken.out" 'One thing to look at. Nothing was changed: lint only reports.' \
  "and the count reads as one thing, not 1 things"

# 4. --strict is for the build harness, and it is the only way lint exits 1 on a
#    warning. A founder never sees this.
sh "$GE" lint --strict > /dev/null 2>&1
assert_exit 1 $? "ge lint --strict exits 1 once there is something to report"

# 5. Two warnings read as two, and the count line agrees with the warnings above it.
printf '\n<!-- GE:ANGLES:START -->\n' >> growth-engine/memory.md
cp growth-engine/memory.md "$CASEWORK/keep/memory.md"
sh "$GE" lint > "$CASEWORK/two.out" 2>&1
assert_exit 0 $? "two faults still exit 0"
warns=$(grep -c '^WARN ' "$CASEWORK/two.out")
assert_contains "$CASEWORK/two.out" "$warns things to look at. Nothing was changed: lint only reports." \
  "the count line agrees with the number of warnings above it"
assert_equals "$warns" "$(grep -c '  → ' "$CASEWORK/two.out")" \
  "and every warning has exactly one recovery line"

# 6. --root, for a harness running lint over a folder it is not standing in.
cd "$SANDBOX" || t_die "the sandbox is not there." "sh tests/run.sh again"
sh "$GE" lint --root "$WORKDIR" > "$CASEWORK/root.out" 2>&1
assert_exit 0 $? "ge lint --root reads a folder it is not standing in"
assert_bytes_equal "$CASEWORK/two.out" "$CASEWORK/root.out" "and reports exactly the same thing"
sh "$GE" lint --root "$SANDBOX/nothing-here" > "$CASEWORK/badroot.out" 2>&1
assert_exit 1 $? "ge lint --root at a folder with no growth-engine in it exits 1"
assert_contains "$CASEWORK/badroot.out" '→ run: ge init' "and names what makes one"
sh "$GE" lint --root > "$CASEWORK/noroot.out" 2>&1
assert_exit 1 $? "ge lint --root with no folder after it exits 1"
assert_contains "$CASEWORK/noroot.out" '→ run: ge lint --root' "and says what it wanted"
sh "$GE" lint --nope > "$CASEWORK/badflag.out" 2>&1
assert_exit 1 $? "a flag ge lint does not have exits 1"
assert_raw_equal "$FIX/expect.out/badflag.txt" "$CASEWORK/badflag.out" "the unknown flag refusal"

# 7. Nothing was written, all the way through. This is the promise in the file's
#    own header, and it is the only reason a founder runs it on a bad morning.
cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
for f in memory.md ops-log.md ledger.md; do
  assert_bytes_equal "$CASEWORK/keep/$f" "growth-engine/$f" "ge lint left $f byte for byte"
done
assert_snapshots memory.md 0 "and took no backups, because it wrote nothing to back up"
assert_equals 0 "$(ls -a growth-engine/.state | grep -c 'ge-lint')" \
  "and left no scratch file behind in the folder"

t_done
