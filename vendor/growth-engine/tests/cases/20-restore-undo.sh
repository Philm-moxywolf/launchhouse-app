#!/bin/sh
# 20-restore-undo.sh: golden test for ge restore and ge undo, the two ways back.
#
# WHY IT EXISTS: the backup ring is only worth having if a founder can get at it
#                without reading stamped file names in a hidden folder. These two
#                verbs are that, and both of them write, so both can take a second
#                thing away on top of the first. Restoring the wrong stamp has to
#                be undoable, which means the restore backs up what it replaces
#                before it replaces it. And undo has to refuse when two files
#                changed together, because undoing the wrong one of a pair is a
#                loss the founder has no way to notice.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/20-restore-undo/   WRITES: tests/.work/<shell>/20-restore-undo/
# POSTURE:       fail-closed. Every put back is a byte comparison with no
#                scrubbing at all, because masking anything in it would defeat it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 20-restore-undo

WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"
RING="$WORKDIR/growth-engine/.state/snapshots"

# 1. No folder. Both verbs, because a founder in the wrong place reaches for
#    whichever one they were told about.
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME
sh "$GE" restore memory.md > "$CASEWORK/nofolder-restore.out" 2>&1
assert_exit 1 $? "ge restore with no folder exits 1"
assert_contains "$CASEWORK/nofolder-restore.out" '→ run: ge init' "and names what makes one"
sh "$GE" undo > "$CASEWORK/nofolder-undo.out" 2>&1
assert_exit 1 $? "ge undo with no folder exits 1"
assert_contains "$CASEWORK/nofolder-undo.out" '→ run: ge init' "and names what makes one"
HOME=$OLDHOME
export HOME

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 2. Nothing has been changed yet, so there is nothing to put back. This is the
#    common case for a founder who reaches for undo out of worry rather than need.
sh "$GE" undo > "$CASEWORK/nothing.out" 2>&1
assert_exit 1 $? "ge undo with an empty ring exits 1"
assert_raw_equal "$FIX/expect.out/nothing.txt" "$CASEWORK/nothing.out" "the nothing to undo refusal"

sh "$GE" restore > "$CASEWORK/noname.out" 2>&1
assert_exit 1 $? "ge restore with no file name exits 1"
assert_raw_equal "$FIX/expect.out/noname.txt" "$CASEWORK/noname.out" "the no file name refusal"

sh "$GE" restore memory.md > "$CASEWORK/nobackups.out" 2>&1
assert_exit 1 $? "ge restore of a file with no backups exits 1"
assert_raw_equal "$FIX/expect.out/nobackups.txt" "$CASEWORK/nobackups.out" "the no backups refusal"

# 3. One backup and one change. The founder's words come back byte for byte,
#    which is the whole promise and the reason nothing here is scrubbed.
cp growth-engine/memory.md "$CASEWORK/original.keep"
sh "$GE" snapshot memory.md > /dev/null 2>&1 || t_die "the snapshot failed." "sh tests/run.sh again"
printf 'a paragraph the founder wrote and then lost\n' >> growth-engine/memory.md
cp growth-engine/memory.md "$CASEWORK/changed.keep"

sh "$GE" restore memory.md > "$CASEWORK/restore.out" 2>&1
assert_exit 0 $? "ge restore with one backup and no stamp exits 0"
assert_bytes_equal "$CASEWORK/original.keep" growth-engine/memory.md \
  "and the file comes back byte for byte"
assert_contains "$CASEWORK/restore.out" 'restored memory.md from the backup stamped ' "it says what it did"
assert_contains "$CASEWORK/restore.out" 'different from what was there a moment ago' \
  "and how far back it went"
# A one line difference has to read as "1 line is", not "1 lines are". A founder
# who sees the toolkit get that wrong wonders what else in it is careless.
assert_lacks "$CASEWORK/restore.out" '1 lines are' \
  "and it gets the singular right"

