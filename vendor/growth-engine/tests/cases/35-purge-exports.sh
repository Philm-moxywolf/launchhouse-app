#!/bin/sh
# 35-purge-exports.sh: a purged prospect is off the sheet the messages go out of.
#
# WHY IT EXISTS: ge person purge destroyed the person file and every backup of
#                it, and stopped there. outreach-firstlines.csv is written whole
#                from people/, it holds every prospect's email address, and it is
#                the file a founder loads into a mail tool and sends twenty five
#                messages from. Left as it was, a prospect who asked to be taken
#                out was destroyed everywhere ge looks and still sat in the sheet
#                about to be sent from, and the only thing that would have taken
#                them off it was the founder happening to run the export again.
#                A deletion that leaves the address in the file the messages go
#                out of is not a deletion, and the person who finds out is the
#                person who asked to be left alone.
#
#                THE BACKUPS OF THE SHEET ARE PART OF IT. The export copies the
#                sheet before replacing it, which is right for every other caller
#                and is the one thing a purge cannot leave behind: that copy is
#                the sheet as it was a moment ago, holding the address the
#                founder just asked ge to destroy.
#
#                AND THE OTHER EXPORT MUST SURVIVE THE VISIT. dm-openers.md has
#                two owners: ge owns the marked targets block and the audience
#                engine owns everything else. A purge that regenerated it and
#                took the founder's own writing with it would trade one silent
#                loss for another, so the founder's half of that file is compared
#                byte for byte across the purge, and its backups are counted.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/35-purge-exports/
# POSTURE:       fail-closed. The address is proved to be in the sheet before the
#                purge, so its absence afterwards is the purge and not a sheet
#                that never held it. Every count is a number, never an eyeball.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHY THE FOLDER IS NAMED THE WAY IT IS. Half the folders in this programme are
# named after a business, so they carry a space, and the other three characters
# here are one keystroke away from it. A plainly named sandbox is how two real
# bugs in this toolkit stayed hidden.
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 35-purge-exports

PX_BS='\'
PX_ROOT="$SANDBOX/Ana's [own] back${PX_BS}slash folder"
mkdir -p "$PX_ROOT/work" || t_die "the sandbox folder could not be made." \
  "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
cd "$PX_ROOT/work" || t_die "the work folder is not there." "sh tests/run.sh again"
HOME="$PX_ROOT/work"
export HOME
GE_T_HOME="$PX_ROOT/work/growth-engine"

# The one who asks to be taken out, and the one who stays. Two of them, because
# a purge that emptied the sheet altogether would pass a test that only looked
# for the absence of one address.
PX_GONE=sam.carter@northfield.io
PX_STAYS=dana@brightline.co
PX_OPENER='saw your note about slow onboarding, and it matched what four agencies told me'

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# ---------------------------------------------------------------- two prospects and a target

sh "$GE" person add prospect "$PX_GONE" "Sam Carter" --company "Northfield" \
  > /dev/null 2>&1 || t_die "the first prospect could not be added." "sh tests/run.sh again"
sh "$GE" person add prospect "$PX_STAYS" "Dana Whitfield" --company "Brightline" \
  > /dev/null 2>&1 || t_die "the second prospect could not be added." "sh tests/run.sh again"
sh "$GE" person add target ig helen.makes "Helen Okafor" \
  > /dev/null 2>&1 || t_die "the target could not be added." "sh tests/run.sh again"

# The opening line, typed rather than passed as a path, because that is the form
# a founder uses and the form the app uses.
printf '%s\n' "$PX_OPENER" > "$CASEWORK/opener-gone.txt" \
  || t_die "the opening line could not be written." "chmod u+w $CASEWORK"
sh "$GE" person opener "$PX_GONE" - < "$CASEWORK/opener-gone.txt" > "$CASEWORK/opener.out" 2>&1
assert_exit 0 $? "an opening line can be typed at ge person opener"

printf 'your talk on retention was the one thing i took notes on\n' > "$CASEWORK/opener-stays.txt" \
  || t_die "the second opening line could not be written." "chmod u+w $CASEWORK"
sh "$GE" person opener "$PX_STAYS" - < "$CASEWORK/opener-stays.txt" > /dev/null 2>&1 \
  || t_die "the second opening line could not be recorded." "sh tests/run.sh again"

printf 'the reel about the third attempt was the one\n' > "$CASEWORK/opener-target.txt" \
  || t_die "the target's opening line could not be written." "chmod u+w $CASEWORK"
sh "$GE" person opener ig:helen.makes - < "$CASEWORK/opener-target.txt" > /dev/null 2>&1 \
  || t_die "the target's opening line could not be recorded." "sh tests/run.sh again"

# ---------------------------------------------------------------- both sheets, written

sh "$GE" person export firstlines > "$CASEWORK/export.out" 2>&1
assert_exit 0 $? "ge person export firstlines exits 0"
assert_contains "$CASEWORK/export.out" 'wrote growth-engine/outreach-firstlines.csv  2 prospects' \
  "and says how many prospects are on it"

