#!/bin/sh
# 26-founder-prose.sh: the founder's own writing, held to the byte, all the way through.
#
# WHY IT EXISTS: memory.md says in as many words "Anything below this heading is
#                yours. ge never writes here", every person file says the same
#                about ## Yours, and the whole marked-block idea exists so that
#                everything outside the markers is copied through untouched. All
#                three of those promises were being broken by ordinary commands,
#                and nothing caught it because no case ever put real writing in
#                those places and then compared the bytes. The prose here is
#                deliberately awkward in the ways real writing is: trailing
#                spaces an editor left, a tab, a blank line, an accented name, a
#                line that starts like one of ge's own entries, and a heading of
#                their own. Every one of those is a thing a careless rewrite
#                would tidy up, and tidying up somebody's notes without being
#                asked is the failure.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/26-founder-prose/
# POSTURE:       fail-closed. Compared with cmp after every write, never with a
#                grep for a phrase. A phrase survives a rewrite that changed
#                every space and every ending around it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 26-founder-prose
cd "$SANDBOX" || t_die "the sandbox for 26-founder-prose is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
sh "$GE" log note "day one, picked the b2b track" > /dev/null 2>&1
sh "$GE" remember decision "picked b2b, my buyers are agencies" > /dev/null 2>&1
sh "$GE" person add prospect sam@northfield.io "Sam Carter" --company "Northfield" > /dev/null 2>&1
sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1
sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1

MEM="$SANDBOX/growth-engine/memory.md"
PF="$SANDBOX/growth-engine/people/sam-northfield-io.md"
LED="$SANDBOX/growth-engine/ledger.md"
LOG="$SANDBOX/growth-engine/ops-log.md"

# The founder's own writing. Trailing spaces, a tab, a blank line in the middle,
# an accented name, a line that opens the way one of ge's own entries opens, and
# a heading of their own underneath ge's. Written with printf so what lands on
# disk is exactly these bytes and nothing an editor would add.
printf 'Handover is the whole thing.   \n\nZo\303\253 said it first, in the Tuesday session.\n\tthe tab here is on purpose\n- 2026-01-01 this looks like one of ge entries and is mine\n\n### My own heading\nStill mine.\n' >> "$MEM"
printf 'Sam runs ops for four agencies.  \n\n\tnever call before ten\nHe reads on the train, so short beats clever.\n- 2026-01-01 mine, not ge\n' >> "$PF"
printf 'pillar 3 = founder story, the one about the night shift\nC is for content, everything else is people\n' >> "$LED"
printf 'note to self: the tuesday session is the one that matters\n' >> "$LOG"

# The two regions a file promises the founder, read as raw bytes.
keep_regions() {
  t_region "$MEM" '## Notes' > "$CASEWORK/mem.keep"
  t_region "$PF" '## Yours' > "$CASEWORK/yours.keep"
  # The ledger and the ops log have no such heading: ge's rows and the founder's
  # lines sit side by side. So the founder's side is everything that is not one
  # of ge's rows, and everything that is not one of ge's day headings or entries.
  grep -v '^C|' "$LED" > "$CASEWORK/led.keep"
  grep -v '^## ' "$LOG" | grep -v '^- ' > "$CASEWORK/log.keep"
}

# same_prose <label>: after one write. Four files, four comparisons, every time,
# so the report names the command that did it.
same_prose() {                          # <label>
  t_region "$MEM" '## Notes' > "$CASEWORK/mem.now"
  t_region "$PF" '## Yours' > "$CASEWORK/yours.now"
  grep -v '^C|' "$LED" > "$CASEWORK/led.now"
  grep -v '^## ' "$LOG" | grep -v '^- ' > "$CASEWORK/log.now"
  assert_bytes_equal "$CASEWORK/mem.keep" "$CASEWORK/mem.now" \
    "$1: their own writing in memory.md is byte for byte"
  assert_bytes_equal "$CASEWORK/yours.keep" "$CASEWORK/yours.now" \
    "$1: their own writing in the person file is byte for byte"
  assert_bytes_equal "$CASEWORK/led.keep" "$CASEWORK/led.now" \
    "$1: their own writing in the ledger is byte for byte"
  assert_bytes_equal "$CASEWORK/log.keep" "$CASEWORK/log.now" \
    "$1: their own writing in the ops log is byte for byte"
}

