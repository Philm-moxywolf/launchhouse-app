#!/bin/sh
# 08-person.sh — golden test for ge person: add, list, and the purge refusal.
#
# WHY IT EXISTS: these files hold real people's names, addresses and companies,
#                and one of the verbs destroys a file and every backup of it.
#                Purge acting on a live prospect would take a founder's only
#                record of someone they are mid-conversation with, and there is
#                nothing to put back. The gate in front of it is the product.
#                Keying on the address rather than the name is the other one:
#                two Sam Carters at two companies must never quietly merge.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/08-person/   WRITES: tests/.work/<shell>/08-person/
# POSTURE:       fail-closed. Every refusal is followed by a check that the file
#                is still there and still says what it said.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 08-person
cd "$SANDBOX" || t_die "the sandbox for 08-person is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 1. A prospect, keyed on their address. The address is lower cased on the way
#    in, so Sam.Carter@Northfield.io and sam.carter@northfield.io are one person.
sh "$GE" person add prospect Sam.Carter@Northfield.io "Sam Carter" \
  --company "Northfield" --why-them "runs ops for four agencies" > "$CASEWORK/add1.out" 2>&1
assert_exit 0 $? "ge person add prospect exits 0"
assert_files_equal "$FIX/expect.out/add1.txt" "$CASEWORK/add1.out" "adding a prospect"
assert_contains "$CASEWORK/add1.out" "Keep it to yourself and do not copy it anywhere else" \
  "the first person added carries the warning about the folder"

# 2. A target, keyed on platform and handle.
sh "$GE" person add target ig helen.makes "Helen Okafor" > "$CASEWORK/add2.out" 2>&1
assert_exit 0 $? "ge person add target exits 0"
assert_files_equal "$FIX/expect.out/add2.txt" "$CASEWORK/add2.out" "adding a target"

# 3. The same address again, spelled differently, is the same person and is
#    refused. A silent merge here is the failure this file is shaped to prevent.
sh "$GE" person add prospect SAM.CARTER@northfield.IO "Sam Carter" > "$CASEWORK/dup.out" 2>&1
assert_exit 1 $? "the same address twice exits 1"
assert_contains "$CASEWORK/dup.out" 'is already there' "the duplicate is named as already there"
assert_contains "$CASEWORK/dup.out" '→ run:' "the duplicate refusal carries a recovery line"

# 4. A prospect is keyed on an address, so something that is not one is refused.
sh "$GE" person add prospect "not-an-address" "Nobody" > "$CASEWORK/notemail.out" 2>&1
assert_exit 1 $? "a prospect with no address exits 1"
assert_contains "$CASEWORK/notemail.out" 'is not an email address' "the refusal says what is wrong"

# 5. A platform that is not one of the three.
sh "$GE" person add target myspace someone "Some One" > "$CASEWORK/badplat.out" 2>&1
assert_exit 1 $? "an unknown platform exits 1"
assert_contains "$CASEWORK/badplat.out" '→ run:' "the platform refusal carries a recovery line"

# 6. The list. Both people, one line each.
sh "$GE" person list > "$CASEWORK/list.out" 2>&1
assert_exit 0 $? "ge person list exits 0"
assert_files_equal "$FIX/expect.out/list.txt" "$CASEWORK/list.out" "the list of people"
assert_equals 2 "$(grep -c . "$CASEWORK/list.out")" "two people, two lines"

sh "$GE" person list --kind target > "$CASEWORK/list-target.out" 2>&1
assert_exit 0 $? "ge person list --kind target exits 0"
assert_equals 1 "$(grep -c . "$CASEWORK/list-target.out")" "filtering by kind narrows the list"

# 7. The purge refusal. Purge destroys the file and every backup, so it cannot
#    be the first thing a founder reaches for.
cp growth-engine/people/sam-carter-northfield-io.md "$CASEWORK/before-purge.keep"
sh "$GE" person purge sam.carter@northfield.io > "$CASEWORK/purge-refused.out" 2>&1
assert_exit 1 $? "purging a live prospect exits 1"
assert_files_equal "$FIX/expect.out/purge-refused.txt" "$CASEWORK/purge-refused.out" "the purge refusal"
assert_contains "$CASEWORK/purge-refused.out" 'purge only acts on stopped or cut' \
  "the refusal names the two statuses purge does act on"
assert_contains "$CASEWORK/purge-refused.out" '→ run: ge person set' "the refusal names the step before it"
assert_bytes_equal "$CASEWORK/before-purge.keep" growth-engine/people/sam-carter-northfield-io.md \
  "the refused purge left the file exactly as it was"

# 8. Purging someone who is not there.
sh "$GE" person purge nobody@nowhere.io > "$CASEWORK/purge-missing.out" 2>&1
assert_exit 2 $? "purging someone who is not there exits 2"
assert_contains "$CASEWORK/purge-missing.out" '→ run:' "that refusal carries a recovery line"

# 9. Stop them, then purge. The counts in the receipt are the whole record:
#    there is no log line to go and read afterwards.
sh "$GE" person set sam.carter@northfield.io status stopped > "$CASEWORK/stop.out" 2>&1
assert_exit 0 $? "setting the status to stopped exits 0"
assert_snapshots people/sam-carter-northfield-io.md 1 "changing a field took a backup first"

sh "$GE" person purge sam.carter@northfield.io > "$CASEWORK/purge.out" 2>&1
assert_exit 0 $? "purging a stopped prospect exits 0"
assert_files_equal "$FIX/expect.out/purge.txt" "$CASEWORK/purge.out" "the purge receipt"
assert_contains "$CASEWORK/purge.out" 'This cannot be undone' "the receipt says it cannot be undone"
assert_absent growth-engine/people/sam-carter-northfield-io.md "the person file is gone"
assert_snapshots people/sam-carter-northfield-io.md 0 "and every backup of it is gone too"

# 10. The other person is untouched. Purge acts on one file, never on a folder.
assert_contains growth-engine/people/ig-helen-makes.md 'key: ig:helen.makes' "the other person is still there"

# 11. The whole tree.
assert_tree "$FIX/expect" "$SANDBOX" "the folder after two people, five refusals and one purge"

t_done
