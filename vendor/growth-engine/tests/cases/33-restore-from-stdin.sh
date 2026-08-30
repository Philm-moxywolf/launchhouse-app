#!/bin/sh
# 33-restore-from-stdin.sh: handing a version back to ge without a second writer.
#
# WHY IT EXISTS: the backup ring is ten deep and it rolls, so the tenth write of
#                the day pushes the morning's copy out of it for ever. Anything
#                that keeps a longer history than that has every version and no
#                way to put one back, because the only other way in is to write
#                the founder's file directly, and two writers on one file is how
#                a file ends up half one version and half another with nothing
#                saying which.
#
#                ge restore <file> --from - is the way in that keeps one writer.
#                The caller says what the bytes are and ge does the writing, so
#                the copy before the overwrite, the founder's own permissions,
#                the whole file built under a working name and moved into place
#                in one step, and the way back afterwards all still happen. This
#                case is the proof of the last of those: after a version has been
#                handed back, the founder can still undo it.
#
#                THE BYTES ARE THE POINT. What arrives on the input is written
#                out unchanged: carriage returns kept, no newline added to the
#                end, and a marker comment written as text rather than acted on.
#                A restore that tidied any of those would hand a founder back a
#                version that is not the one that was kept.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/33-restore-from-stdin/
# POSTURE:       fail-closed. Every put back is a byte comparison with no
#                scrubbing at all, and every refusal is followed by a check that
#                the file is still exactly what it was.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. The bytes handed in are built
#                with printf and octal escapes, so the same bytes reach ge under
#                every shell that reads this file.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHY THE FOLDER IS NAMED THE WAY IT IS. Half the folders in this programme are
# named after a business, so they carry a space, and the other three characters
# here are one keystroke away from it. A plainly named sandbox is how two real
# bugs in this toolkit stayed hidden.
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 33-restore-from-stdin

RS_BS='\'
RS_ROOT="$SANDBOX/Ana's [own] back${RS_BS}slash folder"
mkdir -p "$RS_ROOT/work" || t_die "the sandbox folder could not be made." \
  "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
cd "$RS_ROOT/work" || t_die "the work folder is not there." "sh tests/run.sh again"
HOME="$RS_ROOT/work"
export HOME
GE_T_HOME="$RS_ROOT/work/growth-engine"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# ---------------------------------------------------------------- the bytes

# The version being handed back. Three things in it that a write which tidied
# up would change, and each one is a real shape a founder's file arrives in.
#
#   \r\n            the file was last saved by a Windows editor
#   a marker line   ge owns six marked pairs in memory.md, and a restore must
#                   write this one as text rather than read it as a section
#   no final \n     the last line ends where it ends
#
# printf with octal escapes rather than a here-document, because a here-document
# adds a newline at the end and that is one of the three things being measured.
printf '# Memory\015\012\015\012<!-- GE:DECISIONS:START -->\015\012- 2026-09-01 the version from three weeks ago\015\012<!-- GE:DECISIONS:END -->\015\012a last line with no newline after it' \
  > "$CASEWORK/version.bytes" \
  || t_die "the version being handed back could not be built." "chmod u+w $CASEWORK"

cp growth-engine/memory.md "$CASEWORK/original.keep" \
  || t_die "the file as ge init left it could not be kept." "chmod u+w $CASEWORK"

# The founder's own permission on the file, so the check further down that it
# survived the write is measuring something that was really there. 600 and not
# 400: a file ge cannot write is a different case and 31-permission-modes has it.
chmod 600 growth-engine/memory.md || t_die "the file would not change permissions." \
  "ls -l $GE_T_HOME/memory.md"
RS_MODE_BEFORE=$(ls -l growth-engine/memory.md | cut -c1-10)

# ------------------------------------------------------ one version, handed back

# Read from a pipe and not from a file, because a pipe is what the caller uses
# and a pipe is the one that cannot be rewound. A read that seeks would work
# against a file and fail against the thing this was written for.
cat "$CASEWORK/version.bytes" | sh "$GE" restore memory.md --from - \
  > "$CASEWORK/restore.out" 2>&1
assert_exit 0 $? "ge restore --from - exits 0"
assert_bytes_equal "$CASEWORK/version.bytes" growth-engine/memory.md \
  "the file is byte for byte what arrived on the input"
assert_equals "$RS_MODE_BEFORE" "$(ls -l growth-engine/memory.md | cut -c1-10)" \
  "and the founder's own permission on it is still there"
# The whole of what it said, and not only the lines named below it. A committed
# fixture cannot be used here, because this case works in a folder whose name
# carries a backslash and no such path can be checked out on Windows, so the
# expectation is written here instead. The actual side is scrubbed, which is what
# turns the stamp in the last line into @STAMP@.
cat > "$CASEWORK/restore.expect" <<'RESTORE'
restored memory.md from the copy you picked
  31 lines are different from what was there a moment ago.
  This puts back what you had a moment ago.
  → run: ge restore memory.md @STAMP@
