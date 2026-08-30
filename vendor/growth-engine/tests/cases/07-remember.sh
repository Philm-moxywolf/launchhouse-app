#!/bin/sh
# 07-remember.sh — golden test for ge remember: the block, the prose, the hold rule.
#
# WHY IT EXISTS: memory.md is the one file ge and the founder both write. Three
#                failures here cost a founder their own words. Writing outside
#                the markers reflows a paragraph they wrote by hand. Guessing
#                where a half marked block ends deletes whatever sits after the
#                start marker. Amending an entry whose text has moved leaves two
#                lines that disagree with no way to tell which one is current.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/07-remember/   WRITES: tests/.work/<shell>/07-remember/
# POSTURE:       fail-closed. Every refusal is followed by a byte comparison of
#                the file, because a refusal that half wrote is the worst case.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# For rl_ends. Three of the four refusals below end on a command. The fourth is
# the half marked block, and that one cannot: where the founder's own section
# stops is the one thing ge does not know, so the line is guidance and the shape
# is asserted rather than assumed.
. "$TESTS/lib/recovery.sh"

t_start 07-remember
cd "$SANDBOX" || t_die "the sandbox for 07-remember is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
# A memory.md with the founder's own writing in it, above the blocks, between
# them, and under the Notes heading. Everything ge does below has to leave all
# three exactly where they are.
t_seed

# 1. An entry lands inside the block it belongs to.
sh "$GE" remember decision "b2b track, my buyers are agencies" > "$CASEWORK/add.out" 2>&1
assert_exit 0 $? "ge remember decision exits 0"
assert_files_equal "$FIX/expect.out/add.txt" "$CASEWORK/add.out" "ge remember echoes what it kept"

sh "$GE" remember voice "no exclamation marks, ever" --detail "ops-log.md" > /dev/null 2>&1
assert_exit 0 $? "ge remember voice with a detail pointer exits 0"

# 2. The founder's own writing is still there, word for word.
assert_contains growth-engine/memory.md 'This is my own paragraph above the blocks.' \
  "prose above the blocks survives"
assert_contains growth-engine/memory.md 'I wrote this between two sections and it is mine.' \
  "prose between two blocks survives"
assert_contains growth-engine/memory.md 'A note of my own, under my own heading.' \
  "prose under the Notes heading survives"

# 3. A snapshot was taken before the write. No snapshot, no write.
assert_snapshots memory.md 2 "each write to memory.md took a backup first"

sh "$GE" remember list > "$CASEWORK/list.out" 2>&1
assert_exit 0 $? "ge remember list exits 0"
assert_files_equal "$FIX/expect.out/list.txt" "$CASEWORK/list.out" "the list of what is remembered"

# 4. The hold rule. An entry that does not say what the caller expected is an
#    entry the founder reworded, and writing over it is how two lines end up
#    disagreeing.
cp growth-engine/memory.md "$CASEWORK/before-hold.keep"
sh "$GE" remember --amend decision 1 "something else entirely" --expect "not what it says" \
  > "$CASEWORK/hold.out" 2>&1
assert_exit 1 $? "an amend against a missed anchor exits 1"
assert_files_equal "$FIX/expect.out/hold.txt" "$CASEWORK/hold.out" "the hold refusal"
assert_contains "$CASEWORK/hold.out" 'looked for: not what it says' "the refusal says what it looked for"
assert_contains "$CASEWORK/hold.out" 'found:      b2b track, my buyers are agencies' \
  "the refusal says what it found instead"
rl_ends "$CASEWORK/hold.out" run "the hold refusal ends on a command, and on nothing else"
assert_bytes_equal "$CASEWORK/before-hold.keep" growth-engine/memory.md \
  "the held amend changed nothing at all"

