#!/bin/sh
# 06-ledger.sh — golden test for ge ledger: the rows, and every enum refusal.
#
# WHY IT EXISTS: the publish flow posts approved rows only, so a value the
#                ledger accepts today and cannot use later is a piece that never
#                gets scheduled and a founder who never learns why. The refusals
#                are therefore the product, not the guard rail, and a refusal
#                that does not name the values that would have worked leaves the
#                founder guessing at an event where nobody has time to guess.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/06-ledger/   WRITES: tests/.work/<shell>/06-ledger/
# POSTURE:       fail-closed. After every refusal the ledger is compared byte for
#                byte with what it held before, because a refusal that half wrote
#                is worse than one that did not refuse at all.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# For rl_ends, which tells the two recovery shapes apart. The three refusals
# below name a list and ask the founder to pick from it, and ge cannot know
# which one they meant, so those three end on a bare arrow rather than on a
# command. This case used to hold all three to carrying "→ run:", which is how
# "→ run: the same command again with one of those" lived here for weeks: a
# founder selected it, pasted it, and their shell answered about a command
# called "the".
. "$TESTS/lib/recovery.sh"

t_start 06-ledger
cd "$SANDBOX" || t_die "the sandbox for 06-ledger is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 1. Two pieces, one per lane.
sh "$GE" ledger add-content 1 1 short-post text > "$CASEWORK/add.out" 2>&1
assert_exit 0 $? "ge ledger add-content exits 0"
assert_files_equal "$FIX/expect.out/add.txt" "$CASEWORK/add.out" "add-content says what it added"
sh "$GE" ledger add-content 2 3 carousel media > /dev/null 2>&1
assert_exit 0 $? "a second piece exits 0"

# 2. A change that is allowed.
sh "$GE" ledger set-content 1 format long-post > "$CASEWORK/set.out" 2>&1
assert_exit 0 $? "ge ledger set-content exits 0"

cp growth-engine/ledger.md "$CASEWORK/before-refusals.keep"

# 3. A lane that does not exist. The refusal has to name both lanes.
sh "$GE" ledger set-content 1 lane carrier-pigeon > "$CASEWORK/lane.out" 2>&1
assert_exit 1 $? "an unknown lane exits 1"
assert_files_equal "$FIX/expect.out/lane.txt" "$CASEWORK/lane.out" "the lane refusal"
assert_contains "$CASEWORK/lane.out" 'text media' "the lane refusal names both lanes"
rl_ends "$CASEWORK/lane.out" bare "the lane refusal ends on guidance, not on a command to paste"

# 4. A status that does not exist. The refusal has to name all six.
sh "$GE" ledger set-content 1 status banana > "$CASEWORK/status.out" 2>&1
assert_exit 1 $? "an unknown status exits 1"
assert_files_equal "$FIX/expect.out/status.txt" "$CASEWORK/status.out" "the status refusal"
assert_contains "$CASEWORK/status.out" 'draft approved scheduled posted failed archived' \
  "the status refusal names all six statuses"
rl_ends "$CASEWORK/status.out" bare "the status refusal ends on guidance, not on a command to paste"

# 5. A field that does not exist. The refusal has to name the six fields.
sh "$GE" ledger set-content 1 vibe high > "$CASEWORK/field.out" 2>&1
assert_exit 1 $? "an unknown field exits 1"
assert_files_equal "$FIX/expect.out/field.txt" "$CASEWORK/field.out" "the field refusal"
assert_contains "$CASEWORK/field.out" 'pillar format lane status ghl_post_id scheduled_for' \
  "the field refusal names all six fields"
rl_ends "$CASEWORK/field.out" bare "the field refusal ends on guidance, not on a command to paste"

# 6. Approval is the one transition with a gate in front of it, and set-content
#    is not that gate. Letting it through means a piece reaching GoHighLevel
#    without ever being read again.
#
#    WHICH WAY OUT IS RIGHT DEPENDS ON THE FOLDER, and that is why it is asked
#    twice. There is no content-30.md here yet, which is where every founder in
#    the cohort sits between session 1 and session 2: the ledger has rows in it
#    and the words are what session 2 writes. ge ledger approve refuses outright
#    in that folder, so handing it over here would be a second refusal one paste
#    later. The same two refusals are driven again further down, once the words
#    are there, and there the answer has to be approve.
sh "$GE" ledger set-content 1 status approved > "$CASEWORK/approve.out" 2>&1
assert_exit 1 $? "set-content refuses to approve"
assert_contains "$CASEWORK/approve.out" 'content-30.md' \
  "and with no words written it says which file is missing"
