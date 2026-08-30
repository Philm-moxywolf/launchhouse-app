#!/bin/sh
# date_compat.sh: one date interface across BSD and GNU.
#
# WHY IT EXISTS: macOS ships BSD date, Linux and Git Bash ship GNU date, and
#                their flags are incompatible. Every timestamp in the brain
#                would otherwise be a per-platform bug, and snapshot stamps and
#                the ops log are exactly where that would silently corrupt.
# CALLED BY:     ge.sh and every subcommand that stamps or compares a time
# READS:         nothing            WRITES: nothing
# POSTURE:       fail-closed. An unparseable timestamp returns empty and the
#                caller must treat that as an error, never as "now"
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Detects date flavour once.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHICH DAY IT IS, AND WHERE THAT COMES FROM. Two of the functions below read
# the clock in the founder's own timezone and one reads it in UTC, and which is
# which is a decision rather than an accident.
#
#   today_iso and now_local  the founder's day and the founder's clock. This is
#                            the day they will look for in an ops log, and the
#                            day they will count a follow up from.
#   utc_stamp                UTC, always. It names files in the snapshot ring,
#                            and a ring that renamed itself twice a year when
#                            the clocks changed would sort out of order.
#
# The founder's timezone comes from TZ in the environment, which is where every
# date command on every platform already reads it from, and from nowhere else.
# Nothing here sets it, reads it or checks it: a laptop leaves it unset and gets
# the machine's own zone, which is right, and anything running somewhere the
# machine's zone is not the founder's has to set it in the environment it starts
# ge in. Get that wrong and a founder in Atlanta logging at 22:00 on the 24th
# reads a heading dated the 25th, and an ops log is append only, so the wrong
# day is the day for ever. tests/cases/34-timezone.sh is what holds this.
set -u

# Detected once per process. GNU date accepts -d, BSD date rejects it.
if date -d @0 >/dev/null 2>&1; then
  GE_DATE=gnu
else
  GE_DATE=bsd
fi

# now_epoch: seconds since the epoch, as a bare integer.
now_epoch() {
  date +%s
}

# utc_stamp: the snapshot-ring stamp. Sortable, filename-safe, no colons,
# because a colon is illegal in a Windows filename and snapshots are files.
utc_stamp() {
  date -u +%Y%m%dT%H%M%SZ
}

# today_iso: the date entries are stamped with, in the founder's own timezone
# because that is the day they will look for.
today_iso() {
  date +%Y-%m-%d
}

# now_local: the day and the time together, in the founder's own timezone, from
# ONE reading of the clock.
#
# WHY IT IS ONE READING AND NOT TWO. today_iso followed by a separate call for
# the time can straddle midnight, and an entry filed under the wrong day stays
# wrong for ever in a file that is only ever appended to. The caller splits the
# two halves at the space.
#
# WHY IT LIVES HERE. It was written out in cmd/log.sh, which meant the one
# reading in this toolkit that is most sensitive to TZ sat in the one place the
# header above does not describe. Every reading of the clock is in this file
# now, so there is one place to look when the day comes out wrong and one place
# to change if it ever has to.
now_local() {
  date '+%Y-%m-%d %H:%M'
}

# iso_to_epoch <iso8601>: converts to epoch seconds, or prints nothing and
# returns 1. Printing nothing matters: a caller that forgets to check gets an
# empty string rather than a plausible wrong number.
iso_to_epoch() {
  ge_iso=${1:-}
  [ -n "$ge_iso" ] || return 1
  if [ "$GE_DATE" = gnu ]; then
    date -d "$ge_iso" +%s 2>/dev/null || return 1
  else
    # BSD needs the input format spelled out. Try the two shapes the brain
    # writes, longest first, and give up rather than guess.
    date -j -f '%Y-%m-%dT%H:%M:%S' "$ge_iso" +%s 2>/dev/null && return 0
    date -j -f '%Y-%m-%d' "$ge_iso" +%s 2>/dev/null && return 0
    return 1
  fi
}