keep_regions

# 1. The prose really is on disk in the awkward shape the case is about. Without
#    this the four comparisons below could be comparing two empty files.
assert_equals 1 "$(grep -c '   $' "$CASEWORK/mem.keep")" "the trailing spaces are really there"
assert_contains "$CASEWORK/mem.keep" 'Zoë said it first' "and the accented name is really there"
assert_equals 1 "$(awk '/\t/ { n = n + 1 } END { print n + 0 }' "$CASEWORK/yours.keep")" \
  "and the tab in the person file is really there"

# ---------------------------------------------------------------- every writer

sh "$GE" log note "day two, wrote the first five" > "$CASEWORK/log.out" 2>&1
assert_exit 0 $? "ge log writes"
same_prose "after ge log"

sh "$GE" log result "sent 25 emails, and now I wait" > "$CASEWORK/log2.out" 2>&1
assert_exit 0 $? "ge log writes a second kind"
same_prose "after a second ge log"

sh "$GE" remember worked "the short posts got replies" > "$CASEWORK/rem.out" 2>&1
assert_exit 0 $? "ge remember writes"
same_prose "after ge remember"

sh "$GE" remember voice "no exclamation marks, ever" > "$CASEWORK/voice.out" 2>&1
assert_exit 0 $? "ge remember writes into a second marked section"
same_prose "after ge remember into another section"

sh "$GE" remember --amend decision 1 "picked b2b, and the buyers are agencies" \
  --expect "picked b2b, my buyers are agencies" > "$CASEWORK/amend.out" 2>&1
assert_exit 0 $? "ge remember --amend writes"
same_prose "after ge remember --amend"

sh "$GE" remember forget worked 1 > "$CASEWORK/forget.out" 2>&1
assert_exit 0 $? "ge remember forget writes"
same_prose "after ge remember forget"

sh "$GE" person note sam@northfield.io "wants a demo in September" > "$CASEWORK/note.out" 2>&1
assert_exit 0 $? "ge person note writes"
same_prose "after ge person note"

sh "$GE" person touch sam@northfield.io email out "sent the opener" > "$CASEWORK/touch.out" 2>&1
assert_exit 0 $? "ge person touch writes"
same_prose "after ge person touch"

printf 'Loved your piece on handover.\n' > "$CASEWORK/opener.txt"
sh "$GE" person opener sam@northfield.io --file "$CASEWORK/opener.txt" > "$CASEWORK/opener.out" 2>&1
assert_exit 0 $? "ge person opener writes"
same_prose "after ge person opener"

sh "$GE" person set sam@northfield.io status contacted_ok > "$CASEWORK/set.out" 2>&1
assert_exit 0 $? "ge person set writes"
same_prose "after ge person set"

sh "$GE" person add prospect kit@brightops.co.uk "Kit Alvarez" > "$CASEWORK/add.out" 2>&1
assert_exit 0 $? "ge person add writes"
same_prose "after ge person add"

sh "$GE" ledger add-content 2 2 carousel media > "$CASEWORK/ladd.out" 2>&1
assert_exit 0 $? "ge ledger add-content writes"
same_prose "after ge ledger add-content"

sh "$GE" ledger set-content 2 status archived > "$CASEWORK/lset.out" 2>&1
assert_exit 0 $? "ge ledger set-content writes"
same_prose "after ge ledger set-content"

sh "$GE" index > "$CASEWORK/index.out" 2>&1
assert_exit 0 $? "ge index writes"
same_prose "after ge index"

