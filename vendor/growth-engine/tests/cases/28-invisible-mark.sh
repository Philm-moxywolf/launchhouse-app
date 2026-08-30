#!/bin/sh
# 28-invisible-mark.sh: the mark Windows puts at the start of a file changes nothing.
#
# WHY IT EXISTS: Notepad's "UTF-8" save and PowerShell redirection both put three
#                bytes at the very start of a file, and every editor on earth
#                draws them as nothing at all. Git Bash founders are the stated
#                floor of this programme, so a fair number of these files will
#                come back carrying it. It used to turn a perfectly good prospect
#                file into MALFORMED and send the founder to fix a line that
#                looks correct on their screen, and on the anchor it produced a
#                doctor that printed the same folder path twice and called them
#                different. A founder cannot see the cause, cannot delete what
#                they cannot see, and the advice they were given deleted the
#                header comment instead.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/28-invisible-mark/
# POSTURE:       fail-closed. Every answer is taken twice from the same folder,
#                once before the mark is added and once after, and compared. A
#                difference of any kind is a failure, because the founder changed
#                nothing they can see.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. The three bytes are written
#                from octal escapes so this file stays plain ASCII.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 28-invisible-mark
cd "$SANDBOX" || t_die "the sandbox for 28-invisible-mark is not there." "sh tests/run.sh again"

# mark <file>: the file as a Windows editor saves it.
mark() {
  printf '\357\273\277' > "$CASEWORK/bom" || t_die "the mark could not be written." "df -h ${TMPDIR:-/tmp}"
  cat "$CASEWORK/bom" "$1" > "$1.marked" && mv "$1.marked" "$1"
}

# marked <file>: true when the file starts with it, so a helper that quietly did
# nothing cannot leave this case passing on a file it never changed.
marked() {
  [ "$(dd if="$1" bs=1 count=3 2>/dev/null | od -An -b | tr -d ' \n')" = '357273277' ]
}

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
sh "$GE" person add prospect bo@northfield.io "Bo Mensah" --company "Northfield" > /dev/null 2>&1 \
  || t_die "the prospect could not be added." "sh tests/run.sh again"
sh "$GE" remember decision "picked b2b, my buyers are agencies" > /dev/null 2>&1
sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1
sh "$GE" log note "day one, picked the b2b track" > /dev/null 2>&1
sh "$GE" index > /dev/null 2>&1

PF="$SANDBOX/growth-engine/people/bo-northfield-io.md"

# What ge says about the folder before anything invisible is added to it. Taken
# from this folder rather than a second one, so the paths in both answers are the
# same and any difference at all is the mark and nothing else.
sh "$GE" check > "$CASEWORK/check.before" 2>&1
sh "$GE" lint > "$CASEWORK/lint.before" 2>&1
sh "$GE" person list > "$CASEWORK/plist.before" 2>&1
sh "$GE" person get bo@northfield.io > "$CASEWORK/pget.before" 2>&1
sh "$GE" context > "$CASEWORK/context.before" 2>&1
sh "$GE" ledger list C > "$CASEWORK/ledger.before" 2>&1

# ---------------------------------------------------------------- the anchor

mark "$SANDBOX/growth-engine/.state/HOME"
marked "$SANDBOX/growth-engine/.state/HOME" && t_pass || \
  t_fail "the mark was never added to the anchor, so this section proves nothing"

sh "$GE" check > "$CASEWORK/check.anchor" 2>&1
assert_exit 0 $? "a marked anchor is still the folder ge is standing in"
assert_contains "$CASEWORK/check.anchor" 'PASS  anchor' "and the doctor says so"
assert_bytes_equal "$CASEWORK/check.before" "$CASEWORK/check.anchor" \
  "and the whole report reads exactly as it did before the mark was added"

sh "$GE" context > "$CASEWORK/context.anchor" 2>&1
assert_bytes_equal "$CASEWORK/context.before" "$CASEWORK/context.anchor" \
  "and the session summary does not start saying this is the wrong folder"