assert_contains "$CASEWORK/approve.out" '→ take the content engine step' \
  "and the way out is the step that writes them"
assert_lacks "$CASEWORK/approve.out" 'ge ledger approve' \
  "and never approve, which refuses in a folder with no words in it"

# 7. A date the toolkit cannot read is refused at the door rather than in
#    GoHighLevel three weeks later with nothing to explain it.
sh "$GE" ledger set-content 1 scheduled_for tomorrow > "$CASEWORK/date.out" 2>&1
assert_exit 1 $? "a date it cannot read exits 1"
assert_contains "$CASEWORK/date.out" '→ run:' "the date refusal carries a recovery line"

# 8. A piece that is not there.
sh "$GE" ledger set-content 99 format short-post > "$CASEWORK/noid.out" 2>&1
assert_exit 1 $? "an id that is not there exits 1"
assert_contains "$CASEWORK/noid.out" '→ run: ge ledger list C' "the refusal points at the list"

# 9. Not one of those refusals touched the file.
assert_bytes_equal "$CASEWORK/before-refusals.keep" growth-engine/ledger.md \
  "six refusals leave the ledger byte for byte"

# 10. A date it can read is taken.
sh "$GE" ledger set-content 2 scheduled_for 2026-09-25T09:00 > /dev/null 2>&1
assert_exit 0 $? "a date shaped 2026-09-25T09:00 is taken"

sh "$GE" ledger list C > "$CASEWORK/list.out" 2>&1
assert_exit 0 $? "ge ledger list C exits 0"
assert_files_equal "$FIX/expect.out/list.txt" "$CASEWORK/list.out" "the list of pieces"
# The list is what a founder reads. It used to be compared against the stored
# row, pipe characters and all, which held the list to the one thing it must not
# do: hand somebody the file format and let them work out which value is which.
assert_lacks "$CASEWORK/list.out" 'C|2|3' "the list does not show a founder the stored row"
# The scrub turns any date into a token, so the date that was actually stored is
# checked here as raw bytes. Against the file rather than the list, because
# storage is what this step is about.
assert_contains growth-engine/ledger.md 'C|2|3|carousel|media|draft|-|2026-09-25T09:00' \
  "the date is stored exactly as it was given"

# 11. The whole tree, as it stands after two pieces and six refusals. Everything
#     below writes more, so it runs here rather than at the end.
assert_tree "$FIX/expect" "$SANDBOX" "the folder after two pieces and six refusals"

# 12. A ledger.md whose last byte is not a line break. Any editor can save one,
#     and this used to take the new row onto the end of whatever the founder had
#     typed: their sentence gained a row of ge's data, the piece was in no list
#     and could not be approved, and add-content said it had worked.
printf 'pillar 3 is the founder story' >> growth-engine/ledger.md
sh "$GE" ledger add-content 3 3 short-post text > "$CASEWORK/glue.out" 2>&1
assert_exit 0 $? "a piece can be added to a ledger that does not end in a line break"
assert_contains growth-engine/ledger.md 'pillar 3 is the founder story' \
  "the founder's own last line is still their own last line"
assert_lacks growth-engine/ledger.md 'founder storyC' \
  "the new row is not stuck onto the end of it"
sh "$GE" ledger list C > "$CASEWORK/glue-list.out" 2>&1
assert_contains "$CASEWORK/glue-list.out" '3          3      short-post' \
  "and the piece it says it added is in the list"

# 13. Approve is the only way a piece becomes approved, so a draft cannot be
#     marked scheduled or posted. Those are the two that put a piece in front of
#     an audience, and letting them through from draft meant a piece nobody had
#     read going out with no approval recorded anywhere.
cp growth-engine/ledger.md "$CASEWORK/before-gate.keep"
sh "$GE" ledger set-content 3 status scheduled > "$CASEWORK/sched.out" 2>&1
assert_exit 1 $? "a draft cannot be marked scheduled"
# Still no words in this folder, so the way out is the same as section 6's.
assert_contains "$CASEWORK/sched.out" '→ take the content engine step' \
  "and with no words written the way out is the step that writes them"
