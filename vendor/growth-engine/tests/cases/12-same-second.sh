#!/bin/sh
# 12-same-second.sh: two writes inside one second, and the ring keeps ten of them.
#
# WHY IT EXISTS: a skill writes the receipt and the accounts cache several times
#                in a row, and those writes land inside the same second. The
#                backup of each one is named after that second, so without a
#                tie-breaker the second copy lands on top of the first through
#                mv and the founder's state quietly disappears from the ring
#                while the ring still says it is there. Both of these files are
#                also dot-prefixed once flattened, which is the shape a plain
#                glob does not see, so this is the exact pair where "no snapshot,
#                no write" was silently not happening.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/12-same-second/date   WRITES: tests/.work/<shell>/12-same-second/
# POSTURE:       fail-closed. The clock is stopped for the snapshot stamp only,
#                so the same-second path runs on every machine rather than on a
#                fast one, and the contents of every backup in the ring are read
#                back rather than counted.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 12-same-second
cd "$SANDBOX" || t_die "the sandbox for 12-same-second is not there." "sh tests/run.sh again"

# The stand-in goes in the sandbox rather than being run out of the fixture
# folder, because the exec bit does not survive every checkout and this is the
# one place it can be put back without changing what is committed. It is
# committed as date.sh and copied to date, because .gitattributes keeps a .sh
# file LF on a Windows checkout and a CRLF on a shebang line is a stand-in that
# cannot run at all under Git Bash.
mkdir -p "$SANDBOX/bin-stopped" || t_die "the stand-in folder could not be made." "df -h ${TMPDIR:-/tmp}"
cp "$FIX/date.sh" "$SANDBOX/bin-stopped/date" || \
  t_die "the stopped date stand-in would not copy." "ls -l $FIX"
chmod +x "$SANDBOX/bin-stopped/date"
STAMP=20260925T091500Z
RING="$SANDBOX/growth-engine/.state/snapshots"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# ge_ring_names <flat name>: every backup of one file, oldest first. Written here
# rather than with ls, because ls does not list a dot-prefixed name and both of
# the files in this case flatten to one.
ge_ring_names() {                       # <flat name>
  for rn_f in "$RING"/* "$RING"/.[!.]* "$RING"/..?*; do
    [ -e "$rn_f" ] || continue
    rn_b=${rn_f##*/}
    case $rn_b in
      "$1".*) printf '%s\n' "$rn_b" ;;
    esac
  done | LC_ALL=C sort
}

# ge_ring_last <flat name> <which>: the last line of one backup, so the state it
# was holding can be read rather than assumed. oldest or newest.
ge_ring_last() {                        # <flat name> <oldest|newest>
  if [ "$2" = oldest ]; then
    rl_n=$(ge_ring_names "$1" | sed -n '1p')
  else
    rl_n=$(ge_ring_names "$1" | sed -n '$p')
  fi
  [ -n "$rl_n" ] || return 0
  sed -n '$p' "$RING/$rl_n"
}

# ---------------------------------------------------------------- the receipt

# 1. Fourteen writes, one after another, with the stamp stopped so every one of
#    them is inside the same second.
i=1
while [ "$i" -le 14 ]; do
  PATH="$SANDBOX/bin-stopped:$PATH" sh "$GE" receipt set "check$i" PASS "evidence $i" \
    > "$CASEWORK/receipt-$i.out" 2>&1 || t_die "ge receipt set failed on write $i." \
      "cat $CASEWORK/receipt-$i.out"
  i=$((i + 1))
done

# The stand-in really was in the way. Without this the case would pass on a run
# where every write got its own second, which is not the case being tested.
assert_equals 1 "$(ge_ring_names .state__receipt.md | sed -n '1p' | grep -c "$STAMP")" \
  "the oldest backup of the receipt carries the one stopped second"
assert_equals 10 "$(ge_ring_names .state__receipt.md | grep -c "$STAMP")" \
  "and so do all ten, so the tie-breaker is the only thing telling them apart"

