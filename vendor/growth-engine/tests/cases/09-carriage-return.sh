#!/bin/sh
# 09-carriage-return.sh — golden test: a Windows line ending breaks no parse.
#
# WHY IT EXISTS: roughly half the cohort is on Windows, and the moment one of
#                them opens memory.md or ledger.md in Notepad and saves it, every
#                line in the file gains a carriage return. If a parse takes that
#                byte as part of the last field, a status stops matching, a day
#                heading stops matching itself and a second one is written, and a
#                managed block marker stops being found at all. None of that
#                announces itself. It shows up as the toolkit quietly not working
#                for one founder at the event, with three days to fix it.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/09-carriage-return/   WRITES: tests/.work/<shell>/09-carriage-return/
# POSTURE:       fail-closed. Every founder file is rewritten with CRLF endings
#                first, and then every reader is run against it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. awk adds the carriage return,
#                because sed -i is not portable and unix2dos is not everywhere.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 09-carriage-return
cd "$SANDBOX" || t_die "the sandbox for 09-carriage-return is not there." "sh tests/run.sh again"

# crlf <file>: every line ending becomes CRLF, the way a Windows editor saves it.
crlf() {
  awk '{ sub(/\r$/, ""); printf "%s\r\n", $0 }' "$1" > "$1.crlf" && mv "$1.crlf" "$1"
}

# cr_count <file>: how many lines really carry a carriage return. Asserting this
# is what stops the case passing because the conversion silently did nothing.
cr_count() {
  awk '/\r$/ { n = n + 1 } END { print n + 0 }' "$1"
}

# The same count, split at the first "## " line of a person file. Above that line
# the file is ge's and comes back the way ge writes it. From that line down it is
# the founder's, and the first line of every person file promises ge never writes
# there, so ge person set copies it back byte for byte instead of reading it out
# and printing it again.
cr_count_head() {
  awk '/^## / { exit } /\r$/ { n = n + 1 } END { print n + 0 }' "$1"
}
cr_count_yours() {
  awk '/^## / { f = 1 } f && /\r$/ { n = n + 1 } END { print n + 0 }' "$1"
}

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

sh "$GE" log note "written before the file was saved on Windows" > /dev/null 2>&1
sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1
sh "$GE" person add prospect sam@northfield.io "Sam Carter" --company "Northfield" > /dev/null 2>&1

# Every founder file, saved the Windows way. The anchor too: it is read on every
# single command, so a carriage return there breaks everything at once.
for f in memory.md ops-log.md ledger.md .state/HOME people/sam-northfield-io.md; do
  [ -f "growth-engine/$f" ] || t_die "growth-engine/$f was never created." "sh tests/run.sh --update and read the diff"
  crlf "growth-engine/$f"
done
assert_equals 4 "$(cr_count growth-engine/ledger.md)" "the ledger really did gain carriage returns"
assert_equals 1 "$(cr_count growth-engine/.state/HOME)" "the anchor really did gain one"

# 1. The anchor still resolves, so ge still knows where the folder is.
sh "$GE" log note "written after the file was saved on Windows" > "$CASEWORK/log.out" 2>&1
assert_exit 0 $? "ge log works with a carriage return in the anchor"
assert_files_equal "$FIX/expect.out/log.txt" "$CASEWORK/log.out" "the entry it filed"

# 2. The day heading still matches itself, so a second one is not written. This
#    is the one that would go unnoticed for a fortnight.
assert_equals 1 "$(grep -c '^## ' growth-engine/ops-log.md)" \
  "the day heading is not written twice because of a carriage return"

# 3. The ledger still parses. The status field is the last one on the row, so a
#    carriage return lands inside it and stops it matching anything.
sh "$GE" ledger add-content 2 2 carousel media > /dev/null 2>&1
assert_exit 0 $? "a row can be added to a ledger saved on Windows"
#    archived rather than scheduled. A piece has to be approved before it can be
#    marked scheduled or posted, and this case is about carriage returns rather
#    than the approval gate. Any status a draft can move to reads the same field
#    back out of the same row.
sh "$GE" ledger set-content 1 status archived > /dev/null 2>&1
assert_exit 0 $? "a status can be changed on a row saved on Windows"
sh "$GE" ledger list C > "$CASEWORK/ledger.out" 2>&1
assert_exit 0 $? "ge ledger list works on a ledger saved on Windows"
assert_files_equal "$FIX/expect.out/ledger.txt" "$CASEWORK/ledger.out" "both rows read back"

