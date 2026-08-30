#!/bin/sh
# 25-line-endings.sh: Windows endings and a missing last newline, every writer.
#
# WHY IT EXISTS: roughly half the cohort is on Windows, and Notepad saves every
#                line with a carriage return and does not put a newline at the
#                end. Both of those used to break something real and quiet. A
#                marked-block write rewrote the founder's own paragraphs from
#                Windows endings to Unix ones, so a folder kept in git showed
#                every line as changed and the promise printed inside the file,
#                that ge never writes there, was not true. A missing final
#                newline made ge ledger glue a machine row onto the end of the
#                founder's own sentence, report "Added piece 1", and leave a
#                piece that no list showed and no command could approve.
#                One case covered one verb against one of those shapes. This
#                covers every writing verb against both.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/25-line-endings/
# POSTURE:       fail-closed. The founder's own region is read as raw bytes,
#                from the heading to the end of the file, and compared with cmp
#                after every single write. Nothing is normalised on the way,
#                because a normalised comparison is exactly how this went unseen.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. The endings are made with awk,
#                because sed -i is not portable and unix2dos is not everywhere.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 25-line-endings

# to_crlf <file>: every line ending becomes CRLF, the way a Windows editor saves.
to_crlf() {
  awk '{ sub(/\r$/, ""); printf "%s\r\n", $0 }' "$1" > "$1.ends" \
    && mv "$1.ends" "$1"
}

# drop_final_nl <file>: the last line loses its terminator, which is what Notepad
# and most paste-into-an-editor saves leave behind. On a file with Windows
# endings the carriage return goes with it, because an unterminated last line
# never carried one.
drop_final_nl() {
  awk '
    { line[NR] = $0 }
    END {
      for (i = 1; i < NR; i++) print line[i]
      sub(/\r$/, "", line[NR])
      printf "%s", line[NR]
    }
  ' "$1" > "$1.ends" && mv "$1.ends" "$1"
}

# cr_count <file>: how many lines really carry a carriage return. Asserting this
# is what stops the case passing because the conversion silently did nothing.
cr_count() {
  awk '/\r$/ { n = n + 1 } END { print n + 0 }' "$1"
}

MEM=''
PF=''

keep_regions() {
  t_region "$MEM" '## Notes' > "$CASEWORK/mem.keep"
  t_region "$PF" '## Yours' > "$CASEWORK/yours.keep"
}

# same_regions <label>: the two regions a founder owns, after one write. Both are
# checked after every verb rather than once at the end, so a report names the
# command that did it instead of the last one that ran.
same_regions() {                        # <label>
  t_region "$MEM" '## Notes' > "$CASEWORK/mem.now"
  t_region "$PF" '## Yours' > "$CASEWORK/yours.now"
  assert_bytes_equal "$CASEWORK/mem.keep" "$CASEWORK/mem.now" \
    "$1: the founder's own part of memory.md comes back byte for byte"
  assert_bytes_equal "$CASEWORK/yours.keep" "$CASEWORK/yours.now" \
    "$1: the founder's own part of the person file comes back byte for byte"
}

# build <folder>: a folder with something in every file, and the founder's own
# writing in the two files that promise it will be left alone.
build() {                               # <folder>
  cd "$1" || t_die "the folder $1 is not there." "sh tests/run.sh again"
  sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed in $1." "sh tests/run.sh again"
  sh "$GE" log note "day one, before the file was saved on Windows" > /dev/null 2>&1
  sh "$GE" remember decision "picked b2b, my buyers are agencies" > /dev/null 2>&1
  sh "$GE" person add prospect sam@northfield.io "Sam Carter" --company "Northfield" > /dev/null 2>&1
  sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1
  sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1
  MEM="$1/growth-engine/memory.md"
  PF="$1/growth-engine/people/sam-northfield-io.md"
  printf 'Sam runs ops for four agencies.\nHe reads on the train, so short beats clever.\n' >> "$PF"
  printf 'The thing I keep coming back to is handover.\nWrite that one properly.\n' >> "$MEM"
  printf 'pillar 3 = founder story, the one about the night shift\n' >> "$1/growth-engine/ledger.md"
  printf 'note to self: the tuesday session is the one that matters\n' >> "$1/growth-engine/ops-log.md"
}