sh "$GE" person export openers > "$CASEWORK/openers.out" 2>&1
assert_exit 0 $? "ge person export openers exits 0"

# The founder's own writing, added below the block ge owns. dm-openers.md has two
# owners and this is the other one's half.
printf '\n## My own notes\n\nwhat I actually say when I open a DM, in my words.\n' \
  >> growth-engine/dm-openers.md \
  || t_die "the founder's own writing could not be added." "chmod u+w $GE_T_HOME"
cp growth-engine/dm-openers.md "$CASEWORK/openers.before" \
  || t_die "the openers file could not be kept." "chmod u+w $CASEWORK"
t_region growth-engine/dm-openers.md '## My own notes' > "$CASEWORK/mine.before" \
  || t_die "the founder's own half of the openers file could not be read." "sh tests/run.sh again"

# One copy of the openers file in the ring, so the count afterwards means
# something. The ring for this file holds the founder's own writing, so a purge
# must not empty it.
sh "$GE" snapshot dm-openers.md > /dev/null 2>&1 \
  || t_die "the openers file could not be backed up." "sh tests/run.sh again"
assert_snapshots dm-openers.md 1 "one copy of the openers file is in the ring"

# --------------------------------------------- the sheet really holds them, before anything

# THE CONTROL, AND IT COMES FIRST. Without it, an empty grep after the purge
# would prove nothing: a sheet that never held the address reads exactly the same
# as one the purge cleaned.
assert_contains growth-engine/outreach-firstlines.csv "$PX_GONE" \
  "the sheet holds the address before the purge"
assert_contains growth-engine/outreach-firstlines.csv "$PX_OPENER" \
  "and their opening line, which is as personal as the address"
assert_contains growth-engine/outreach-firstlines.csv "$PX_STAYS" \
  "and it holds the other prospect too"
assert_equals 3 "$(grep -c . growth-engine/outreach-firstlines.csv)" \
  "a heading row and two prospects"

# The copy of the sheet the export took, which holds the same address.
cp growth-engine/outreach-firstlines.csv "$CASEWORK/sheet.before" \
  || t_die "the sheet could not be kept." "chmod u+w $CASEWORK"
sh "$GE" snapshot outreach-firstlines.csv > /dev/null 2>&1 \
  || t_die "the sheet could not be backed up." "sh tests/run.sh again"
assert_snapshots outreach-firstlines.csv 1 "and there is a copy of the sheet in the ring"
assert_contains \
  "$(ls growth-engine/.state/snapshots/outreach-firstlines.csv.* | sed -n '1p')" \
  "$PX_GONE" "which holds the address as well"

# ---------------------------------------------------------------- stopped, then purged

sh "$GE" person set "$PX_GONE" status stopped > "$CASEWORK/stop.out" 2>&1
assert_exit 0 $? "setting the status to stopped exits 0"
assert_contains "$CASEWORK/stop.out" 'is now a different list of people' \
  "and ge says the sheet no longer matches the folder"

sh "$GE" person purge "$PX_GONE" > "$CASEWORK/purge.out" 2>&1
assert_exit 0 $? "purging a stopped prospect exits 0"
assert_absent growth-engine/people/sam-carter-northfield-io.md "the person file is gone"
assert_snapshots people/sam-carter-northfield-io.md 0 "and every copy of it is gone too"

# THE LINE THIS CASE IS FOR. Zero, counted, in the file the founder is about to
# send from.
assert_equals 0 "$(grep -c -F -e "$PX_GONE" growth-engine/outreach-firstlines.csv || true)" \
  "the purged address is not on the sheet"
assert_equals 0 "$(grep -c -F -e "$PX_OPENER" growth-engine/outreach-firstlines.csv || true)" \
  "and neither is the line that was written to them"
assert_equals 0 "$(grep -c -F -e 'Northfield' growth-engine/outreach-firstlines.csv || true)" \
  "and neither is the company they work for"

# The sheet is still a sheet. A purge that emptied it, or that took a column with
# it, is the same loss wearing a different hat.
assert_contains growth-engine/outreach-firstlines.csv "$PX_STAYS" \
  "the other prospect is still on it"
assert_equals 2 "$(grep -c . growth-engine/outreach-firstlines.csv)" \
  "a heading row and the one prospect who is left"
cat > "$CASEWORK/sheet.expect" <<'SHEET'
"email","first_name","company","first_line","status"
"dana@brightline.co","Dana","Brightline","your talk on retention was the one thing i took notes on","candidate"
SHEET
assert_bytes_equal "$CASEWORK/sheet.expect" growth-engine/outreach-firstlines.csv \
  "and every column of their row is still where it was, quoted the way it was"

# The copies of the sheet went with it. Each one is the sheet as it was a moment
# ago, so each one holds the address the founder just asked ge to destroy.
assert_snapshots outreach-firstlines.csv 0 \
  "the copies of the sheet, which held the same address, are gone"

