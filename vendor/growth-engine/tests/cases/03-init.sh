#!/bin/sh
# 03-init.sh — golden test for ge init: the tree it makes, and running it twice.
#
# WHY IT EXISTS: every founder runs this first and a good number of them run it
#                again later, in the same folder, because they are not sure it
#                worked. If the second run replaced memory.md the founder loses
#                everything they have written, silently, and blames the toolkit
#                for being empty on the Saturday. This case is what says the
#                second run keeps.
#                The three journeys at the end are the ones that used to have no
#                way out at all: a folder that was moved, ge init run from
#                inside the folder, and ge init run somewhere a folder already
#                exists. Each is driven to the end, so what is held here is not
#                that a message appears but that the founder gets working again.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/03-init/   WRITES: tests/.work/<shell>/03-init/
# POSTURE:       fail-closed. The whole folder is compared, not a sample of it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 03-init
cd "$SANDBOX" || t_die "the sandbox for 03-init is not there." "sh tests/run.sh again"

# 1. The first run, word for word.
sh "$GE" init > "$CASEWORK/first.out" 2>&1
assert_exit 0 $? "ge init exits 0"
assert_files_equal "$FIX/expect.out/first.txt" "$CASEWORK/first.out" "the first run says what it created"

# 2. The anchor holds the folder's own absolute path, on one line, with nothing
#    after it. Everything later depends on this to tell a moved folder from a
#    folder that was never made.
assert_equals "$SANDBOX/growth-engine" "$(cat growth-engine/.state/HOME)" "the anchor holds the folder path"
assert_equals 1 "$(wc -l < growth-engine/.state/HOME | tr -d ' ')" "the anchor is one line"

# 3. Every seeded file, held aside, so the second run can be proved harmless.
mkdir -p "$CASEWORK/keep"
for f in memory.md ops-log.md ledger.md .gitignore people/README.md; do
  cp "growth-engine/$f" "$CASEWORK/keep/$(printf '%s' "$f" | tr '/' '_')" || \
    t_die "ge init did not create growth-engine/$f." "sh tests/run.sh --update and read the diff"
done

# 4. The second run keeps everything and says so.
sh "$GE" init > "$CASEWORK/second.out" 2>&1
assert_exit 0 $? "a second ge init exits 0"
assert_files_equal "$FIX/expect.out/second.txt" "$CASEWORK/second.out" "the second run says what it kept"

for f in memory.md ops-log.md ledger.md .gitignore people/README.md; do
  assert_bytes_equal "$CASEWORK/keep/$(printf '%s' "$f" | tr '/' '_')" "growth-engine/$f" \
    "a second ge init leaves $f byte for byte"
done

# 5. Nothing was backed up, because nothing was overwritten.
assert_snapshots memory.md 0 "a second ge init takes no snapshot, because it writes nothing"

# 6. The six managed blocks memory.md has to carry. A skill that finds one
#    missing has nowhere to write, and ge init is the only thing that seeds them.
for b in DECISIONS WORKED DIDNOT VOICE ANGLES THREADS; do
  assert_contains growth-engine/memory.md "<!-- GE:$b:START -->" "memory.md carries the $b block start"
  assert_contains growth-engine/memory.md "<!-- GE:$b:END -->" "memory.md carries the $b block end"
done

# 7. The founder's own people and machine state stay out of any repository they
#    fork. These two lines are what keep 130 people's prospect lists off GitHub.
#    The tree comparison leaves this file out, for the reason set out at the top
#    of tests/lib/assert.sh, so it is held against its own fixture here.
assert_files_equal "$FIX/expect.out/gitignore.txt" growth-engine/.gitignore \
  "the ignore file that keeps people/ and .state/ out of git"
assert_contains growth-engine/.gitignore 'people/' "the folder ignores people/"
assert_contains growth-engine/.gitignore '.state/' "the folder ignores .state/"

# 8. The doctor is green on the folder ge init just made. A founder's first two
#    commands are ge init and ge check, and the doctor used to open with a
#    failure on a folder nobody had touched. That is the worst possible first
#    impression for somebody who is already unsure they installed it right.
sh "$GE" check > "$CASEWORK/check.out" 2>&1
assert_exit 0 $? "ge check passes on a folder ge init has just made"
assert_contains "$CASEWORK/check.out" 'Nothing to fix.' "and says there is nothing to fix"

# 9. The whole tree.
assert_tree "$FIX/expect" "$SANDBOX" "the folder ge init makes"

# ------------------------------------------------- the three journeys out

