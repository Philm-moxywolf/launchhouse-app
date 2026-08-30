#!/bin/sh
# 10-awkward-path.sh: the folder is found when its path carries a space or a star.
#
# WHY IT EXISTS: run.sh builds its sandbox with mktemp, and a mktemp path never
#                carries a space. That single accident is the only reason the
#                worst failure in this toolkit stayed invisible: ge init writes
#                the folder happily inside "Founder Work", and then every other
#                verb says there is no folder here at all. Founders name folders
#                after their business, with spaces in, and a laptop with a space
#                in the account name puts one in every path they have. The star
#                is the same fault wearing a different hat: a candidate path that
#                is expanded rather than quoted can match a folder next door, and
#                a founder is then told their work is split across a folder they
#                have never opened.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/10-awkward-path/
# POSTURE:       fail-closed. Every verb in the journey has to work inside the
#                awkward folder, and the entry has to land in the folder the
#                founder was standing in, never in the one beside it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 10-awkward-path

# ---------------------------------------------------------------- a space

SPACED="$SANDBOX/Founder Work"
mkdir -p "$SPACED" || t_die "the spaced folder could not be made." "df -h ${TMPDIR:-/tmp}"
cd "$SPACED" || t_die "the spaced folder for 10-awkward-path is not there." "sh tests/run.sh again"
GE_T_HOME="$SPACED/growth-engine"

# 1. The folder is created, and the anchor holds the path with the space in it.
sh "$GE" init > "$CASEWORK/init.out" 2>&1
assert_exit 0 $? "ge init works in a folder whose name has a space in it"
assert_equals "$SPACED/growth-engine" "$(cat "$SPACED/growth-engine/.state/HOME")" \
  "the anchor holds the path with the space in it"

# 2. The doctor finds it. It still ends on a fix, because no index has been built
#    yet, so what is asserted here is the leg that proves the folder was found.
sh "$GE" check > "$CASEWORK/check-first.out" 2>&1
assert_contains "$CASEWORK/check-first.out" "PASS  anchor" \
  "ge check finds a folder whose path has a space in it"
assert_contains "$CASEWORK/check-first.out" "$SPACED/growth-engine" \
  "and names it with the space in it"

# 3. The journey. Every one of these reads the folder back rather than making it,
#    so every one of them is a place the space can be lost.
sh "$GE" log note "written from a folder with a space in its name" > "$CASEWORK/log.out" 2>&1
assert_exit 0 $? "ge log works in a folder with a space in its name"
assert_contains "$SPACED/growth-engine/ops-log.md" 'written from a folder with a space' \
  "and the entry is in the ops log"

sh "$GE" remember decision "b2b track, my buyers are agencies" > "$CASEWORK/remember.out" 2>&1
assert_exit 0 $? "ge remember works in a folder with a space in its name"
assert_contains "$SPACED/growth-engine/memory.md" 'b2b track, my buyers are agencies' \
  "and the entry is in memory.md"
assert_snapshots memory.md 1 "and the write took a backup first"

sh "$GE" person add prospect sam@northfield.io "Sam Carter" --company "Northfield" \
  > "$CASEWORK/person.out" 2>&1
assert_exit 0 $? "ge person add works in a folder with a space in its name"
assert_contains "$SPACED/growth-engine/people/sam-northfield-io.md" 'key: sam@northfield.io' \
  "and the person file is there"

sh "$GE" ledger add-content 1 1 short-post text > "$CASEWORK/ledger.out" 2>&1
assert_exit 0 $? "ge ledger add-content works in a folder with a space in its name"
assert_contains "$SPACED/growth-engine/ledger.md" 'short-post' "and the piece is in the ledger"

# 4. With the index built, the doctor passes every leg. This is the line a
#    founder is told to run when something looks wrong, so it has to be clean
#    in a folder that is otherwise fine.
sh "$GE" index > "$CASEWORK/index.out" 2>&1
assert_exit 0 $? "ge index works in a folder with a space in its name"
sh "$GE" check > "$CASEWORK/check.out" 2>&1
assert_exit 0 $? "ge check passes in a folder with a space in its name"
assert_contains "$CASEWORK/check.out" 'Nothing to fix.' "and says there is nothing to fix"

# 5. Two folders deep, both with spaces. A founder opens Claude wherever the
#    file they were reading is, which is rarely the top of the folder.
mkdir -p "$SPACED/notes and drafts" || t_die "the deeper folder could not be made." "df -h ${TMPDIR:-/tmp}"
cd "$SPACED/notes and drafts" || t_die "the deeper folder is not there." "sh tests/run.sh again"
sh "$GE" person note sam@northfield.io "they run ops for four agencies" > "$CASEWORK/note.out" 2>&1
assert_exit 0 $? "ge person note works from a sub folder that also has a space in its name"
assert_contains "$SPACED/growth-engine/people/sam-northfield-io.md" 'they run ops for four agencies' \
  "and the note is in the person file"
