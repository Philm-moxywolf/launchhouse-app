#!/bin/sh
# 23-backslash-path.sh: one backslash in the folder path destroys nothing.
#
# WHY IT EXISTS: this is the fault the suite could not produce. run.sh builds its
#                sandbox with mktemp and mktemp never puts a backslash in a path,
#                so for the whole life of this toolkit no case could reach the
#                one character that emptied every marked section in every file
#                while printing "Remembered", "noted", "touched" back at the
#                founder and leaving both the linter and the doctor saying the
#                folder was in good health. A founder called their folder
#                "Q3\Q4 launch" and lost three weeks of notes without one line
#                of warning. Nothing here is exotic: a backslash is a legal
#                character in a folder name on a Mac and on Linux, and it is one
#                keystroke away from the slash beside it.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/23-backslash-path/
# POSTURE:       fail-closed. Every marked section is counted on disk after every
#                write, because the failure this case exists for reported success
#                on the terminal. An exit code proves nothing here.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. The folder name is built from
#                a variable rather than typed with an escape, so what reaches the
#                filesystem is one backslash under every shell that reads this.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 23-backslash-path

BS='\'

# block_lines <file> <block name>: how many lines are inside that marked section.
# The name goes through the environment rather than into the awk program, for
# the same reason ge itself has to: awk reads a backslash in an assigned value as
# the start of an escape, and this case is about a backslash.
block_lines() {                         # <file> <block name>
  GE_T_BLOCK=$2
  export GE_T_BLOCK
  awk '
    BEGIN {
      s = "<!-- GE:" ENVIRON["GE_T_BLOCK"] ":START -->"
      e = "<!-- GE:" ENVIRON["GE_T_BLOCK"] ":END -->"
    }
    { sub(/\r$/, "") }
    $0 == s { inside = 1; next }
    $0 == e { inside = 0; next }
    inside  { n = n + 1 }
    END     { print n + 0 }
  ' "$1"
}

# ------------------------------------------------- a backslash and a space

# Both awkward characters at once, because a founder folder named after a
# quarter carries both and the two are handled in different places in the code.
DIR="$SANDBOX/Q3${BS}Q4 launch"
mkdir -p "$DIR" || t_die "the folder with a backslash in its name could not be made." \
  "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
cd "$DIR" || t_die "the folder with a backslash in its name is not there." "sh tests/run.sh again"
GE_T_HOME="$DIR/growth-engine"
HOME=$DIR
export HOME

sh "$GE" init > "$CASEWORK/init.out" 2>&1
assert_exit 0 $? "ge init works in a folder with a backslash in its name"
assert_equals "$DIR/growth-engine" "$(cat "$DIR/growth-engine/.state/HOME")" \
  "the anchor holds the path with the backslash in it"

MEM="$DIR/growth-engine/memory.md"

# 1. Three entries put there by hand, the way a founder's file looks after a
#    fortnight. The write below has to leave all three where they are. This is
#    the exact shape that came back empty, with rc=0 and a success message.
awk '
  { sub(/\r$/, "") }
  { print }
  /GE:DECISIONS:START/ {
    print "- 2026-09-01 buyers are agencies, not brands"
    print "- 2026-09-02 the offer is a fixed price audit"
    print "- 2026-09-03 no discounts before the event"
  }
' "$MEM" > "$CASEWORK/seeded" || t_die "the seeded memory.md could not be prepared." "sh tests/run.sh again"
cp "$CASEWORK/seeded" "$MEM" || t_die "the seeded memory.md could not be put in place." "ls -l $MEM"
assert_equals 3 "$(block_lines "$MEM" DECISIONS)" "the three entries are in the file to start with"

sh "$GE" remember decision "picked b2b, my buyers are agencies" > "$CASEWORK/remember.out" 2>&1
assert_exit 0 $? "ge remember works in a folder with a backslash in its name"
assert_equals 4 "$(block_lines "$MEM" DECISIONS)" \
  "the entry was added and the three that were already there are still there"