# These build their own folders away from the sandbox above, so the tree just
# compared stays the one ge init made and nothing else. HOME moves with them,
# because ge reads it when it looks for the folder.
EXTRA="$WORKROOT/03-init-extra"
rm -rf "$EXTRA"
mkdir -p "$EXTRA/Desktop" "$EXTRA/Documents/project" || \
  t_die "the extra folders for 03-init could not be made." "df -h ${TMPDIR:-/tmp}"
OLDHOME=$HOME
HOME=$EXTRA
export HOME

# 10. ge init from inside the folder. init's own closing line tells founders to
#     always open this same folder, and every recovery line in the toolkit that
#     says to run ge init is read from wherever they are standing, so this is
#     where they end up. It used to build growth-engine/growth-engine and write
#     everything into it from then on, while their real work sat one level up.
cd "$EXTRA/Desktop" || t_die "the Desktop folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed in the Desktop folder." "sh tests/run.sh again"
cd "$EXTRA/Desktop/growth-engine" || t_die "the folder ge init made is not there." "sh tests/run.sh again"
sh "$GE" init > "$CASEWORK/inside.out" 2>&1
assert_exit 0 $? "ge init run from inside the folder exits 0"
assert_absent "$EXTRA/Desktop/growth-engine/growth-engine" \
  "and makes no second folder inside the first"
assert_equals "$EXTRA/Desktop/growth-engine" "$(cat "$EXTRA/Desktop/growth-engine/.state/HOME")" \
  "and the anchor still holds the folder they were standing in"

# 11. The folder was moved. Dragging it from one folder to another is the most
#     ordinary thing anybody does with a folder, and on Windows OneDrive does it
#     for them. ge init is what the doctor names, so ge init has to settle it,
#     in one run, with nothing of theirs lost.
sh "$GE" remember decision "b2b track, my buyers are agencies" > /dev/null 2>&1
mv "$EXTRA/Desktop/growth-engine" "$EXTRA/Documents/" || \
  t_die "the folder could not be moved." "sh tests/run.sh again"
cd "$EXTRA/Documents" || t_die "the Documents folder is not there." "sh tests/run.sh again"
sh "$GE" check > "$CASEWORK/moved.out" 2>&1
assert_contains "$CASEWORK/moved.out" 'FAIL  anchor' "a moved folder fails the anchor leg"
assert_contains "$CASEWORK/moved.out" '→ run: ge init' "and the doctor names ge init"
sh "$GE" init > "$CASEWORK/reanchor.out" 2>&1
assert_exit 0 $? "the ge init the doctor named exits 0"
assert_equals "$EXTRA/Documents/growth-engine" "$(cat "$EXTRA/Documents/growth-engine/.state/HOME")" \
  "and the anchor now holds where the folder really is"
assert_contains "$CASEWORK/reanchor.out" 'This folder has moved.' "and says out loud that it moved"
sh "$GE" check > "$CASEWORK/settled.out" 2>&1
assert_lacks "$CASEWORK/settled.out" 'FAIL  anchor' "so the doctor stops failing on the anchor"
assert_contains "$EXTRA/Documents/growth-engine/memory.md" 'b2b track, my buyers are agencies' \
  "and what they had written is still there"

# 12. A second folder. ge init is documented as safe to run again, so a founder
#     who ran it at onboarding and again in their real project folder weeks
#     later lands here. It used to make the second folder and report success,
#     after which thirteen other verbs refused and nothing they could type
#     cleared it. Now it stops, and the command it prints is followed to the end.
cd "$EXTRA/Documents/project" || t_die "the project folder is not there." "sh tests/run.sh again"
sh "$GE" init > "$CASEWORK/second.out" 2>&1
assert_exit 1 $? "ge init refuses to make a second folder"
assert_absent "$EXTRA/Documents/project/growth-engine" "and nothing was made"
assert_contains "$CASEWORK/second.out" 'you already have a Launchhouse folder' "and says why"
assert_contains "$CASEWORK/second.out" "$EXTRA/Documents/growth-engine" "naming the one they have"
assert_contains "$CASEWORK/second.out" '→ run: mv ' "and names moving it as the way out"
mv "$EXTRA/Documents/growth-engine" "$EXTRA/Documents/project" || \
  t_die "the folder could not be moved into the project folder." "sh tests/run.sh again"
sh "$GE" init > "$CASEWORK/moved-in.out" 2>&1
assert_exit 0 $? "and after that move ge init exits 0"
assert_equals "$EXTRA/Documents/project/growth-engine" \
  "$(cat "$EXTRA/Documents/project/growth-engine/.state/HOME")" \
  "with the anchor holding the folder they moved it to"
assert_contains "$EXTRA/Documents/project/growth-engine/memory.md" 'b2b track, my buyers are agencies' \
  "and their work came with it"

HOME=$OLDHOME
export HOME

t_done
