#!/bin/sh
# 16-index.sh: golden test for ge index, the derived table every gate is read from.
#
# WHY IT EXISTS: the index is what a skill and a founder both read to answer "is
#                that done". A row that goes missing reads as "you have not done
#                that" and is not true, and a founder chasing a file they already
#                wrote loses an afternoon of a three day event. The other failure
#                is rule 1 of the whole design: this table decides which files a
#                founder is shown, so a leak here shows a B2C founder the B2B
#                material and tells them they are behind on work that was never
#                theirs.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/16-index/   WRITES: tests/.work/<shell>/16-index/
# POSTURE:       fail-closed. The whole table is held against a fixture, and the
#                track fork is asserted in both directions.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 16-index

WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"

# 1. No folder. The refusal names the command that makes one.
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME
sh "$GE" index > "$CASEWORK/nofolder.out" 2>&1
assert_exit 1 $? "ge index with no folder exits 1"
assert_raw_equal "$FIX/expect.out/nofolder.txt" "$CASEWORK/nofolder.out" "the no folder refusal"
HOME=$OLDHOME
export HOME

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# 2. A new folder. Every gated file that is not there yet is listed as missing
#    rather than left out, because a row that is not there is a question the
#    founder cannot answer.
sh "$GE" index > "$CASEWORK/new.out" 2>&1
assert_exit 0 $? "ge index on a new folder exits 0"
assert_contains "$CASEWORK/new.out" '| founder-brain.md | gate A | missing | - | - |' \
  "a file that is not there yet is listed as missing"
assert_contains "$CASEWORK/new.out" '| people/ | gate B or C | empty | 0 files | - |' \
  "and an empty people folder is empty, which is the normal first state"
assert_contains "$CASEWORK/new.out" "Written to $WORKDIR/growth-engine/.state/index.md" \
  "and it says where it wrote the table"
assert_contains growth-engine/.state/index.md '| file | gate | status | bytes | modified |' \
  "the table on disk carries its heading row"

# 3. The track fork, rule 1 of the design. With no track set, neither track's
#    session 3 files are listed, because showing both shows one founder the other
#    track's material.
assert_equals 0 "$(grep -c 'outreach-sequence.md' "$CASEWORK/new.out")" \
  "an unlocked brain is shown no b2b files"
assert_equals 0 "$(grep -c 'dm-openers.md' "$CASEWORK/new.out")" \
  "and no b2c files either"

# 4. A b2b brain sees the b2b files and never the b2c ones.
printf '# Founder brain\n\nTrack: b2b\nLocked: 2026-09-01\n' > growth-engine/founder-brain.md
sh "$GE" index > "$CASEWORK/b2b.out" 2>&1
assert_exit 0 $? "ge index on a b2b brain exits 0"
assert_contains "$CASEWORK/b2b.out" 'outreach-sequence.md' "a b2b founder is shown the b2b files"
assert_contains "$CASEWORK/b2b.out" 'outreach-firstlines.csv' "both of them"
assert_equals 0 "$(grep -c 'dm-openers.md' "$CASEWORK/b2b.out")" \
  "and never the other track's material"
assert_equals 0 "$(grep -c 'hook-bank.md' "$CASEWORK/b2b.out")" "not one line of it"

# 5. And the other way round.
printf '# Founder brain\n\nTrack: b2c\nLocked: 2026-09-01\n' > growth-engine/founder-brain.md
sh "$GE" index > "$CASEWORK/b2c.out" 2>&1
assert_exit 0 $? "ge index on a b2c brain exits 0"
assert_contains "$CASEWORK/b2c.out" 'dm-openers.md' "a b2c founder is shown the b2c files"
assert_contains "$CASEWORK/b2c.out" 'hook-bank.md' "and the hook bank"
assert_equals 0 "$(grep -c 'outreach-sequence.md' "$CASEWORK/b2c.out")" \
  "and never the b2b sequence"

# 6. A file that is there, with nothing in it, is not the same as a file that is
#    done. Both are said in the founder's own words.
true > growth-engine/content-30.md || t_die "content-30.md could not be emptied." "chmod u+w $SANDBOX/growth-engine"
sh "$GE" index > "$CASEWORK/empty.out" 2>&1
assert_contains "$CASEWORK/empty.out" '| content-30.md | gate B | empty |' \
  "a file with nothing in it reads as empty"
printf 'thirty pieces, one a day\n' > growth-engine/content-30.md
sh "$GE" index > "$CASEWORK/filled.out" 2>&1
assert_contains "$CASEWORK/filled.out" '| content-30.md | gate B | ok | 25 |' \
  "and a file with something in it reads as ok, with its size"

# 7. The whole table, word for word. This is the one a skill parses.
sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1
printf '# Founder brain\n\nTrack: b2b\nLocked: 2026-09-01\n' > growth-engine/founder-brain.md
sh "$GE" index > "$CASEWORK/full.out" 2>&1
assert_exit 0 $? "ge index with a person and a brain exits 0"
assert_files_equal "$FIX/expect.out/full.txt" "$CASEWORK/full.out" "the table ge index prints"
assert_contains "$CASEWORK/full.out" '| people/ | gate B or C | ok | 1 file |' \
  "one person reads as one file, not one files"

# 8. The index is derived, so it is the one founder file that is rewritten
#    without a backup. Asserted, because "no snapshot, no write" holds everywhere
#    else and a reader of this suite should be able to see the exception stated.
assert_snapshots .state/index.md 0 "the index is rebuilt without a backup, because it is derived"

# 9. Rebuilding twice in a row leaves the same table. A table that moves on its
#    own is a table nobody can compare between two sessions.
sh "$GE" index > "$CASEWORK/again.out" 2>&1
assert_exit 0 $? "a second ge index exits 0"
assert_bytes_equal "$CASEWORK/full.out" "$CASEWORK/again.out" "and prints the same table"

# 10. No temp file is left behind. The build goes through one, and a half built
#     table left where a skill is about to read a whole one is the reason why.
assert_equals 0 "$(ls -a growth-engine/.state | grep -c 'index.md.ge-tmp')" \
  "the rebuild left no temp file behind"

t_done