assert_contains "$MEM" 'buyers are agencies, not brands' "the founder's first entry survived"
assert_contains "$MEM" 'no discounts before the event' "the founder's third entry survived"
assert_contains "$MEM" 'picked b2b, my buyers are agencies' "and the new one is on disk"
assert_snapshots memory.md 1 "and the write took a backup first"

sh "$GE" remember list decision > "$CASEWORK/rlist.out" 2>&1
assert_exit 0 $? "ge remember list works in a folder with a backslash in its name"
assert_contains "$CASEWORK/rlist.out" 'picked b2b, my buyers are agencies' "and reads the entry back"
assert_contains "$CASEWORK/rlist.out" 'no discounts before the event' \
  "and still reads back what was there before"

sh "$GE" remember worked "the short posts got replies" > "$CASEWORK/worked.out" 2>&1
assert_exit 0 $? "a second marked section takes a write too"
assert_equals 1 "$(block_lines "$MEM" WORKED)" "and it holds the line"

# 2. The people side. Every one of these goes through the same writer, and every
#    one of them reported success while writing nothing.
sh "$GE" person add prospect sam@northfield.io "Sam Carter" --note "found on LinkedIn" \
  > "$CASEWORK/padd.out" 2>&1
assert_exit 0 $? "ge person add works in a folder with a backslash in its name"
PF="$DIR/growth-engine/people/sam-northfield-io.md"
assert_equals 1 "$(block_lines "$PF" NOTES)" "the note given at the time of adding is in the file"

sh "$GE" person note sam@northfield.io "wants a demo in September" > "$CASEWORK/pnote.out" 2>&1
assert_exit 0 $? "ge person note works in a folder with a backslash in its name"
assert_equals 2 "$(block_lines "$PF" NOTES)" "the second note is there and the first one is still there"
assert_contains "$PF" 'found on LinkedIn' "the first note survived the second write"
assert_contains "$PF" 'wants a demo in September' "and the second note is on disk"

sh "$GE" person touch sam@northfield.io email out "sent the opener" > "$CASEWORK/ptouch.out" 2>&1
assert_exit 0 $? "ge person touch works in a folder with a backslash in its name"
assert_equals 1 "$(block_lines "$PF" TOUCH)" "and the touch is in the file"
assert_equals 2 "$(block_lines "$PF" NOTES)" "and the notes beside it were not emptied"

printf 'Loved your piece on handover.\n' > "$CASEWORK/opener.txt"
sh "$GE" person opener sam@northfield.io --file "$CASEWORK/opener.txt" > "$CASEWORK/popener.out" 2>&1
assert_exit 0 $? "ge person opener works in a folder with a backslash in its name"
assert_equals 1 "$(block_lines "$PF" OPENER)" "and the opener is in the file"
assert_contains "$PF" 'Loved your piece on handover.' "and it is the text that was given"

sh "$GE" person set sam@northfield.io status contacted_ok > "$CASEWORK/pset.out" 2>&1
assert_exit 0 $? "ge person set works in a folder with a backslash in its name"
assert_contains "$PF" 'status: contacted_ok' "and the new status is on disk"
assert_equals 2 "$(block_lines "$PF" NOTES)" "and the notes were not emptied by a field change"

# 3. The two files the outreach is actually sent from. Blank ones are how this
#    fault was found, at the event, on the Friday.
sh "$GE" person export firstlines > "$CASEWORK/exfirst.out" 2>&1
assert_exit 0 $? "ge person export firstlines works in a folder with a backslash in its name"
assert_contains "$DIR/growth-engine/outreach-firstlines.csv" 'sam@northfield.io' \
  "and the prospect is in the outreach sheet"

sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1 \
  || t_die "the target could not be added." "sh tests/run.sh again"