sh "$GE" person set sam@northfield.io status contacted_ok > "$CASEWORK/set.out" 2>&1
assert_exit 0 $? "ge person set works from a sub folder that also has a space in its name"
assert_contains "$SPACED/growth-engine/people/sam-northfield-io.md" 'status: contacted_ok' \
  "and the new status is in the file"

# ---------------------------------------------------------------- a star

# A star in a folder name is legal everywhere ge runs. The name is built here
# rather than committed as a fixture folder, because Windows cannot create a
# file with a star in its name and half the cohort is on Windows.
STAR="$SANDBOX/star*folder"
mkdir -p "$STAR" || t_die "the star folder could not be made." "df -h ${TMPDIR:-/tmp}"
cd "$STAR" || t_die "the star folder is not there." "sh tests/run.sh again"
GE_T_HOME="$STAR/growth-engine"

sh "$GE" init > "$CASEWORK/star-init.out" 2>&1
assert_exit 0 $? "ge init works in a folder with a star in its name"
sh "$GE" log note "written from a folder with a star in its name" > "$CASEWORK/star-log.out" 2>&1
assert_exit 0 $? "ge log works in a folder with a star in its name"
assert_contains "$STAR/growth-engine/ops-log.md" 'written from a folder with a star' \
  "and the entry is in that folder's ops log"
sh "$GE" person add prospect kit@brightops.co.uk "Kit Alvarez" > "$CASEWORK/star-person.out" 2>&1
assert_exit 0 $? "ge person add works in a folder with a star in its name"
sh "$GE" ledger add-content 1 1 short-post text > "$CASEWORK/star-ledger.out" 2>&1
assert_exit 0 $? "ge ledger add-content works in a folder with a star in its name"

# 6. The folder next door. Its name is what the star would match if a candidate
#    path were ever expanded rather than compared, and it holds a growth-engine
#    folder of its own. The founder is standing in the first one, so that is the
#    one that has to be written to, and there is nothing ambiguous about it.
NEIGHBOUR="$SANDBOX/starXXfolder"
mkdir -p "$NEIGHBOUR" || t_die "the neighbouring folder could not be made." "df -h ${TMPDIR:-/tmp}"
( cd "$NEIGHBOUR" && sh "$GE" init ) > /dev/null 2>&1 || \
  t_die "ge init failed in the neighbouring folder." "sh tests/run.sh again"
cd "$STAR" || t_die "the star folder is not there." "sh tests/run.sh again"
sh "$GE" log note "this belongs to the folder I am standing in" > "$CASEWORK/star-log2.out" 2>&1
assert_exit 0 $? "a folder next door that the star would match is not a second folder"
assert_contains "$STAR/growth-engine/ops-log.md" 'this belongs to the folder I am standing in' \
  "the entry lands in the folder the founder was standing in"
assert_equals 0 "$(grep -c 'this belongs to the folder' "$NEIGHBOUR/growth-engine/ops-log.md")" \
  "and nothing at all was written to the folder next door"

# ---------------------------------------------------------------- a home folder

# 7. The other half of the walk: the folder is on the Desktop and Claude was
#    opened somewhere else. That is the most common real case in the programme,
#    and a Mac account named "Anna Marie" puts a space in every path it has.
HOMEY="$SANDBOX/home with a space"
mkdir -p "$HOMEY/Desktop" "$SANDBOX/elsewhere" || \
  t_die "the home folder with a space could not be made." "df -h ${TMPDIR:-/tmp}"
OLDHOME=$HOME
HOME=$HOMEY
export HOME
GE_T_HOME="$HOMEY/Desktop/growth-engine"
( cd "$HOMEY/Desktop" && sh "$GE" init ) > /dev/null 2>&1 || \
  t_die "ge init failed inside the home folder with a space." "sh tests/run.sh again"
cd "$SANDBOX/elsewhere" || t_die "the elsewhere folder is not there." "sh tests/run.sh again"
sh "$GE" log note "found through a home folder with a space in it" > "$CASEWORK/home-log.out" 2>&1
assert_exit 0 $? "a folder on a Desktop under a home folder with a space is still found"
assert_contains "$HOMEY/Desktop/growth-engine/ops-log.md" 'found through a home folder with a space' \
  "and the entry lands in it"
HOME=$OLDHOME
export HOME

t_done
