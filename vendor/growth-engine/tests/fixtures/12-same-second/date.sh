#!/bin/sh
# date: the real date, with the one call the snapshot ring is named from stopped.
#
# WHY IT EXISTS: two writes to the same file inside one second is the case the
#                ring's tie-breaker exists for, and on a fast machine it happens
#                by accident and on a slow one it does not. A test that only
#                sometimes reaches the code it is testing is not a test. This
#                pins the snapshot stamp and nothing else, so every write in the
#                case lands in the same second on every machine, and the ops log,
#                the accounts stamp and the day headings still read the real clock.
# CALLED BY:     tests/cases/12-same-second.sh, through PATH
# READS:         nothing              WRITES: nothing
# POSTURE:       fail-open. Anything other than the one pinned call is handed to
#                the real date, so no other behaviour is changed by being here.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. The real date is found by
#                taking this folder off the front of PATH, never by naming a
#                path, because it is /bin/date in some places and /usr/bin/date
#                in others.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

# The stopped second. 2026-09-25 is the first morning of the event.
GE_T_STAMP=20260925T091500Z

# utc_stamp in lib/date_compat.sh, and nothing else, is exactly these two words.
if [ $# -eq 2 ] && [ "$1" = -u ] && [ "$2" = '+%Y%m%dT%H%M%SZ' ]; then
  printf '%s\n' "$GE_T_STAMP"
  exit 0
fi

gt_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || {
  printf 'FAIL  the stand-in date cannot work out where it lives.\n' >&2
  printf '      → run: sh tests/run.sh again\n' >&2
  exit 1
}
# Taken off the front of PATH with parameter expansion. A value is never pasted
# into a sed script anywhere in this toolkit: a path can carry any character at
# all, and one of them would rewrite the script rather than be matched by it.
PATH=${PATH#"$gt_dir":}
export PATH
exec date "$@"
