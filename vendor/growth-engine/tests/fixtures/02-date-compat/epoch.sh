#!/bin/sh
# epoch.sh — turns an ISO timestamp into epoch seconds, with no date command.
#
# WHY IT EXISTS: the two stand-in date commands beside this file have to agree
#                on the answer, or the test proving GNU and BSD produce the same
#                number would only be proving that two fakes were written the
#                same afternoon. One arithmetic conversion, shared by both, is
#                what makes a difference between the branches mean something.
# CALLED BY:     tests/fixtures/02-date-compat/bin-gnu/date and bin-bsd/date
# READS:         nothing             WRITES: nothing
# POSTURE:       fail-closed. A shape it was not given returns 1 and prints
#                nothing, which is what lib/date_compat.sh promises its callers.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Shell arithmetic only, so it
#                behaves the same on macOS, Linux and Git Bash.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

# Leading zeros stripped by hand. Shell arithmetic reads 08 as octal and stops.
ge_t_num() {
  gtn=${1#0}
  gtn=${gtn#0}
  [ -n "$gtn" ] || gtn=0
  printf '%s' "$gtn"
}

# ge_t_epoch <YYYY-MM-DD | YYYY-MM-DDTHH:MM:SS>: seconds since 1970-01-01 UTC.
#
# Days from civil, the standard integer form. It is used rather than a table of
# month lengths because a table gets leap years wrong on one line and nobody
# notices until a founder's follow-up date lands a day out in March.
ge_t_epoch() {
  gte_v=$1
  gte_time=0
  case $gte_v in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
      gte_d=$gte_v ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9])
      gte_d=${gte_v%T*}
      gte_t=${gte_v#*T}
      gte_hh=${gte_t%%:*}
      gte_rest=${gte_t#*:}
      gte_mm=${gte_rest%%:*}
      gte_ss=${gte_rest#*:}
      gte_time=$(( $(ge_t_num "$gte_hh") * 3600 + $(ge_t_num "$gte_mm") * 60 + $(ge_t_num "$gte_ss") )) ;;
    *)
      return 1 ;;
  esac

  gte_y=$(ge_t_num "${gte_d%%-*}")
  gte_r=${gte_d#*-}
  gte_m=$(ge_t_num "${gte_r%%-*}")
  gte_day=$(ge_t_num "${gte_r#*-}")

  [ "$gte_m" -ge 1 ] && [ "$gte_m" -le 12 ] || return 1
  [ "$gte_day" -ge 1 ] && [ "$gte_day" -le 31 ] || return 1

  # March is treated as the first month, so the leap day falls at the end of the
  # year and needs no special case anywhere below.
  [ "$gte_m" -le 2 ] && gte_y=$((gte_y - 1))
  gte_era=$((gte_y / 400))
  gte_yoe=$((gte_y - gte_era * 400))
  if [ "$gte_m" -gt 2 ]; then gte_mp=$((gte_m - 3)); else gte_mp=$((gte_m + 9)); fi
  gte_doy=$(( (153 * gte_mp + 2) / 5 + gte_day - 1 ))
  gte_doe=$(( gte_yoe * 365 + gte_yoe / 4 - gte_yoe / 100 + gte_doy ))
  gte_days=$(( gte_era * 146097 + gte_doe - 719468 ))

  printf '%s\n' $(( gte_days * 86400 + gte_time ))
}