printf 'Your captions read like someone who has done the work.\n' > "$CASEWORK/dm.txt"
sh "$GE" person opener ig:helen.makes --file "$CASEWORK/dm.txt" > /dev/null 2>&1 \
  || t_die "the opener for the target could not be written." "sh tests/run.sh again"
sh "$GE" person export openers > "$CASEWORK/exopen.out" 2>&1
assert_exit 0 $? "ge person export openers works in a folder with a backslash in its name"
assert_contains "$DIR/growth-engine/dm-openers.md" 'Your captions read like someone who has done the work.' \
  "and the opener is in the file the DMs are sent from"

# 4. The rest of the journey, which uses different writers again.
sh "$GE" log note "written from a folder with a backslash in its name" > "$CASEWORK/log.out" 2>&1
assert_exit 0 $? "ge log works in a folder with a backslash in its name"
assert_contains "$DIR/growth-engine/ops-log.md" 'written from a folder with a backslash' \
  "and the entry is in the ops log"

sh "$GE" ledger add-content 1 1 short-post text > "$CASEWORK/ledger.out" 2>&1
assert_exit 0 $? "ge ledger add-content works in a folder with a backslash in its name"
sh "$GE" ledger list C > "$CASEWORK/ledgerlist.out" 2>&1
assert_contains "$CASEWORK/ledgerlist.out" 'short-post' "and the piece reads back"

sh "$GE" index > "$CASEWORK/index.out" 2>&1
assert_exit 0 $? "ge index works in a folder with a backslash in its name"

# 5. What the founder is told when they ask. Both of these said the folder was
#    in good health while every marked section in it was empty, which is the
#    reason nobody reached for a backup.
sh "$GE" lint > "$CASEWORK/lint.out" 2>&1
assert_exit 0 $? "ge lint works in a folder with a backslash in its name"
assert_lacks "$CASEWORK/lint.out" 'WARN' "and it has nothing to warn about"

sh "$GE" check > "$CASEWORK/check.out" 2>&1
assert_exit 0 $? "ge check passes in a folder with a backslash in its name"
assert_contains "$CASEWORK/check.out" "$DIR/growth-engine" "and names the folder with the backslash in it"
assert_lacks "$CASEWORK/check.out" 'FAIL' "and finds nothing broken"

# ------------------------------------------------- a backslash on its own

# The plainer shape, in case the pair above is handled somewhere the single one
# is not. A folder called back\slash is what a pasted Windows path leaves behind
# on a Mac, and half the cohort moves work between the two.
PLAIN="$SANDBOX/back${BS}slash"
mkdir -p "$PLAIN" || t_die "the second folder with a backslash could not be made." \
  "df -h ${TMPDIR:-/tmp}"
cd "$PLAIN" || t_die "the second folder with a backslash is not there." "sh tests/run.sh again"
GE_T_HOME="$PLAIN/growth-engine"
HOME=$PLAIN
export HOME

sh "$GE" init > "$CASEWORK/plain-init.out" 2>&1
assert_exit 0 $? "ge init works in a folder whose name is only a backslash apart"
sh "$GE" remember decision "b2c, and the buyer is the person who uses it" > "$CASEWORK/plain-rem.out" 2>&1
assert_exit 0 $? "ge remember works there too"
assert_equals 1 "$(block_lines "$PLAIN/growth-engine/memory.md" DECISIONS)" \
  "and the entry is really in the marked section rather than the section being emptied"

# Going back. The ring is where the founder's work would have to be recovered
# from if any of this had gone wrong, so the stamped copies have to be readable
# from a folder with a backslash in its path too. One file has changed here, so
# there is nothing for ge undo to choose between.
sh "$GE" undo > "$CASEWORK/plain-undo.out" 2>&1
assert_exit 0 $? "ge undo works in a folder with a backslash in its name"
assert_equals 0 "$(block_lines "$PLAIN/growth-engine/memory.md" DECISIONS)" \
  "and it really did put the file back the way it was"

t_done