sh "$GE" receipt set plugin PASS "the toolkit answered" > "$CASEWORK/receipt.out" 2>&1
assert_exit 0 $? "ge receipt set writes"
same_prose "after ge receipt set"

printf 'acc_10441|facebook|Lumen Skin\n' > "$CASEWORK/accounts.txt"
sh "$GE" accounts set < "$CASEWORK/accounts.txt" > "$CASEWORK/accounts.out" 2>&1
assert_exit 0 $? "ge accounts set writes"
same_prose "after ge accounts set"

sh "$GE" person export firstlines > "$CASEWORK/exf.out" 2>&1
assert_exit 0 $? "ge person export firstlines writes"
same_prose "after ge person export firstlines"

printf 'Your captions read like someone who has done the work.\n' > "$CASEWORK/dm.txt"
sh "$GE" person opener ig:helen.makes --file "$CASEWORK/dm.txt" > /dev/null 2>&1
sh "$GE" person export openers > "$CASEWORK/exo.out" 2>&1
assert_exit 0 $? "ge person export openers writes"
same_prose "after ge person export openers"

sh "$GE" snapshot memory.md > "$CASEWORK/snap.out" 2>&1
assert_exit 0 $? "ge snapshot writes"
same_prose "after ge snapshot"

sh "$GE" person remove kit@brightops.co.uk > "$CASEWORK/remove.out" 2>&1
assert_exit 0 $? "ge person remove writes"
same_prose "after ge person remove"

# ---------------------------------------------------------------- and going back

# The other side of the promise. A backup put back has to give the file back the
# way it was, which includes the founder's own writing, or the one route out of
# a bad write is itself a bad write.
cp "$MEM" "$CASEWORK/mem.before-undo" || t_die "memory.md would not copy." "df -h ${TMPDIR:-/tmp}"
sh "$GE" remember didnot "cold DMs with no reason to write" > /dev/null 2>&1

# Several files have been written in the last hour by now, so ge undo will not
# choose between them and hands over a restore line instead. That line is typed
# rather than worked around, because a founder who has just written over
# something has no other way back and this is the moment it has to be right.
sh "$GE" undo > "$CASEWORK/undo.out" 2>&1
un_rc=$?
if [ "$un_rc" -ne 0 ]; then
  un_last=$(sed '/^[[:space:]]*$/d' "$CASEWORK/undo.out" | sed -n '$p')
  case $un_last in
    *'→ run: ge restore '*) t_pass ;;
    *) t_note "ge undo did not offer a restore"
       cat "$CASEWORK/undo.out" >> "$CASEWORK/diff.txt"
       t_fail "ge undo ends [$un_last]" ;;
  esac
  un_cmd=${un_last#*→ run: ge }
  set -- $un_cmd
  sh "$GE" "$@" > "$CASEWORK/restore.out" 2>&1
  assert_exit 0 $? "the restore line ge printed puts a file back"

  # Which file that line names is up to ge, and when two writes land in the same
  # second it can be either of them. So memory.md is asked for by name, using the
  # stamp out of ge's own listing, and that is the one the bytes are read from.
  un_stamp=$(awk '$1 == "memory.md" { print $2 }' "$CASEWORK/undo.out" | sed -n '1p')
  if [ -n "$un_stamp" ]; then
    sh "$GE" restore memory.md "$un_stamp" > "$CASEWORK/restore-mem.out" 2>&1
    assert_exit 0 $? "and memory.md can be asked for by name and by the day it was kept"
  else
    t_note "the undo listing did not name memory.md"
    cat "$CASEWORK/undo.out" >> "$CASEWORK/diff.txt"
    t_fail "the undo listing does not say which backup of memory.md to ask for"
  fi
else
  t_pass
  t_pass
  t_pass
fi
assert_bytes_equal "$CASEWORK/mem.before-undo" "$MEM" \
  "and memory.md comes back byte for byte, the founder's own writing with it"

t_done