# 4b. And the same rule when nothing is said at all. Section 08 makes matching
#     the words the rule for an amend, not an option, so an amend that only says
#     "entry 1" is refused. Position is not proof: the founder rewords a line in
#     the morning, a skill amends "entry 1" in the afternoon, and without this
#     their wording is gone with nothing said.
sh "$GE" remember --amend decision 1 "something else entirely" \
  > "$CASEWORK/noexpect.out" 2>&1
assert_exit 1 $? "an amend with nothing to match against exits 1"
assert_contains "$CASEWORK/noexpect.out" 'has to say what the entry reads now' \
  "the refusal says what is missing"
assert_contains "$CASEWORK/noexpect.out" 'it reads now: b2b track, my buyers are agencies' \
  "and shows the words to give it"
rl_ends "$CASEWORK/noexpect.out" run "and it ends on a command, and on nothing else"
assert_bytes_equal "$CASEWORK/before-hold.keep" growth-engine/memory.md \
  "and it changed nothing at all"

# 5. The same amend with the right anchor goes through.
sh "$GE" remember --amend decision 1 "b2b track, my buyers are agency owners" \
  --expect "b2b track, my buyers are agencies" > "$CASEWORK/amend.out" 2>&1
assert_exit 0 $? "an amend against the right anchor exits 0"
assert_files_equal "$FIX/expect.out/amend.txt" "$CASEWORK/amend.out" "the amend says what changed"

# 6. A kind that does not exist is refused, and the refusal names all six.
sh "$GE" remember feelings "hopeful" > "$CASEWORK/badkind.out" 2>&1
assert_exit 1 $? "an unknown kind exits 1"
assert_contains "$CASEWORK/badkind.out" 'decision worked didnot voice angle thread' \
  "the refusal names all six kinds"
rl_ends "$CASEWORK/badkind.out" run "the kind refusal ends on a command, and on nothing else"

# 7. A half marked block. The END marker for WORKED is taken out by hand, the
#    way a founder deleting a line they did not understand would take it out.
#    ge must refuse rather than work out where the section stops, because
#    whatever it guessed would swallow the founder's own paragraph below it.
sed '/GE:WORKED:END/d' growth-engine/memory.md > "$CASEWORK/damaged" \
  || t_die "the damaged memory.md could not be prepared." "sh tests/run.sh again"
cp "$CASEWORK/damaged" growth-engine/memory.md
cp growth-engine/memory.md "$CASEWORK/before-half.keep"

sh "$GE" remember worked "the short posts got replies" > "$CASEWORK/half.out" 2>&1
assert_exit 1 $? "a half marked block exits 1"
assert_files_equal "$FIX/expect.out/half.txt" "$CASEWORK/half.out" "the half marked block refusal"
assert_contains "$CASEWORK/half.out" 'holds one <!-- GE:WORKED:START --> line and no <!-- GE:WORKED:END --> lines' "the refusal says what is wrong"
assert_contains "$CASEWORK/half.out" 'Guessing where that section starts and stops could delete your own writing.' \
  "the refusal says why it will not guess"
rl_ends "$CASEWORK/half.out" bare "the half marked block refusal ends on guidance, not on a command to paste"
assert_contains "$CASEWORK/half.out" '<!-- GE:WORKED:END -->' \
  "and the guidance names the exact line the founder has to put back"
assert_bytes_equal "$CASEWORK/before-half.keep" growth-engine/memory.md \
  "the half marked block was left exactly as it was found"
assert_snapshots memory.md 3 "the refused write took no further backup beyond the amend"

# 8. A block that is whole still works while another one is damaged. A founder
#    with one broken section must not lose the use of the other five.
sh "$GE" remember angle "the cost of doing it by hand" > /dev/null 2>&1
assert_exit 0 $? "another block still takes an entry while one is damaged"

# 9. The whole tree, damaged block and all. The fixture is the record that ge
#    left the damage alone rather than tidying it away.
assert_tree "$FIX/expect" "$SANDBOX" "the folder after two entries, an amend and two refusals"

t_done