# THE PROMISE, SAID THE WAY A FOUNDER WOULD CHECK IT: the address is nowhere in
# the folder at all. Not in a person file, not in the sheet, not in a backup, not
# in the index and not in the log.
grep -r -F -e "$PX_GONE" growth-engine > "$CASEWORK/anywhere.txt" 2>/dev/null
assert_equals 0 "$(grep -c . "$CASEWORK/anywhere.txt" || true)" \
  "the address is nowhere in the folder"
assert_equals 0 "$(grep -r -c -F -e "$PX_OPENER" growth-engine 2>/dev/null | grep -v ':0$' | grep -c . || true)" \
  "and neither is the line that was written to them"

# What ge said it did. A purge that quietly regenerated the sheet and said
# nothing would leave a founder with no reason to believe it had.
assert_contains "$CASEWORK/purge.out" 'purged people/sam-carter-northfield-io.md' \
  "the receipt names the file it destroyed"
assert_contains "$CASEWORK/purge.out" 'This cannot be undone' \
  "and says it cannot be undone"
assert_contains "$CASEWORK/purge.out" 'wrote growth-engine/outreach-firstlines.csv  1 prospect' \
  "and says the sheet was written again, with the count that is left"
# The count in front of this changes with how many copies were in the ring, so
# the sentence is matched from the word after it. Anchoring on "1 backup" would
# be a check of the arithmetic in a line that is here to say what was destroyed.
assert_contains "$CASEWORK/purge.out" 'of the exported sheet, which held the same details' \
  "and says the copies of the sheet went too"
assert_contains "$CASEWORK/purge.out" '→ run: ge person list' \
  "and ends with something to run"

# ------------------------------------------- the other export, and the founder's own words

# ge owns the marked block in dm-openers.md and the audience engine owns the
# rest. The purge visits this file, so the founder's half is compared byte for
# byte across the visit.
assert_bytes_equal "$CASEWORK/openers.before" growth-engine/dm-openers.md \
  "the openers file is byte for byte what it was"
t_region growth-engine/dm-openers.md '## My own notes' > "$CASEWORK/mine.after" \
  || t_die "the founder's own half of the openers file could not be read again." "sh tests/run.sh again"
assert_bytes_equal "$CASEWORK/mine.before" "$CASEWORK/mine.after" \
  "and the founder's own half of it is untouched"
assert_contains growth-engine/dm-openers.md 'Helen Okafor' \
  "and the target is still in the block ge owns"

# ITS BACKUPS ARE NOT EMPTIED, and that is a different answer from the sheet's on
# purpose. The sheet is written whole from people/ and holds nothing else, so
# nothing is lost by emptying its ring. This file holds the founder's own
# writing, so emptying its ring would destroy work that has nothing to do with
# the person being purged. Two before the purge is one from the snapshot above
# and one from the export the purge ran.
assert_snapshots dm-openers.md 2 \
  "the copies of the openers file are kept, because they hold the founder's own writing"

# ---------------------------------------------------------------- who is left

sh "$GE" person list > "$CASEWORK/list.out" 2>&1
assert_exit 0 $? "ge person list exits 0"
assert_equals 2 "$(grep -c . "$CASEWORK/list.out")" "two people are left"
assert_lacks "$CASEWORK/list.out" "$PX_GONE" "and the purged one is not among them"

# --------------------------------------- a folder that never asked for a sheet

# Only the exports that are already there are written again. Writing one a
# founder has never asked for would put a file holding real people's addresses
# into their folder as a side effect of a deletion, which is not what they asked
# ge to do, and it is the opposite of the fault this case is about.
PX_BARE="$PX_ROOT/never exported"
mkdir -p "$PX_BARE" || t_die "the second work folder could not be made." \
  "df -h ${TMPDIR:-/tmp}"
cd "$PX_BARE" || t_die "the second work folder is not there." "sh tests/run.sh again"
HOME=$PX_BARE
export HOME
GE_T_HOME="$PX_BARE/growth-engine"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed in the second folder." "sh tests/run.sh again"
sh "$GE" person add prospect "$PX_GONE" "Sam Carter" > /dev/null 2>&1 \
  || t_die "the prospect could not be added in the second folder." "sh tests/run.sh again"
sh "$GE" person set "$PX_GONE" status stopped > /dev/null 2>&1 \
  || t_die "the status could not be set in the second folder." "sh tests/run.sh again"
assert_absent growth-engine/outreach-firstlines.csv "this folder has never exported a sheet"
sh "$GE" person purge "$PX_GONE" > "$CASEWORK/purge-bare.out" 2>&1
assert_exit 0 $? "purging where no sheet was ever exported exits 0"
assert_absent growth-engine/outreach-firstlines.csv \
  "and no sheet is written as a side effect of a deletion"
assert_absent growth-engine/dm-openers.md \
  "and neither is the openers file"
assert_lacks "$CASEWORK/purge-bare.out" 'wrote growth-engine/outreach-firstlines.csv' \
  "and ge does not say it wrote one"

t_done