# drive <label>: every verb that writes, against the folder as it now stands. The
# founder's regions are checked after each one, because a fault in the last verb
# of a run is indistinguishable from a fault in the first if they are only
# checked at the end.
drive() {                               # <label>
  dr=$1
  keep_regions

  sh "$GE" log note "day two, after the file was saved on Windows" > "$CASEWORK/$dr-log.out" 2>&1
  assert_exit 0 $? "$dr: ge log writes"
  same_regions "$dr, after ge log"

  sh "$GE" remember worked "the short posts got replies" > "$CASEWORK/$dr-rem.out" 2>&1
  assert_exit 0 $? "$dr: ge remember writes"
  same_regions "$dr, after ge remember"

  sh "$GE" remember --amend decision 1 "picked b2b, and the buyers are agencies" \
    --expect "picked b2b, my buyers are agencies" > "$CASEWORK/$dr-amend.out" 2>&1
  assert_exit 0 $? "$dr: ge remember --amend writes"
  same_regions "$dr, after ge remember --amend"

  sh "$GE" remember forget worked 1 > "$CASEWORK/$dr-forget.out" 2>&1
  assert_exit 0 $? "$dr: ge remember forget writes"
  same_regions "$dr, after ge remember forget"

  sh "$GE" person note sam@northfield.io "wants a demo in September" > "$CASEWORK/$dr-note.out" 2>&1
  assert_exit 0 $? "$dr: ge person note writes"
  same_regions "$dr, after ge person note"

  sh "$GE" person touch sam@northfield.io email out "sent the opener" > "$CASEWORK/$dr-touch.out" 2>&1
  assert_exit 0 $? "$dr: ge person touch writes"
  same_regions "$dr, after ge person touch"

  printf 'Loved your piece on handover.\n' > "$CASEWORK/opener.txt"
  sh "$GE" person opener sam@northfield.io --file "$CASEWORK/opener.txt" > "$CASEWORK/$dr-opener.out" 2>&1
  assert_exit 0 $? "$dr: ge person opener writes"
  same_regions "$dr, after ge person opener"

  sh "$GE" person set sam@northfield.io status contacted_ok > "$CASEWORK/$dr-set.out" 2>&1
  assert_exit 0 $? "$dr: ge person set writes"
  same_regions "$dr, after ge person set"

  sh "$GE" ledger add-content 2 2 carousel media > "$CASEWORK/$dr-ladd.out" 2>&1
  assert_exit 0 $? "$dr: ge ledger add-content writes"
  same_regions "$dr, after ge ledger add-content"

  sh "$GE" ledger set-content 1 format carousel > "$CASEWORK/$dr-lset.out" 2>&1
  assert_exit 0 $? "$dr: ge ledger set-content writes"
  same_regions "$dr, after ge ledger set-content"

  sh "$GE" index > "$CASEWORK/$dr-index.out" 2>&1
  assert_exit 0 $? "$dr: ge index writes"
  same_regions "$dr, after ge index"

  sh "$GE" receipt set plugin PASS "the toolkit answered" > "$CASEWORK/$dr-receipt.out" 2>&1
  assert_exit 0 $? "$dr: ge receipt set writes"
  same_regions "$dr, after ge receipt set"

  sh "$GE" person export firstlines > "$CASEWORK/$dr-exf.out" 2>&1
  assert_exit 0 $? "$dr: ge person export firstlines writes"
  same_regions "$dr, after ge person export firstlines"

  printf 'Your captions read like someone who has done the work.\n' > "$CASEWORK/dm.txt"
  sh "$GE" person opener ig:helen.makes --file "$CASEWORK/dm.txt" > /dev/null 2>&1
  sh "$GE" person export openers > "$CASEWORK/$dr-exo.out" 2>&1
  assert_exit 0 $? "$dr: ge person export openers writes"
  same_regions "$dr, after ge person export openers"

  sh "$GE" snapshot memory.md > "$CASEWORK/$dr-snap.out" 2>&1
  assert_exit 0 $? "$dr: ge snapshot writes"
  same_regions "$dr, after ge snapshot"
}

# ------------------------------------------------------ saved the Windows way

CRLF="$SANDBOX/crlf"
mkdir -p "$CRLF" || t_die "the CRLF folder could not be made." "df -h ${TMPDIR:-/tmp}"
HOME=$CRLF
export HOME
GE_T_HOME="$CRLF/growth-engine"
build "$CRLF"

for f in memory.md ops-log.md ledger.md .state/HOME people/sam-northfield-io.md \
         people/ig-helen-makes.md; do
  [ -f "$CRLF/growth-engine/$f" ] || t_die "growth-engine/$f was never created." \
    "sh tests/run.sh again and read the diff"
  to_crlf "$CRLF/growth-engine/$f"
done
assert_equals 1 "$(cr_count "$CRLF/growth-engine/.state/HOME")" "the anchor really did gain one"
MEM_CR=$(cr_count "$MEM")
[ "$MEM_CR" -gt 20 ] && t_pass || t_fail "memory.md gained only $MEM_CR carriage returns, so the conversion did nothing"
LEDGER_CR=$(cr_count "$CRLF/growth-engine/ledger.md")
[ "$LEDGER_CR" -gt 3 ] && t_pass || t_fail "ledger.md gained only $LEDGER_CR carriage returns"
LOG_CR=$(cr_count "$CRLF/growth-engine/ops-log.md")
[ "$LOG_CR" -gt 3 ] && t_pass || t_fail "ops-log.md gained only $LOG_CR carriage returns"

