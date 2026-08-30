#!/bin/sh
# probe.sh — the three readings of the clock in lib/date_compat.sh, side by side.
#
# WHY IT EXISTS: two of the three read the founder's own zone and one reads UTC,
#                and which is which is a decision rather than an accident. The
#                library never says which it did, so the only way to see the
#                decision is to ask it the three questions at one instant and
#                print the answers. Read at 03:00 UTC from a founder in Atlanta,
#                two of them say the day before and one says the day after, and
#                the case around this holds each to the right side.
# CALLED BY:     tests/cases/34-timezone.sh
# READS:         the path to lib/date_compat.sh, given as the first argument
# WRITES:        standard output only
# POSTURE:       fail-closed. A library it cannot load exits 1 rather than
#                reporting an empty run as a clean one.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

[ -f "${1:-}" ] || {
  printf 'FAIL  probe.sh needs the path to lib/date_compat.sh.\n      → run: sh probe.sh plugins/growth-engine/scripts/lib/date_compat.sh\n' >&2
  exit 1
}

. "$1"

# TZ is printed back so a reader of a failed run can see which zone produced the
# lines under it, rather than working it out from the file name.
printf 'TZ=%s\n' "${TZ:-(unset)}"
printf 'now_epoch=%s\n' "$(now_epoch)"
# UTC, always. It names files in the snapshot ring, and a ring that renamed
# itself twice a year when the clocks changed would sort out of order.
printf 'utc_stamp=%s\n' "$(utc_stamp)"
# The founder's own day. This is the day they will look for in an ops log and
# the day they will count a follow up from.
printf 'today_iso=%s\n' "$(today_iso)"
# The founder's own day and clock, from ONE reading. Printed whole, because the
# case checks that its day half is the same day today_iso gave: two readings
# either side of midnight is how an entry ends up filed under a day the founder
# has already scrolled past, in a file that is only ever appended to.
printf 'now_local=%s\n' "$(now_local)"