# 4. The restore backed up what it replaced, so the wrong choice costs one more
#    command rather than a morning. The stamp it names is the way back.
back=$(sed -n 's/.*→ run: ge restore memory.md \([0-9A-Za-z-]*\).*/\1/p' "$CASEWORK/restore.out")
[ -n "$back" ] || t_die "ge restore did not print the way back." "cat $CASEWORK/restore.out"
assert_snapshots memory.md 2 "the restore backed up what it was replacing"
sh "$GE" restore memory.md "$back" > "$CASEWORK/back.out" 2>&1
assert_exit 0 $? "the way back it printed works"
assert_bytes_equal "$CASEWORK/changed.keep" growth-engine/memory.md \
  "and hands back exactly what was there before the restore"

# 5. A stamp that is not there. The refusal lists the ones that are, oldest
#    first, so the founder can pick one rather than guess at the shape.
sh "$GE" restore memory.md 20200101T000000Z > "$CASEWORK/badstamp.out" 2>&1
assert_exit 1 $? "a stamp that is not there exits 1"
assert_contains "$CASEWORK/badstamp.out" 'there is no backup of memory.md stamped 20200101T000000Z' \
  "the refusal says which stamp it could not find"
assert_contains "$CASEWORK/badstamp.out" 'These are the ones there are, oldest first:' \
  "and lists the ones there are"
assert_contains "$CASEWORK/badstamp.out" 'different from the file you have now' \
  "with how far from the file each one is"
# The listing is read at the moment a founder is deciding whether to overwrite
# their work, and it used to say "1 lines different" there while the line right
# below it in the same file got the singular right. Asserted on both sides now,
# because the fix was made once and missed in the sibling.
assert_lacks "$CASEWORK/badstamp.out" '1 lines' \
  "and the listing gets the singular right too"
assert_contains "$CASEWORK/badstamp.out" '→ run: ge restore memory.md ' "and names one that would work"

# 6. A path outside the folder, and a folder rather than a file. ge only ever
#    touches the one folder, and it never guesses which file inside a folder was
#    meant.
sh "$GE" restore /etc/hosts > "$CASEWORK/outside.out" 2>&1
assert_exit 1 $? "a path outside the folder exits 1"
assert_raw_equal "$FIX/expect.out/outside.txt" "$CASEWORK/outside.out" "the outside refusal"

sh "$GE" restore ../memory.md > "$CASEWORK/updir.out" 2>&1
assert_exit 1 $? "a path that steps out of the folder exits 1"
assert_contains "$CASEWORK/updir.out" 'steps outside your growth-engine folder' "and says so"
assert_contains "$CASEWORK/updir.out" '→ run:' "and carries a recovery line"

# 7. Undo, with one file changed. It picks that one and puts it back, and it says
#    the way back the same way restore does.
cp growth-engine/memory.md "$CASEWORK/before-undo.keep"
sh "$GE" undo > "$CASEWORK/undo.out" 2>&1
assert_exit 0 $? "ge undo with one file changed exits 0"
assert_bytes_equal "$CASEWORK/original.keep" growth-engine/memory.md \
  "and the most recent change is put back byte for byte"
assert_contains "$CASEWORK/undo.out" 'restored memory.md from the backup stamped ' "it says what it put back"
assert_contains "$CASEWORK/undo.out" '→ run: ge restore memory.md ' "and prints the way back"

# 7b. Undo again. This is the one a founder actually does: they run it, they are
#     not sure it worked, and they run it a second time. It used to be a toggle,
#     because the restore backs up the state it replaces and that copy is then
#     the newest thing in the ring, so the second run handed the clobbered file
#     straight back and worded it exactly like the first. Twice more, because a
#     founder who is unsure does not stop at two.
sh "$GE" undo > "$CASEWORK/undo2.out" 2>&1
assert_exit 0 $? "a second ge undo exits 0"
assert_bytes_equal "$CASEWORK/original.keep" growth-engine/memory.md \
  "and the file it just put back is still the one that is there"
