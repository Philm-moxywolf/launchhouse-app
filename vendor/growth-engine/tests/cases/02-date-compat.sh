#!/bin/sh
# 02-date-compat.sh — golden test for both branches of lib/date_compat.sh.
#
# WHY IT EXISTS: the library detects GNU date or BSD date once, at load, so on
#                any one machine only one of its two branches ever runs. The
#                other one ships to founders untested. Every snapshot stamp,
#                every ops-log day heading and every follow-up date goes through
#                it, so a branch that is out by a day is a founder's follow-up
#                sent on the wrong morning, on a laptop nobody here owns.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/02-date-compat/   WRITES: tests/.work/<shell>/02-date-compat/
# POSTURE:       fail-closed. The two branches must agree byte for byte on every
#                answer, and each branch's whole report is held against a fixture.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Both branches run on every
#                machine, because the date command itself is put on PATH by hand.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 02-date-compat

LIB="$REPO/plugins/growth-engine/scripts/lib/date_compat.sh"
[ -f "$LIB" ] || t_die "there is no date_compat.sh at $LIB." \
  "git status, to see whether scripts/lib is missing from your checkout"

# The stand-in date commands go in the sandbox rather than being run from the
# fixture folder, because the exec bit does not survive every checkout and this
# is the one place it can be put back without touching what is committed.
cp -R "$FIX/epoch.sh" "$FIX/probe.sh" "$SANDBOX/" || t_die "the date stand-ins would not copy." "ls -l $FIX"
for flavour in gnu bsd; do
  mkdir -p "$SANDBOX/bin-$flavour"
  cp "$FIX/bin-$flavour/date" "$SANDBOX/bin-$flavour/date" || \
    t_die "the $flavour date stand-in would not copy." "ls -l $FIX/bin-$flavour"
  chmod +x "$SANDBOX/bin-$flavour/date"
done
# epoch.sh is sourced by the stand-in as ../epoch.sh, so it has to sit one level
# above them, exactly as it does in the fixture.
cd "$SANDBOX" || t_die "the sandbox for 02-date-compat is not there." "sh tests/run.sh again"

for flavour in gnu bsd; do
  PATH="$SANDBOX/bin-$flavour:$PATH" sh "$SANDBOX/probe.sh" "$LIB" \
    > "$CASEWORK/$flavour.out" 2>"$CASEWORK/$flavour.err"
  assert_exit 0 $? "the $flavour branch runs"
  assert_raw_equal "$FIX/expect.out/$flavour.txt" "$CASEWORK/$flavour.out" "the $flavour branch report"
done

# Each branch has to have actually been taken. Without this the case would still
# pass if the detection stopped working and both runs fell to the same branch.
assert_contains "$CASEWORK/gnu.out" 'branch=gnu' "a date that takes -d selects the GNU branch"
assert_contains "$CASEWORK/bsd.out" 'branch=bsd' "a date that refuses -d selects the BSD branch"

# The point of the whole case: with the branch line taken out, the two reports
# are the same bytes. Anything else means a founder on one platform gets a
# different number from a founder on the other.
grep -v '^branch=' "$CASEWORK/gnu.out" > "$CASEWORK/gnu.same"
grep -v '^branch=' "$CASEWORK/bsd.out" > "$CASEWORK/bsd.same"
assert_bytes_equal "$CASEWORK/gnu.same" "$CASEWORK/bsd.same" "both branches give the same answers"

# The fail-closed promise, stated in the library's own header: nothing printed
# and a return code of 1, rather than a number that looks usable.
assert_contains "$CASEWORK/gnu.out" 'iso_to_epoch [not-a-date] rc=1 out=[]' "GNU branch refuses a date it cannot read"
assert_contains "$CASEWORK/bsd.out" 'iso_to_epoch [not-a-date] rc=1 out=[]' "BSD branch refuses a date it cannot read"
assert_contains "$CASEWORK/gnu.out" 'iso_to_epoch [] rc=1 out=[]' "GNU branch refuses an empty value"
assert_contains "$CASEWORK/bsd.out" 'iso_to_epoch [] rc=1 out=[]' "BSD branch refuses an empty value"

# One arithmetic answer checked against a number worked out by hand, so the two
# branches agreeing cannot mean they are agreeing on the same mistake.
assert_contains "$CASEWORK/gnu.out" 'iso_to_epoch [1970-01-01] rc=0 out=[0]' "the epoch itself is zero"

# The stamp has no colon in it. A colon is illegal in a Windows filename and
# every snapshot in the ring is named with this.
assert_contains "$CASEWORK/gnu.out" 'utc_stamp=20260925T000000Z' "the stamp is filename safe"

t_done