sh "$GE" log note "written with a marked anchor" > "$CASEWORK/log.anchor" 2>&1
assert_exit 0 $? "and a write still lands"
assert_contains "$SANDBOX/growth-engine/ops-log.md" 'written with a marked anchor' \
  "and it lands in the folder the founder is in"

# ------------------------------------------------------------ a person file

mark "$PF"
marked "$PF" && t_pass || t_fail "the mark was never added to the person file"

sh "$GE" person list > "$CASEWORK/plist.after" 2>&1
assert_exit 0 $? "a marked person file still lists"
assert_bytes_equal "$CASEWORK/plist.before" "$CASEWORK/plist.after" \
  "and the row reads exactly as it did before"
assert_lacks "$CASEWORK/plist.after" 'MALFORMED' "and the person is not called malformed"

sh "$GE" person get bo@northfield.io > "$CASEWORK/pget.after" 2>&1
assert_exit 0 $? "a marked person file still reads"
assert_contains "$CASEWORK/pget.after" 'key: bo@northfield.io' "and the key comes back whole"

sh "$GE" lint > "$CASEWORK/lint.after" 2>&1
assert_bytes_equal "$CASEWORK/lint.before" "$CASEWORK/lint.after" \
  "and the linter says exactly what it said before three invisible bytes were added"
assert_lacks "$CASEWORK/lint.after" 'line 1' \
  "and it does not send the founder to fix a line that looks perfectly correct"

sh "$GE" person note bo@northfield.io "wants a demo in September" > "$CASEWORK/note.after" 2>&1
assert_exit 0 $? "a marked person file still takes a note"
assert_contains "$PF" 'wants a demo in September' "and the note is on disk"
marked "$PF" && t_pass || t_fail "the mark the founder's editor put there was taken out from under them"

sh "$GE" person touch bo@northfield.io email out "sent the opener" > "$CASEWORK/touch.after" 2>&1
assert_exit 0 $? "and a touch"
sh "$GE" person set bo@northfield.io status contacted_ok > "$CASEWORK/set.after" 2>&1
assert_exit 0 $? "and a field change"
assert_contains "$PF" 'status: contacted_ok' "which is on disk"
marked "$PF" && t_pass || t_fail "a field change took the mark out from under them"

sh "$GE" person export firstlines > "$CASEWORK/export.after" 2>&1
assert_exit 0 $? "and the outreach sheet is still written"
assert_contains "$SANDBOX/growth-engine/outreach-firstlines.csv" 'bo@northfield.io' \
  "with the prospect on it"

# --------------------------------------------------- the files ge writes into

mark "$SANDBOX/growth-engine/memory.md"
mark "$SANDBOX/growth-engine/ledger.md"
marked "$SANDBOX/growth-engine/memory.md" && t_pass || t_fail "the mark was never added to memory.md"

sh "$GE" remember worked "the short posts got replies" > "$CASEWORK/rem.after" 2>&1
assert_exit 0 $? "a marked memory.md still takes an entry"
assert_contains "$SANDBOX/growth-engine/memory.md" 'the short posts got replies' "and it is on disk"
sh "$GE" remember list decision > "$CASEWORK/rlist.after" 2>&1
assert_contains "$CASEWORK/rlist.after" 'picked b2b, my buyers are agencies' \
  "and what was there before still reads back"

sh "$GE" ledger add-content 2 2 carousel media > "$CASEWORK/ladd.after" 2>&1
assert_exit 0 $? "a marked ledger still takes a piece"
sh "$GE" ledger list C > "$CASEWORK/ledger.after" 2>&1
assert_equals 2 "$(grep -c '^[0-9]' "$CASEWORK/ledger.after")" "and both pieces read back"

# Nothing anywhere may show the founder a token from inside the parser. The mark
# is invisible, so a message about it is unanswerable in a way that ordinary bad
# input is not.
for f in plist.after pget.after lint.after note.after set.after; do
  assert_lacks "$CASEWORK/$f" 'BADLINE' "no parser tag reaches the founder in $f"
done

t_done