# 2. The ring caps. Thirteen backups were taken, because the first write had
#    nothing to copy, and ten is what a ring of ten holds.
assert_snapshots .state/receipt.md 10 "the receipt ring caps at 10"

# 3. Nothing was lost. Every one of the fourteen writes is in the file.
assert_equals 14 "$(grep -c '^check[0-9]* PASS' growth-engine/.state/receipt.md)" \
  "all fourteen writes are in the receipt"
assert_contains growth-engine/.state/receipt.md 'check14 PASS evidence 14' \
  "and the last one is the last one"

# 4. The ten copies are ten different states, not one state copied ten times.
#    This is what a lost write looks like from the outside: the count is right
#    and two of the files are the same bytes.
assert_equals 10 "$(ge_ring_names .state__receipt.md | while IFS= read -r n; do
  sed -n '$p' "$RING/$n"
done | LC_ALL=C sort -u | grep -c '')" "the ten backups hold ten different states"

# 5. The oldest was dropped and the newest was kept, which is the way round that
#    matters: a founder reaching for undo wants the state before the last write.
assert_equals 'check13 PASS evidence 13' "$(ge_ring_last .state__receipt.md newest)" \
  "the newest backup holds the state the last write replaced"
assert_equals 'check4 PASS evidence 4' "$(ge_ring_last .state__receipt.md oldest)" \
  "and the oldest backup left is the fourth state, so pruning dropped the oldest three"

# ---------------------------------------------------------------- the accounts

# 6. The same shape again on the other dot-prefixed file. ge accounts set
#    replaces the whole cache every time, so a lost backup here is a founder's
#    only record of which page they were posting to.
i=1
while [ "$i" -le 14 ]; do
  printf 'acc_%s|facebook|Page %s\n' "$i" "$i" \
    | PATH="$SANDBOX/bin-stopped:$PATH" sh "$GE" accounts set > "$CASEWORK/accounts-$i.out" 2>&1 \
    || t_die "ge accounts set failed on write $i." "cat $CASEWORK/accounts-$i.out"
  i=$((i + 1))
done

assert_snapshots .state/ghl-accounts.md 10 "the accounts ring caps at 10"
assert_equals 10 "$(ge_ring_names .state__ghl-accounts.md | grep -c "$STAMP")" \
  "and every one of those is inside the one stopped second too"
assert_equals 10 "$(ge_ring_names .state__ghl-accounts.md | while IFS= read -r n; do
  sed -n '$p' "$RING/$n"
done | LC_ALL=C sort -u | grep -c '')" "the ten accounts backups hold ten different states"
assert_equals 'acc_13|facebook|Page 13' "$(ge_ring_last .state__ghl-accounts.md newest)" \
  "the newest accounts backup holds the state the last write replaced"
assert_equals 'acc_4|facebook|Page 4' "$(ge_ring_last .state__ghl-accounts.md oldest)" \
  "and the oldest one left is the fourth state"

sh "$GE" accounts list > "$CASEWORK/list.out" 2>&1
assert_exit 0 $? "ge accounts list reads the cache back"
assert_equals 'acc_14|facebook|Page 14' "$(cat "$CASEWORK/list.out")" \
  "and the cache holds the last write, whole"

# 7. Neither file's backups went in the other file's pile. Both flatten to a
#    name beginning .state__, and a prefix match rather than a name match would
#    count the two together and prune ten of somebody's backups away.
assert_equals 10 "$(ge_ring_names .state__receipt.md | grep -c '')" \
  "the receipt still has its own ten after the accounts writes"
assert_snapshots .state/receipt.md 10 "counted the other way round as well"

# 8. One more write, and the ring is still ten. A ring that grows by one every
#    time is a folder nobody is watching filling up on a founder's laptop.
PATH="$SANDBOX/bin-stopped:$PATH" sh "$GE" receipt set check15 PASS "evidence 15" > /dev/null 2>&1
assert_snapshots .state/receipt.md 10 "a fifteenth write leaves the ring at 10"
assert_equals 'check14 PASS evidence 14' "$(ge_ring_last .state__receipt.md newest)" \
  "and the newest backup has moved on by one"

t_done
