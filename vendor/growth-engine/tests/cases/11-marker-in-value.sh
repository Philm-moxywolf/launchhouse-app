#!/bin/sh
# 11-marker-in-value.sh: a pasted marker is refused, whichever way it arrives.
#
# WHY IT EXISTS: ge marks the parts of a person file it owns with comment lines,
#                and it finds those parts again by looking for them. A founder
#                pasting a line out of a web page, a spreadsheet or another
#                person file can carry one of those markers into a note, a touch,
#                a field or an opener. Written down, it ends the block early, and
#                from then on that person can never be written to again. It does
#                not stop at one person either: ge person export openers refuses
#                while any one file is malformed, so one pasted line takes every
#                other target's opener with it. The refusal is the product here,
#                and it has to hold on the argument, on a file and on a pipe,
#                because those are the three ways text reaches ge.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/11-marker-in-value/
# POSTURE:       fail-closed. Every refusal is followed by a byte comparison of
#                the person file, because a refusal that half wrote is worse than
#                no refusal at all.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# For rl_ends, which tells the two recovery shapes apart. Which of the two each
# refusal here owes the founder is set out on the refused function below.
. "$TESTS/lib/recovery.sh"

t_start 11-marker-in-value
cd "$SANDBOX" || t_die "the sandbox for 11-marker-in-value is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
sh "$GE" person add prospect sam@northfield.io "Sam Carter" --company "Northfield" > /dev/null 2>&1 \
  || t_die "the prospect could not be added." "sh tests/run.sh again"
sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1 \
  || t_die "the target could not be added." "sh tests/run.sh again"

PROSPECT="growth-engine/people/sam-northfield-io.md"
TARGET="growth-engine/people/ig-helen-makes.md"
cp "$PROSPECT" "$CASEWORK/prospect.keep" || t_die "the prospect file is not there." "sh tests/run.sh again"
cp "$TARGET" "$CASEWORK/target.keep" || t_die "the target file is not there." "sh tests/run.sh again"

# The marker as a founder would paste it, and the same text sitting in a file
# they are copying from. Held in variables so each check below reads as the one
# thing it is testing rather than as a wall of punctuation.
MARKER='<!-- GE:NOTES:END -->'
printf 'they said %s at the end of the webinar\n' "$MARKER" > "$CASEWORK/pasted.txt"

# refused <label>: the four things every one of these refusals has to do. The
# file comparison is the point of the case, so it is never left to the reader.
#
# THE SHAPE IS PART OF EACH CALL, and it has to be. These ten refusals split in
# two, and the split is about where the marker is, not about which verb was
# typed:
#
#   bare  the marker is in something the founder typed as an argument. ge knows
#         the text will not do and it cannot know what they meant instead, so
#         there is no command it could hand them and the line is guidance. This
#         case used to hold all ten to carrying "→ run:", which is how "→ run:
#         take that text out" lived here: pasted, a shell answers about a
#         command called "take".
#   run   the marker is in a file the founder can open, or in what they piped
#         in. The text to change is somewhere they can reach it, and the command
#         to run once they have is the one they already typed, so ge can print
#         it whole. The line above it says to fix the file first, which is where
#         a sentence belongs.
refused() {                             # <output file> <person file> <keep file> <label> <run|bare>
  assert_contains "$1" 'FAIL' "$4: says FAIL"
  assert_contains "$1" '<!-- GE:' "$4: quotes the text it will not take"
  rl_ends "$1" "$5" "$4: the way out is the $5 shape"
  assert_bytes_equal "$3" "$2" "$4: the file is byte for byte what it was"
}

# ---------------------------------------------------------------- typed in

# 1. A note, typed as an argument.
sh "$GE" person note sam@northfield.io "they said $MARKER at the end of the webinar" \
  > "$CASEWORK/note-arg.out" 2>&1
assert_exit 1 $? "a note carrying a marker exits 1"
refused "$CASEWORK/note-arg.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the note refusal" bare

# 2. The source of a note is written into the file beside the note, so it is
#    checked as well. A founder pasting a URL out of a page brings whatever else
#    they selected with it.
sh "$GE" person note sam@northfield.io "a clean note" --source "a page $MARKER" \
  > "$CASEWORK/note-source.out" 2>&1
assert_exit 1 $? "a note source carrying a marker exits 1"
refused "$CASEWORK/note-source.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the note source refusal" bare

# 3. A touch.
sh "$GE" person touch sam@northfield.io email out "sent the opener $MARKER" \
  > "$CASEWORK/touch-arg.out" 2>&1
assert_exit 1 $? "a touch carrying a marker exits 1"
refused "$CASEWORK/touch-arg.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the touch refusal" bare

# 4. A field. This one is written into the header rather than into a block, and
#    it is refused for the same reason: the header stops at the first heading and
#    a marker in it moves where every later read thinks the header ends.
sh "$GE" person set sam@northfield.io why_them "runs four agencies $MARKER" \
  > "$CASEWORK/set-arg.out" 2>&1