assert_lacks "$CASEWORK/undo2.out" 'restored memory.md from the backup stamped ' \
  "and it does not claim to have restored anything"
assert_contains "$CASEWORK/undo2.out" 'Nothing was changed' "it says nothing changed"
sh "$GE" undo > /dev/null 2>&1
sh "$GE" undo > /dev/null 2>&1
assert_bytes_equal "$CASEWORK/original.keep" growth-engine/memory.md \
  "and four undos in a row leave the founder's own words in place"

# 7c. A file name. ge undo used to take one, ignore it, put a different file back
#     and report success, which is a loss the founder has no reason to look for.
cp growth-engine/memory.md "$CASEWORK/named.keep"
sh "$GE" undo memory.md > "$CASEWORK/named.out" 2>&1
assert_exit 1 $? "ge undo with a file name exits 1"
assert_contains "$CASEWORK/named.out" 'does not take a file name' "and says so"
assert_contains "$CASEWORK/named.out" '→ run: ge restore memory.md' "and points at the verb that does"
assert_bytes_equal "$CASEWORK/named.keep" growth-engine/memory.md \
  "and nothing at all was written"

# 8. Two files changed together. Undoing the wrong one of a pair is a second loss
#    on top of the first, and the founder has no way to tell that it happened.
sh "$GE" snapshot ledger.md > /dev/null 2>&1 || t_die "the ledger snapshot failed." "sh tests/run.sh again"
sh "$GE" snapshot ops-log.md > /dev/null 2>&1 || t_die "the ops log snapshot failed." "sh tests/run.sh again"
cp growth-engine/ledger.md "$CASEWORK/ledger.keep"
cp growth-engine/ops-log.md "$CASEWORK/opslog.keep"
printf 'a line added by hand\n' >> growth-engine/ledger.md
printf 'another line added by hand\n' >> growth-engine/ops-log.md
cp growth-engine/ledger.md "$CASEWORK/ledger-changed.keep"
cp growth-engine/ops-log.md "$CASEWORK/opslog-changed.keep"

sh "$GE" undo > "$CASEWORK/two.out" 2>&1
assert_exit 1 $? "ge undo with more than one recent change exits 1"
assert_contains "$CASEWORK/two.out" 'so ge undo will not pick one' "it refuses to choose"
assert_contains "$CASEWORK/two.out" 'ledger.md' "and lists the first file"
assert_contains "$CASEWORK/two.out" 'ops-log.md' "and the second"
assert_contains "$CASEWORK/two.out" '→ run: ge restore ' "and names one of them as a command to run"
assert_bytes_equal "$CASEWORK/ledger-changed.keep" growth-engine/ledger.md \
  "the refused undo left the ledger exactly as it was"
assert_bytes_equal "$CASEWORK/opslog-changed.keep" growth-engine/ops-log.md \
  "and the ops log exactly as it was"

# 9. The command it named in the recovery line is a command that works. A
#    recovery line that does not run is worse than none at all.
recover=$(sed -n 's/.*→ run: ge \(restore .*\)/\1/p' "$CASEWORK/two.out" | sed -n '1p')
[ -n "$recover" ] || t_die "ge undo did not print a way forward." "cat $CASEWORK/two.out"
# The file and the stamp are the two words of that line, split by hand rather
# than passed through a shell, because a founder file can carry any character.
rec_file=${recover#restore }
rec_stamp=${rec_file##* }
rec_file=${rec_file% *}
sh "$GE" restore "$rec_file" "$rec_stamp" > "$CASEWORK/recover.out" 2>&1
assert_exit 0 $? "the command ge undo printed runs and exits 0"
assert_contains "$CASEWORK/recover.out" "restored $rec_file from the backup stamped $rec_stamp" \
  "and puts that one file back"

t_done
