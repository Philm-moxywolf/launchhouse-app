#!/bin/sh
# 05-log.sh — golden test for ge log: the day heading, and the four kinds.
#
# WHY IT EXISTS: the ops log is append only and is the only complete record of
#                what a founder did. Two failures here are silent and permanent.
#                A day heading written twice makes the file unreadable by the
#                third week. A day heading reused from further up the file files
#                today's entry under a day the founder has already scrolled past,
#                and an append-only file cannot be corrected afterwards.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/05-log/   WRITES: tests/.work/<shell>/05-log/
# POSTURE:       fail-closed. The whole log is compared, and the count of day
#                headings is asserted as a number rather than eyeballed.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 05-log
cd "$SANDBOX" || t_die "the sandbox for 05-log is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 1. Three entries on the same day get one heading between them.
sh "$GE" log decision "picked the b2b track, my buyers are agencies" > "$CASEWORK/one.out" 2>&1
assert_exit 0 $? "ge log decision exits 0"
sh "$GE" log result "sent 25 emails" > /dev/null 2>&1
sh "$GE" log blocker "waiting on the list" > /dev/null 2>&1
assert_files_equal "$FIX/expect.out/one.txt" "$CASEWORK/one.out" "ge log echoes the entry it filed"
assert_equals 1 "$(grep -c '^## ' growth-engine/ops-log.md)" "three entries on one day share one heading"

# 2. A heading from another day is never reopened. Today's entry gets today's
#    heading even though an older one is already in the file.
printf '\n## 2020-01-01\n\n- 09:00 note: an entry from long ago\n' >> growth-engine/ops-log.md
sh "$GE" log note "back again after a long gap" > /dev/null 2>&1
assert_exit 0 $? "logging after an old heading exits 0"
assert_equals 3 "$(grep -c '^## ' growth-engine/ops-log.md)" "a new day gets its own heading"
assert_contains growth-engine/ops-log.md '## 2020-01-01' "the old heading is left where it was"
assert_contains growth-engine/ops-log.md '- 09:00 note: an entry from long ago' "the old entry is left where it was"

# 3. A fourth entry today joins the heading just written, rather than making
#    another one.
sh "$GE" log note "and one more" > /dev/null 2>&1
assert_equals 3 "$(grep -c '^## ' growth-engine/ops-log.md)" "the next entry joins the heading just written"

# 4. A kind that is not one of the four is refused, and the refusal names all
#    four. A refusal that does not say what would have worked is a dead end.
sh "$GE" log shout "hello" > "$CASEWORK/badkind.out" 2>&1
assert_exit 1 $? "an unknown kind exits 1"
assert_files_equal "$FIX/expect.out/badkind.txt" "$CASEWORK/badkind.out" "the unknown kind refusal"
assert_contains "$CASEWORK/badkind.out" 'decision, result, blocker, note' "the refusal names the four kinds"
assert_contains "$CASEWORK/badkind.out" '→ run:' "the refusal carries a recovery line"

# 5. An entry with no text is refused. A blank line in an append-only file
#    cannot be taken out later.
sh "$GE" log note "   " > "$CASEWORK/empty.out" 2>&1
assert_exit 1 $? "an entry with no text exits 1"
assert_contains "$CASEWORK/empty.out" '→ run:' "the empty entry refusal carries a recovery line"

# 6. Nothing that was refused reached the file.
assert_equals 0 "$(grep -c 'shout' growth-engine/ops-log.md || true)" "a refused entry is not in the log"

# 7. The watermark. It is the only thing that can prove afterwards that the log
#    got shorter, and by then the entries it lost are already gone.
assert_equals "$(wc -c < growth-engine/ops-log.md | tr -d ' ')" \
              "$(cat growth-engine/.state/log.bytes)" "the watermark matches the log size"

# 8. The whole tree, log and all.
assert_tree "$FIX/expect" "$SANDBOX" "the folder after five log entries"

# 9. A log saved the Windows way and then saved back the other way is smaller in
#    bytes without having lost a word. Neither ge log nor the mark it keeps may
#    read that as the log having been cut: a founder told their only complete
#    record was shortened goes looking for a copy to put back, and this file is
#    only ever added to, so there is no copy to find. Left until after the tree
#    so the fixture above stays the plain five entry folder.
awk '{ printf "%s\r\n", $0 }' growth-engine/ops-log.md > "$CASEWORK/crlf" \
  || t_die "the Windows copy of the log could not be made." "sh tests/run.sh again"
cp "$CASEWORK/crlf" growth-engine/ops-log.md \
  || t_die "the Windows copy of the log could not be put in place." "sh tests/run.sh again"
sh "$GE" log note "written while the file had Windows endings" > "$CASEWORK/crlf.out" 2>&1
assert_exit 0 $? "ge log into a file with Windows endings exits 0"
assert_equals 0 "$(grep -c '^WARN' "$CASEWORK/crlf.out")" \
  "and says nothing about the log having been shortened"

tr -d '\r' < growth-engine/ops-log.md > "$CASEWORK/lf" \
  || t_die "the endings could not be taken back off." "sh tests/run.sh again"
before=$(grep -c '^- ' growth-engine/ops-log.md)
cp "$CASEWORK/lf" growth-engine/ops-log.md \
  || t_die "the converted log could not be put in place." "sh tests/run.sh again"
sh "$GE" log note "written after the endings went back" > "$CASEWORK/lf.out" 2>&1
assert_exit 0 $? "ge log after the endings changed back exits 0"
assert_equals 0 "$(grep -c '^WARN' "$CASEWORK/lf.out")" \
  "a line ending change is not reported as the log having been cut"
assert_equals "$((before + 1))" "$(grep -c '^- ' growth-engine/ops-log.md)" \
  "and every entry is still in the file"

# 10. A log that really was cut is still caught, so the mark has not been turned
#     off, only pointed at the words instead of the endings.
head -4 growth-engine/ops-log.md > "$CASEWORK/cut" \
  || t_die "the shortened log could not be made." "sh tests/run.sh again"
cp "$CASEWORK/cut" growth-engine/ops-log.md \
  || t_die "the shortened log could not be put in place." "sh tests/run.sh again"
sh "$GE" log note "written after somebody cut the file" > "$CASEWORK/cut.out" 2>&1
assert_exit 0 $? "ge log still saves the entry after the file was cut"
assert_contains "$CASEWORK/cut.out" 'Something other than ge made it shorter.' \
  "and says the log was made shorter by something other than ge"
assert_contains "$CASEWORK/cut.out" 'ge keeps no backup of it to put back' \
  "and says plainly that there is no backup of the log to reach for"

t_done