RESTORE
assert_files_equal "$CASEWORK/restore.expect" "$CASEWORK/restore.out" \
  "what ge said it did, every line of it"
assert_contains "$CASEWORK/restore.out" 'restored memory.md from the copy you picked' \
  "it says the copy came from the caller and not from the ring"
assert_contains "$CASEWORK/restore.out" 'This puts back what you had a moment ago.' \
  "and it hands over the way back"

# THE FIRST HALF OF WHAT THIS CASE IS FOR: a copy of what was there was taken
# before it was written over, and that copy is the previous content and not a
# fresh copy of the new one. One in the ring, holding the bytes ge init wrote.
assert_snapshots memory.md 1 "the restore took a copy before it wrote"
RS_STAMP=$(sed -n 's/.*→ run: ge restore memory.md \([0-9A-Za-z-]*\).*/\1/p' "$CASEWORK/restore.out")
[ -n "$RS_STAMP" ] || t_die "ge restore did not print the way back." "cat $CASEWORK/restore.out"
assert_bytes_equal "$CASEWORK/original.keep" \
  "growth-engine/.state/snapshots/memory.md.$RS_STAMP" \
  "and the copy holds what the file said before, byte for byte"

# THE SECOND HALF: ge undo puts it back. This is the whole reason a version can
# be handed back at all without breaking one writer. Nothing else in the folder
# has been changed, so undo has one file to pick and no reason to refuse.
sh "$GE" undo > "$CASEWORK/undo.out" 2>&1
assert_exit 0 $? "ge undo after a restore from the input exits 0"
assert_bytes_equal "$CASEWORK/original.keep" growth-engine/memory.md \
  "and the file is back to what it was, byte for byte"
assert_contains "$CASEWORK/undo.out" "restored memory.md from the backup stamped $RS_STAMP" \
  "and it names the copy the restore had taken"
assert_equals "$RS_MODE_BEFORE" "$(ls -l growth-engine/memory.md | cut -c1-10)" \
  "the undo kept the founder's permission too"

# The way back from the undo. Two writes have happened now, so the ring holds two.
assert_snapshots memory.md 2 "the undo took its own copy before it wrote"

# ---------------------------------------------------- the same bytes, handed back again

# Byte for byte what is already there. Writing it again would spend a slot in a
# ring that is only ten deep, move the modified time, and set a sync client
# going, all to report that nothing changed.
sh "$GE" restore memory.md --from - < "$CASEWORK/original.keep" \
  > "$CASEWORK/same.out" 2>&1
assert_exit 0 $? "handing back the bytes that are already there exits 0"
cat > "$CASEWORK/same.expect" <<'SAME'
memory.md is already the same as the copy you picked. Nothing was changed.
SAME
assert_files_equal "$CASEWORK/same.expect" "$CASEWORK/same.out" \
  "and it says nothing was changed, in one line and no more"
assert_snapshots memory.md 2 "and it did not spend a slot in the ring"

# ---------------------------------------------------- a file the folder does not have

# The case this verb was added for, in its plainest form: a version of a file
# that is not in the folder at all. The ring cannot hold a copy of a file that
# was never there, so no copy is taken and no way back is offered, and ge says
# neither. A line promising a way back that does not exist is worse than no line.
printf 'C1 short-post\n\nthe words of a post from three weeks ago\n' \
  > "$CASEWORK/content.bytes" \
  || t_die "the content version could not be built." "chmod u+w $CASEWORK"
assert_absent growth-engine/content-30.md "the folder does not have this file yet"
sh "$GE" restore content-30.md --from - < "$CASEWORK/content.bytes" \
  > "$CASEWORK/newfile.out" 2>&1
assert_exit 0 $? "handing back a file the folder does not have exits 0"
assert_bytes_equal "$CASEWORK/content.bytes" growth-engine/content-30.md \
  "and the file is written byte for byte"
assert_snapshots content-30.md 0 "there was nothing to copy, so nothing was copied"
assert_lacks "$CASEWORK/newfile.out" 'This puts back what you had a moment ago.' \
  "and no way back is offered, because there is none"

# ---------------------------------------------------------------- a person file

# A file in a folder inside the folder. The ring flattens the path into one
# filename, so a copy of people/<slug>.md is where a slash in the name would
# show up as a missing backup rather than as an error.
sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1 \
  || t_die "the prospect could not be added." "sh tests/run.sh again"
cp growth-engine/people/sam-northfield-io.md "$CASEWORK/person.keep" \
  || t_die "the person file could not be kept." "chmod u+w $CASEWORK"
printf 'a version of the person file from before today\n' > "$CASEWORK/person.bytes" \
  || t_die "the person version could not be built." "chmod u+w $CASEWORK"
sh "$GE" restore people/sam-northfield-io.md --from - < "$CASEWORK/person.bytes" \
  > "$CASEWORK/person.out" 2>&1