drive crlf

# A file written through its markers comes back with the endings it arrived with,
# on every line, because the lines ge adds are written the way the file already
# reads. A file that is only appended to keeps every ending it had: the count
# cannot fall, whatever ge adds after it. Both are the same promise, that a
# founder's next git diff shows the lines they changed and no others.
assert_equals 0 "$(awk '!/\r$/ { n = n + 1 } END { print n + 0 }' "$MEM")" \
  "every line of memory.md still ends the way the founder's editor left it"
# Counted past the machine rows, which are ge's own and are rewritten field by
# field when a piece changes. Every other line in the file is the founder's, or
# the heading the file was seeded with, and none of those may be rewritten.
assert_equals 0 "$(awk '/^C\|/ { next } !/\r$/ { n = n + 1 } END { print n + 0 }' \
  "$CRLF/growth-engine/ledger.md")" \
  "and no line of the ledger that is not a machine row lost the ending it had"
assert_equals "$LOG_CR" "$(cr_count "$CRLF/growth-engine/ops-log.md")" \
  "and no line of the ops log lost the ending it had"

# What was in the files before is still in them. The regions above prove nothing
# was reflowed; this proves nothing was dropped.
assert_contains "$MEM" 'The thing I keep coming back to is handover.' "the founder's own note is still in memory.md"
assert_contains "$PF" 'He reads on the train, so short beats clever.' "and their own line is still in the person file"
assert_contains "$CRLF/growth-engine/ops-log.md" 'note to self: the tuesday session' \
  "and their own line is still in the ops log"
assert_contains "$CRLF/growth-engine/ledger.md" 'pillar 3 = founder story' \
  "and their own line is still in the ledger"

sh "$GE" ledger list C > "$CASEWORK/crlf-list.out" 2>&1
assert_equals 2 "$(grep -c '^[0-9]' "$CASEWORK/crlf-list.out")" \
  "both pieces read back out of a ledger saved on Windows"
sh "$GE" check > "$CASEWORK/crlf-check.out" 2>&1
assert_lacks "$CASEWORK/crlf-check.out" 'FAIL' "and the doctor finds nothing broken in a folder saved on Windows"

# ------------------------------------------------- saved with no last newline

NONL="$SANDBOX/nonl"
mkdir -p "$NONL" || t_die "the no-newline folder could not be made." "df -h ${TMPDIR:-/tmp}"
HOME=$NONL
export HOME
GE_T_HOME="$NONL/growth-engine"
build "$NONL"

for f in memory.md ops-log.md ledger.md .state/HOME people/sam-northfield-io.md \
         people/ig-helen-makes.md; do
  drop_final_nl "$NONL/growth-engine/$f"
done

# Proved rather than assumed, because a helper that quietly did nothing would
# leave every check below passing on a file that was never in the shape the case
# is about.
assert_equals '' "$(tail -c 1 "$MEM" | tr -dc '\n')" "memory.md really does end without a newline"
assert_equals '' "$(tail -c 1 "$NONL/growth-engine/ledger.md" | tr -dc '\n')" \
  "and so does the ledger"
assert_equals '' "$(tail -c 1 "$NONL/growth-engine/.state/HOME" | tr -dc '\n')" \
  "and so does the anchor"

LAST_LEDGER=$(tail -1 "$NONL/growth-engine/ledger.md")
LAST_LOG=$(tail -1 "$NONL/growth-engine/ops-log.md")

drive nonl

# The row went on a line of its own rather than onto the end of the founder's
# sentence. This is the whole of it: glued on, the piece exists in no list and
# cannot be approved, and both the linter and the doctor call the folder healthy.
assert_contains "$NONL/growth-engine/ledger.md" "$LAST_LEDGER" \
  "the founder's own last line of the ledger is still a line of its own"
assert_contains "$NONL/growth-engine/ops-log.md" "$LAST_LOG" \
  "and so is their own last line of the ops log"

sh "$GE" ledger list C > "$CASEWORK/nonl-list.out" 2>&1
assert_equals 2 "$(grep -c '^[0-9]' "$CASEWORK/nonl-list.out")" \
  "both pieces are in the list, which a row glued onto a founder's sentence never was"
sh "$GE" ledger set-content 2 status archived > "$CASEWORK/nonl-lset2.out" 2>&1
assert_exit 0 $? "and the piece added after the missing newline can still be reached by its number"

sh "$GE" lint > "$CASEWORK/nonl-lint.out" 2>&1
assert_lacks "$CASEWORK/nonl-lint.out" 'WARN' "the linter has nothing to say about a file with no last newline"
sh "$GE" check > "$CASEWORK/nonl-check.out" 2>&1
assert_lacks "$CASEWORK/nonl-check.out" 'FAIL' "and neither has the doctor"

t_done