assert_lacks "$CASEWORK/sched.out" 'ge ledger approve' \
  "and never approve, which refuses in a folder with no words in it"
sh "$GE" ledger set-content 3 status posted > "$CASEWORK/posted.out" 2>&1
assert_exit 1 $? "a draft cannot be marked posted"
assert_bytes_equal "$CASEWORK/before-gate.keep" growth-engine/ledger.md \
  "and neither refusal touched the ledger"

# 14. Approving says it approved the words in content-30.md, so there have to be
#     some. With no file it used to say so anyway and exit 0.
sh "$GE" ledger approve 3 > "$CASEWORK/nowords.out" 2>&1
assert_exit 1 $? "approve refuses when there are no words to approve"
assert_contains "$CASEWORK/nowords.out" 'content-30.md' "and it names the file that is missing"
assert_absent growth-engine/.state/approved-at "and no approval was recorded"

printf 'thirty pieces, one a day\n' > growth-engine/content-30.md

# 14b. The same two refusals as sections 6 and 13, in the folder a founder has
#      after session 2. Piece 3 is still a draft and the words are written now,
#      so approve is a command that runs and this is where it belongs. The
#      answer to the same typing changes with the state of the folder, which is
#      the whole reason both states are driven.
sh "$GE" ledger set-content 3 status scheduled > "$CASEWORK/sched-words.out" 2>&1
assert_exit 1 $? "a draft still cannot be marked scheduled once the words are there"
assert_contains "$CASEWORK/sched-words.out" '→ run: ge ledger approve 3' \
  "and now the way out names approve, with the id the founder used"
rl_ends "$CASEWORK/sched-words.out" run "and it ends on a command, and on nothing else"
sh "$GE" ledger set-content 1 status approved > "$CASEWORK/approve-words.out" 2>&1
assert_exit 1 $? "set-content still refuses to approve once the words are there"
assert_contains "$CASEWORK/approve-words.out" '→ run: ge ledger approve 1' \
  "and it hands over approve for the piece that was named"
rl_ends "$CASEWORK/approve-words.out" run "and it ends on a command, and on nothing else"

sh "$GE" ledger approve 3 > "$CASEWORK/approve1.out" 2>&1
assert_exit 0 $? "approve works once the words are there"
assert_contains "$CASEWORK/approve1.out" 'Approved piece 3.' "and it says what it approved"

# 15. The approval is of the words as they read today, so a founder who edits
#     them has to be able to say so. ge lint tells them to run exactly this, and
#     it used to refuse because nothing was a draft any more.
sh "$GE" ledger approve --all-text > "$CASEWORK/again.out" 2>&1
assert_exit 0 $? "an already approved piece can be approved again"
assert_contains "$CASEWORK/again.out" 'already approved' "and it says plainly that it was already approved"

# 16. Now that piece 3 is approved, scheduled is allowed.
sh "$GE" ledger set-content 3 status scheduled > /dev/null 2>&1
assert_exit 0 $? "an approved piece can be marked scheduled"

# 17. A filter that matches nothing says so rather than printing a blank line.
sh "$GE" ledger list C --status failed > "$CASEWORK/nofilter.out" 2>&1
assert_exit 0 $? "a filter that matches nothing still exits 0"
assert_contains "$CASEWORK/nofilter.out" 'failed' "and it says what nothing is at"
assert_contains "$CASEWORK/nofilter.out" '→ run:' "and names what to run to see the rest"

# 18. An empty ledger says so. It used to print nothing at all, and a founder
#     could not tell that from a command that had broken. Done last, because it
#     takes every row back out of the file.
grep -v '^C|' growth-engine/ledger.md > "$CASEWORK/rowless"
cp "$CASEWORK/rowless" growth-engine/ledger.md
sh "$GE" ledger list C > "$CASEWORK/emptylist.out" 2>&1
assert_exit 0 $? "ge ledger list C on an empty ledger exits 0"
assert_contains "$CASEWORK/emptylist.out" 'no content pieces yet' "and says there is nothing there yet"
assert_contains "$CASEWORK/emptylist.out" '→ take the content engine step' \
  "and names the step that fills it"

t_done
