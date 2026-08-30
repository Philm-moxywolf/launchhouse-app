#!/bin/sh
# 04-snapshot.sh — golden test for ge snapshot, ge undo and the ring cap.
#
# WHY IT EXISTS: snapshot is the fail-closed guard in front of every founder file
#                rewrite. If it silently does nothing, undo is impossible and the
#                founder loses a morning of their own judgement with no way back.
#                If the ring never caps, the folder grows without bound on a
#                machine nobody is watching. Both failures are invisible until
#                the day they matter, which is why they are asserted here.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/04-snapshot/   WRITES: tests/.work/<shell>/04-snapshot/
# POSTURE:       fail-closed. The undo check is a byte comparison with no
#                scrubbing at all, because masking anything in it would defeat it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 04-snapshot
cd "$SANDBOX" || t_die "the sandbox for 04-snapshot is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
t_seed

# 1. A snapshot of a file that is really there.
sh "$GE" snapshot founder-brain.md > "$CASEWORK/take.out" 2>&1
assert_exit 0 $? "ge snapshot exits 0"
assert_files_equal "$FIX/expect.out/take.txt" "$CASEWORK/take.out" "ge snapshot names the file and the stamp"
assert_snapshots founder-brain.md 1 "one copy is in the ring"

# 2. A snapshot of a file that is not there yet is a success and does nothing.
#    Without this rule the first write of every skill would be blocked by a
#    backup of a file the write itself is about to create.
#
#    It used to say nothing at all, and this case asserted that. It was wrong to.
#    ge snapshot is also the verb the help text offers a founder before they edit
#    a file by hand, so a name typed one letter wrong looked exactly like a
#    backup that had been taken, and the founder edited with no way back.
#
#    So the two streams are held apart here. Standard error stays silent, which
#    is the part the rest of ge depends on: ge person, ge receipt and ge accounts
#    all pass it straight through to the founder and all three back up a file
#    that does not exist yet. Standard output says so plainly, and every caller
#    inside ge sends that to /dev/null.
sh "$GE" snapshot not-written-yet.md > "$CASEWORK/absent.out" 2> "$CASEWORK/absent.err"
assert_exit 0 $? "a snapshot of a file that does not exist exits 0"
assert_equals 0 "$(wc -c < "$CASEWORK/absent.err" | tr -d ' ')" \
  "and says nothing on the stream its callers pass to the founder"
assert_contains "$CASEWORK/absent.out" 'there is no not-written-yet.md in your growth-engine folder' \
  "and says out loud that there was nothing to back up"
assert_contains "$CASEWORK/absent.out" '→ run:' "and points at how to check the name"
assert_snapshots not-written-yet.md 0 "and puts nothing in the ring"

# 3. Mutate, undo, and get the same bytes back. This is the whole promise.
cp growth-engine/founder-brain.md "$CASEWORK/original.keep"
printf 'this line should not survive undo\n' >> growth-engine/founder-brain.md
sh "$GE" undo > "$CASEWORK/undo.out" 2>&1
assert_exit 0 $? "ge undo exits 0"
assert_bytes_equal "$CASEWORK/original.keep" growth-engine/founder-brain.md "undo gives the file back byte for byte"
assert_files_equal "$FIX/expect.out/undo.txt" "$CASEWORK/undo.out" "ge undo says what it put back"

# 4. The restore that undo performed backed up what it replaced first, so the
#    undo is itself undoable. That is what makes it safe to try.
assert_contains "$CASEWORK/undo.out" '→ run: ge restore founder-brain.md' "undo prints the way back"

# 5. The ring caps and drops the oldest, rather than growing for ever.
i=1
while [ "$i" -le 14 ]; do
  sh "$GE" snapshot founder-brain.md > /dev/null 2>&1
  i=$((i + 1))
done
assert_snapshots founder-brain.md 10 "the ring caps at 10"

# 6. A folder is not a file, and guessing which file inside it was meant is how
#    a founder gets the wrong thing backed up.
sh "$GE" snapshot people > "$CASEWORK/folder.out" 2>&1
assert_exit 1 $? "a snapshot of a folder exits 1"
assert_files_equal "$FIX/expect.out/folder.txt" "$CASEWORK/folder.out" "the folder refusal"
assert_contains "$CASEWORK/folder.out" '→ run:' "the folder refusal carries a recovery line"

# 7. A path outside the folder is refused. ge only ever touches one folder, and
#    a founder pasting a full path from somewhere else must not get a write there.
sh "$GE" snapshot /etc/hosts > "$CASEWORK/outside.out" 2>&1
assert_exit 1 $? "a snapshot of a path outside the folder exits 1"
assert_contains "$CASEWORK/outside.out" 'outside your growth-engine folder' "the outside refusal says why"
assert_contains "$CASEWORK/outside.out" '→ run:' "the outside refusal carries a recovery line"

# 8. A restore with more than one stamp to choose from refuses and lists them,
#    rather than picking one and overwriting the file the founder can still see.
sh "$GE" restore founder-brain.md > "$CASEWORK/ambiguous.out" 2>&1
assert_exit 1 $? "an ambiguous restore exits 1"
assert_contains "$CASEWORK/ambiguous.out" 'so ge will not pick one for you' "the ambiguous restore refuses"
assert_contains "$CASEWORK/ambiguous.out" '→ run:' "the ambiguous restore carries a recovery line"

# 9. The whole tree. The ring is listed as a folder and its contents counted
#    above, because ten copies of one file all carry the same scrubbed name.
assert_tree "$FIX/expect" "$SANDBOX" "the folder after a snapshot, an undo and a full ring"

t_done