# 4. The managed block markers are still found, so memory.md is still writable.
#    What the file carried before ge was asked to write into it. Both are read
#    here and checked at step 6, because the whole point of a marked block is
#    that the write lands between the markers and nowhere else.
mem_cr=$(cr_count growth-engine/memory.md)
assert_equals 31 "$mem_cr" "memory.md really did gain carriage returns"
sed -n '/^## Notes/,$p' growth-engine/memory.md > "$CASEWORK/before-notes.keep"
sh "$GE" remember decision "the toolkit survived Notepad" > "$CASEWORK/remember.out" 2>&1
assert_exit 0 $? "ge remember works on a memory.md saved on Windows"
assert_files_equal "$FIX/expect.out/remember.txt" "$CASEWORK/remember.out" "what it kept"
sh "$GE" remember list decision > "$CASEWORK/rlist.out" 2>&1
assert_exit 0 $? "ge remember list reads it back"
assert_contains "$CASEWORK/rlist.out" 'the toolkit survived Notepad' "the entry reads back whole"

# 5. The person file still parses, and the field it is keyed on still matches.
sh "$GE" person get sam@northfield.io > "$CASEWORK/get.out" 2>&1
assert_exit 0 $? "ge person get works on a file saved on Windows"
assert_contains "$CASEWORK/get.out" 'key: sam@northfield.io' "the key reads back with no stray byte"
#    What the founder's own section carried before ge was asked to write. The
#    write below must hand every one of those bytes back.
yours_cr=$(cr_count_yours growth-engine/people/sam-northfield-io.md)
assert_equals 14 "$yours_cr" "the founder's own section really did gain carriage returns"
sh "$GE" person set sam@northfield.io status contacted_ok > "$CASEWORK/set.out" 2>&1
assert_exit 0 $? "ge person set works on a file saved on Windows"
assert_files_equal "$FIX/expect.out/set.txt" "$CASEWORK/set.out" "the change it made"
sh "$GE" person list > "$CASEWORK/plist.out" 2>&1
assert_exit 0 $? "ge person list works on a file saved on Windows"
assert_contains "$CASEWORK/plist.out" 'contacted_ok' "the new status reads back, with no stray byte"

# 6. The files ge rewrote through a managed block, and the files it only
#    appended to, both keep the endings the founder's editor gave them. Both are
#    recorded here so a change to either one is a decision somebody made rather
#    than something that drifted.
#
#    This used to assert that memory.md came back with a count of 0, which is to
#    say that one ge remember rewrote every line in the file, the founder's own
#    paragraphs under "## Notes" included, from Windows endings to Unix ones.
#    memory.md tells the founder in as many words that everything under that
#    heading is theirs, and blocks.sh says everything outside the markers is
#    never touched, so the old count asserted the bug rather than the promise.
#    The count is now the one the file arrived with, plus the single line ge
#    added between the markers, which is written the way the file already reads.
assert_equals "$((mem_cr + 1))" "$(cr_count growth-engine/memory.md)" \
  "a file rewritten through its markers keeps the endings the founder's editor gave it"
sed -n '/^## Notes/,$p' growth-engine/memory.md > "$CASEWORK/after-notes"
assert_bytes_equal "$CASEWORK/before-notes.keep" "$CASEWORK/after-notes" \
  "and the founder's own section of memory.md comes back byte for byte"
#    A person file is two regions and the answer differs by region, so it is
#    counted by region. This used to assert a clean count over the whole file,
#    which asserted that ge person set rewrote the founder's own ## Yours section
#    as well. That is the one thing the file's own first line promises it never
#    does, so the count is now split at the boundary that promise is made on.
assert_equals 0 "$(cr_count_head growth-engine/people/sam-northfield-io.md)" \
  "the part of a person file ge owns comes back with clean line endings"
assert_equals "$yours_cr" "$(cr_count_yours growth-engine/people/sam-northfield-io.md)" \
  "and the founder's own section keeps every ending their editor gave it"
assert_equals 7 "$(cr_count growth-engine/ops-log.md)" \
  "an appended log keeps the endings the founder's editor gave the old lines"

# The watermark counts what the log says, not how its lines end. A folder carried
# between a Windows machine and a Mac has every ending rewritten, which changes
# the raw size of the file without losing a single entry. Counted raw, the mark
# then reads as a log that was cut, and the founder is told their only complete
# record has been shortened and sent looking for a backup that does not exist.
assert_equals "$(tr -d '\r' < growth-engine/ops-log.md | wc -c | tr -d ' ')" \
  "$(cat growth-engine/.state/log.bytes)" \
  "the log watermark leaves carriage returns out of the count"

# 7. The whole tree.
assert_tree "$FIX/expect" "$SANDBOX" "the folder after every file was saved the Windows way"

t_done