assert_exit 0 $? "handing back a person file exits 0"
assert_bytes_equal "$CASEWORK/person.bytes" growth-engine/people/sam-northfield-io.md \
  "and it is written byte for byte"
assert_snapshots people/sam-northfield-io.md 1 "and a copy of it was taken first"

# ---------------------------------------------------------------- what it refuses

# rs_refuse <label> <stdin file> <ge arguments...>: it exits 1, memory.md is
# untouched, and the message ends with something to run. Every refusal in this
# toolkit ends with a way out, and a refusal about a founder's only copy of
# their work is the last place to make an exception.
cp growth-engine/memory.md "$CASEWORK/before-refusals.keep" \
  || t_die "the file before the refusals could not be kept." "chmod u+w $CASEWORK"
rs_refuse() {                           # <label> <stdin file> <ge arguments...>
  rs_label=$1
  rs_in=$2
  shift 2
  sh "$GE" "$@" < "$rs_in" > "$CASEWORK/refuse.out" 2>&1
  assert_exit 1 $? "$rs_label exits 1"
  assert_contains "$CASEWORK/refuse.out" '→ run:' "$rs_label carries a way out"
  assert_bytes_equal "$CASEWORK/before-refusals.keep" growth-engine/memory.md \
    "$rs_label left the file exactly as it was"
}

# Nothing after --from. The dash is the whole of what goes there, and a founder
# or a caller that left it off has to be told which, not guessed at.
rs_refuse 'ge restore --from with nothing after it' "$CASEWORK/version.bytes" \
  restore memory.md --from
assert_contains "$CASEWORK/refuse.out" 'A single dash is the whole of what goes after it.' \
  "and says what should have been there"

# A path where the dash should be. This is the shape that would be a second
# thing to get wrong: a path is read against a working directory, which is what
# the pin in lib/paths.sh exists to stop mattering.
rs_refuse 'ge restore --from with a path after it' "$CASEWORK/version.bytes" \
  restore memory.md --from "$CASEWORK/version.bytes"
assert_contains "$CASEWORK/refuse.out" 'reads the copy on its input, and nothing else' \
  "and says where the copy has to come from"

# A stamp as well as the dash. Two answers to one question.
rs_refuse 'ge restore --from - with a stamp as well' "$CASEWORK/version.bytes" \
  restore memory.md --from - 20260925T091500Z
assert_contains "$CASEWORK/refuse.out" 'takes nothing after the dash' \
  "and says the copy comes in on its own"

# NOTHING AT ALL ON THE INPUT, which is the one that matters most. A version
# that was genuinely empty and a delivery that failed halfway and closed look
# exactly the same from here, and they have opposite right answers. A refusal
# costs one command. Guessing wrong costs the file, and the founder finds out by
# opening it.
rs_refuse 'ge restore --from - with nothing on the input' /dev/null \
  restore memory.md --from -
assert_contains "$CASEWORK/refuse.out" 'held nothing at all, so nothing was restored' \
  "and says the input was empty rather than writing an empty file"
assert_contains "$CASEWORK/refuse.out" 'is exactly as it was' \
  "and says the file was left alone"

# Outside the folder, both ways of getting there. ge only ever touches the one
# folder, and a copy arriving on the input does not change that.
rs_refuse 'ge restore --from - naming a path outside the folder' "$CASEWORK/version.bytes" \
  restore /etc/hosts --from -
assert_contains "$CASEWORK/refuse.out" 'is outside your growth-engine folder' "and says so"

rs_refuse 'ge restore --from - naming a path that steps out of the folder' "$CASEWORK/version.bytes" \
  restore ../memory.md --from -
assert_contains "$CASEWORK/refuse.out" 'steps outside your growth-engine folder' "and says so"

# The two refusals above named a file outside the folder and were handed a real
# version on the input. Nothing outside the folder may have been written.
assert_absent "$RS_ROOT/work/memory.md" \
  "nothing was written beside the growth-engine folder"

# ---------------------------------------------------------------- the whole tree

# The list of files, held against a list written out here rather than against a
# committed fixture, for the reason given above: the folder this case works in
# has a backslash in its name and a fixture folder carrying that path could not
# be checked out on Windows. The ring is left out of the list, because its
# contents are stamped with the second they were taken and the counts above are
# what hold it.
cat > "$CASEWORK/tree.expect" <<'TREE'
./content-30.md
./ledger.md
./memory.md
./ops-log.md
./people
./people/README.md
./people/sam-northfield-io.md
TREE
( cd growth-engine && find . -print ) | grep -v '^\./\.state' | grep -v '^\.$' \
  | grep -v '/\.gitignore$' | LC_ALL=C sort > "$CASEWORK/tree.actual"
assert_bytes_equal "$CASEWORK/tree.expect" "$CASEWORK/tree.actual" \
  "the folder holds these files and no others after four versions and seven refusals"

t_done