assert_exit 1 $? "a field value carrying a marker exits 1"
refused "$CASEWORK/set-arg.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the set refusal" bare

# ---------------------------------------------------------------- from a file

# 5. The same three, with the text coming out of a file the founder is copying
#    from. This is the common shape: the value is read out and handed over as the
#    argument, so the guard has to be on the value and never on how it arrived.
sh "$GE" person note sam@northfield.io "$(cat "$CASEWORK/pasted.txt")" \
  > "$CASEWORK/note-file.out" 2>&1
assert_exit 1 $? "a note read out of a file exits 1"
refused "$CASEWORK/note-file.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the note from a file refusal" bare

sh "$GE" person touch sam@northfield.io email out "$(cat "$CASEWORK/pasted.txt")" \
  > "$CASEWORK/touch-file.out" 2>&1
assert_exit 1 $? "a touch read out of a file exits 1"
refused "$CASEWORK/touch-file.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the touch from a file refusal" bare

sh "$GE" person set sam@northfield.io company "$(cat "$CASEWORK/pasted.txt")" \
  > "$CASEWORK/set-file.out" 2>&1
assert_exit 1 $? "a field read out of a file exits 1"
refused "$CASEWORK/set-file.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the set from a file refusal" bare

# 6. An opener, read from a file, with the marker on the second line. The line
#    number is named so the founder can go and find it, and it has to be the
#    line the marker is really on.
printf 'saw your reel about slow mornings\n%s\nand a third line\n' "$MARKER" > "$CASEWORK/opener.txt"
sh "$GE" person opener ig:helen.makes --file "$CASEWORK/opener.txt" > "$CASEWORK/opener-file.out" 2>&1
assert_exit 1 $? "an opener read from a file exits 1"
refused "$CASEWORK/opener-file.out" "$TARGET" "$CASEWORK/target.keep" "the opener from a file refusal" run
assert_contains "$CASEWORK/opener-file.out" 'line 2 of the opener' "the opener refusal names the line it is on"
assert_contains "$CASEWORK/opener-file.out" "$CASEWORK/opener.txt" \
  "and the recovery line names the file to fix"

# ---------------------------------------------------------------- piped in

# 7. An opener typed at the keyboard or piped in. Same refusal, and a recovery
#    line that names the way it was given rather than a file that does not exist.
printf 'first line\nsecond %s line\n' "$MARKER" | sh "$GE" person opener ig:helen.makes - \
  > "$CASEWORK/opener-stdin.out" 2>&1
assert_exit 1 $? "an opener piped in exits 1"
refused "$CASEWORK/opener-stdin.out" "$TARGET" "$CASEWORK/target.keep" "the opener from a pipe refusal" run
assert_contains "$CASEWORK/opener-stdin.out" 'line 2' "the piped opener refusal names the line it is on"

# 8. A note whose text was piped in and read a line at a time, which is what a
#    skill does when it hands ge something it was given.
piped=$(printf 'they said %s in the reply\n' "$MARKER" | { IFS= read -r one; printf '%s' "$one"; })
sh "$GE" person note sam@northfield.io "$piped" > "$CASEWORK/note-stdin.out" 2>&1
assert_exit 1 $? "a note whose text was piped in exits 1"
refused "$CASEWORK/note-stdin.out" "$PROSPECT" "$CASEWORK/prospect.keep" "the note from a pipe refusal" bare

# ---------------------------------------------------------------- afterwards

# 9. Nothing was backed up either. A refusal happens before the snapshot, so a
#    founder who tries the same paste five times does not push five copies of
#    their real work out of the ring.
assert_snapshots people/sam-northfield-io.md 0 "not one of those refusals took a backup"
assert_snapshots people/ig-helen-makes.md 0 "and neither did the opener refusals"

# 10. Both files are still whole, and both still read back. This is what the
#     refusals were protecting, so it is asserted rather than assumed.
sh "$GE" person get sam@northfield.io > "$CASEWORK/get.out" 2>&1
assert_exit 0 $? "the prospect still reads back"
assert_equals 0 "$(grep -c 'WARN' "$CASEWORK/get.out")" "and reads back with no warning about its shape"
for b in TOUCH OPENER NOTES; do
  assert_equals 1 "$(grep -c -F "<!-- GE:$b:START -->" "$PROSPECT")" "the $b block still has one start marker"
  assert_equals 1 "$(grep -c -F "<!-- GE:$b:END -->" "$PROSPECT")" "the $b block still has one end marker"
done

# 11. The same text with the marker taken out goes through, so what is being
#     refused is the marker and not the founder's sentence.
sh "$GE" person note sam@northfield.io "they said it at the end of the webinar" \
  > "$CASEWORK/note-ok.out" 2>&1
assert_exit 0 $? "the same note without the marker is taken"
assert_contains "$PROSPECT" 'they said it at the end of the webinar' "and it is in the file"

t_done
