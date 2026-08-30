#!/bin/sh
# probe.sh — reports what lib/date_compat.sh does on whichever date is on PATH.
#
# WHY IT EXISTS: the library picks a branch once, at load, and never says which.
#                Running the same questions through both branches and printing
#                the answers is the only way to see that they agree, and the only
#                way a disagreement between a Mac and a Windows Home laptop turns
#                into a red test rather than two founders comparing notes.
# CALLED BY:     tests/cases/02-date-compat.sh
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

printf 'branch=%s\n' "$GE_DATE"
printf 'now_epoch=%s\n' "$(now_epoch)"
printf 'utc_stamp=%s\n' "$(utc_stamp)"
printf 'today_iso=%s\n' "$(today_iso)"
# One reading of the clock giving both halves, which is what cmd/log.sh files an
# entry under. Both branches have to answer it the same way, because a founder
# on a Mac and a founder on Git Bash read the same day heading out of it.
printf 'now_local=%s\n' "$(now_local)"

# One line per input, carrying the return code as well as the answer. The return
# code is half the contract: iso_to_epoch promises to print nothing and return 1
# rather than hand back a plausible wrong number.
while IFS= read -r probe_v; do
  case $probe_v in '(empty)') probe_v='' ;; esac
  probe_out=$(iso_to_epoch "$probe_v")
  probe_rc=$?
  printf 'iso_to_epoch [%s] rc=%s out=[%s]\n' "$probe_v" "$probe_rc" "$probe_out"
done <<'INPUTS'
1970-01-01
2026-09-25
2026-09-25T09:30:00
2026-01-01
not-a-date
(empty)
INPUTS
