#!/bin/sh
# 34-timezone.sh: the founder's own day, and the one file that cannot be corrected.
#
# WHY IT EXISTS: lib/date_compat.sh stamps entries in the founder's own timezone,
#                deliberately, because the founder's own day is the day they will
#                look for. On a laptop that is free: TZ is unset, and date reads
#                the machine's own zone, which is the founder's. A container is
#                not a laptop. A container runs UTC, and a founder in Atlanta
#                logging at 22:00 on the 24th would read a heading dated the
#                25th. ops-log.md is append only. It is the only complete record
#                of what a founder did, ge keeps no backup of it, and there is no
#                verb that edits it, so the wrong day is the day for ever.
#
#                THE FIX IS ONE LINE IN THE ENVIRONMENT AND NOTHING IN ge: the
#                caller sets TZ to the founder's own IANA zone, and every date
#                command on every platform already reads it from there. This case
#                is what holds that, from both ends: the three readings in the
#                library, and the day heading a founder actually reads.
#
#                THE OTHER HALF, WHICH IS EASY TO BREAK WHILE FIXING THE FIRST.
#                utc_stamp is UTC and must stay UTC, because it names every file
#                in the snapshot ring, and a ring that renamed itself twice a
#                year when the clocks changed would sort out of order and hand
#                the founder back the wrong version. So this case asserts both
#                sides at one instant: the day goes back, the stamp does not.
#
#                WHY THE CLOCK IS STOPPED. For nineteen hours of every day
#                Atlanta and UTC agree on the date, so a case run against the
#                real clock would go green five days in six having proved
#                nothing. fixtures/34-timezone/bin/date freezes one instant,
#                03:00 UTC, and hands everything else to the real date, so the
#                zone handling under test is the operating system's own.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/34-timezone/   WRITES: tests/.work/<shell>/34-timezone/
# POSTURE:       fail-closed. The machine is asked first whether it can tell two
#                zones apart at all, and the case ends outright if it cannot: a
#                machine with no zone database proves none of this, and a suite
#                that goes green on checks it never ran is worth less than no
#                suite. The stopped clock is proved to be in front before a word
#                of any answer is read.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Both date flavours are handled
#                by the stand-in, which asks which one is in front the same way
#                lib/date_compat.sh asks it.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 34-timezone

LIB="$REPO/plugins/growth-engine/scripts/lib/date_compat.sh"
[ -f "$LIB" ] || t_die "there is no date_compat.sh at $LIB." \
  "git status, to see whether scripts/lib is missing from your checkout"

# THE INSTANT. 03:00 UTC on 25 September 2026, which is the first morning of the
# event. In Atlanta it is 23:00 on the 24th, and the whole of this case is the
# difference between those two sentences.
TZ_NOW=1790305200
TZ_UTC_DAY=2026-09-25
TZ_UTC_CLOCK=03:00
TZ_LOCAL_DAY=2026-09-24
TZ_LOCAL_CLOCK=23:00
TZ_STAMP=20260925T030000Z
# Atlanta's zone. Named the IANA way and never as an offset, because an offset
# cannot know about a clock change and the event runs the week one is coming.
TZ_ZONE=America/New_York

# The real date, found before anything is put in front of it. Absolute, because
# the stand-in runs with the stand-in's own folder at the front of PATH and a
# bare name would find the stand-in again and go round for ever.
TZ_REAL=$(command -v date 2>/dev/null) || TZ_REAL=''
[ -n "$TZ_REAL" ] && [ -x "$TZ_REAL" ] || t_die "there is no date on PATH." \
  "command -v date, to see what is installed"

# ------------------------------------------------- can this machine tell two zones apart

# Asked by trying, not by reading a setting back, and asked of the REAL date
# before the stand-in is anywhere near PATH. A machine with no zone database
# answers both questions the same way, and on that machine nothing below this
# line is testing anything. Saying so is the only honest answer.
if "$TZ_REAL" -d @0 > /dev/null 2>&1; then
  TZ_PROBE_UTC=$(TZ=UTC "$TZ_REAL" -d "@$TZ_NOW" +%Y-%m-%d 2>/dev/null)
  TZ_PROBE_LOCAL=$(TZ=$TZ_ZONE "$TZ_REAL" -d "@$TZ_NOW" +%Y-%m-%d 2>/dev/null)
else
  TZ_PROBE_UTC=$(TZ=UTC "$TZ_REAL" -r "$TZ_NOW" +%Y-%m-%d 2>/dev/null)
  TZ_PROBE_LOCAL=$(TZ=$TZ_ZONE "$TZ_REAL" -r "$TZ_NOW" +%Y-%m-%d 2>/dev/null)
fi
[ "$TZ_PROBE_UTC" = "$TZ_UTC_DAY" ] || t_die \
  "this machine reads $TZ_NOW in UTC as [$TZ_PROBE_UTC] and not $TZ_UTC_DAY, so its clock arithmetic is not one this case can build on." \
  "date -u -r $TZ_NOW, or date -u -d @$TZ_NOW, and see what comes back"
t_pass
[ "$TZ_PROBE_LOCAL" = "$TZ_LOCAL_DAY" ] || t_die \
  "this machine has no $TZ_ZONE to read, so it cannot tell two zones apart and nothing in this case can be proved on it." \
  "ls /usr/share/zoneinfo/America/New_York, to see whether the zone database is installed"
t_pass

# ---------------------------------------------------------------- the stopped clock

# The stand-in goes in the sandbox rather than being run out of the fixture
# folder, because the exec bit does not survive every checkout and this is the
# one place it can be put back without touching what is committed.
mkdir -p "$SANDBOX/bin" || t_die "the folder for the stopped clock could not be made." \
  "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
cp "$FIX/bin/date" "$SANDBOX/bin/date" || t_die "the stopped clock would not copy." \
  "ls -l $FIX/bin"
chmod +x "$SANDBOX/bin/date" || t_die "the stopped clock would not be made runnable." \
  "ls -l $SANDBOX/bin/date"
cp "$FIX/probe.sh" "$SANDBOX/probe.sh" || t_die "the probe would not copy." "ls -l $FIX"

GE_T_REAL_DATE=$TZ_REAL
GE_T_NOW=$TZ_NOW
export GE_T_REAL_DATE GE_T_NOW
KEEP_PATH=$PATH
PATH="$SANDBOX/bin:$KEEP_PATH"
export PATH

# THE STOPPED CLOCK IS REALLY IN FRONT. Without this the whole case could be
# reading the real time and agreeing with itself, which is the shape of a test
# that has quietly stopped testing. Two questions: the seconds, which only the
# stand-in answers this way, and the day, which the real clock could not match.
assert_equals "$TZ_NOW" "$(date +%s)" "the stopped clock is the one on PATH"
assert_equals "$TZ_UTC_DAY" "$(TZ=UTC date +%Y-%m-%d)" \
  "and it reads as the day this case is written around"

# ------------------------------------------------- the three readings in the library

for tz_zone in "$TZ_ZONE" UTC; do
  tz_tag=local
  [ "$tz_zone" = UTC ] && tz_tag=utc
  TZ=$tz_zone sh "$SANDBOX/probe.sh" "$LIB" > "$CASEWORK/$tz_tag.out" 2>"$CASEWORK/$tz_tag.err"
  assert_exit 0 $? "the library answers under TZ=$tz_zone"
  assert_equals '' "$(cat "$CASEWORK/$tz_tag.err")" "and says nothing on the error stream"
done

# THE ONE THIS CASE IS FOR. The founder's day goes back, because at 03:00 UTC
# they are still on the evening before.
assert_contains "$CASEWORK/local.out" "today_iso=$TZ_LOCAL_DAY" \
  "in Atlanta the day is still the 24th at 03:00 UTC"
assert_contains "$CASEWORK/local.out" "now_local=$TZ_LOCAL_DAY $TZ_LOCAL_CLOCK" \
  "and the clock says 23:00, which is the evening the founder is working in"

# THE OTHER HALF, AND IT MUST NOT MOVE. The ring is named from this, and the
# ring has to sort in the order the copies were taken.
assert_contains "$CASEWORK/local.out" "utc_stamp=$TZ_STAMP" \
  "the snapshot stamp is UTC even for a founder who is on the day before"

# The control. The same instant read in UTC gives the other day, so the
# difference above is the timezone and not a number this case wrote down twice.
assert_contains "$CASEWORK/utc.out" "today_iso=$TZ_UTC_DAY" \
  "the same instant in UTC is the 25th"
assert_contains "$CASEWORK/utc.out" "now_local=$TZ_UTC_DAY $TZ_UTC_CLOCK" \
  "and the clock there says 03:00"
assert_contains "$CASEWORK/utc.out" "utc_stamp=$TZ_STAMP" \
  "and the snapshot stamp is the same one, because it never followed the zone"

# ONE READING OF THE CLOCK, NOT TWO. today_iso followed by a separate call for
# the time can straddle midnight, and this instant is one hour from it. The two
# have to agree about which day it is, in both zones.
for tz_tag in local utc; do
  tz_day=$(sed -n 's/^today_iso=//p' "$CASEWORK/$tz_tag.out")
  tz_now=$(sed -n 's/^now_local=//p' "$CASEWORK/$tz_tag.out")
  assert_equals "$tz_day" "${tz_now%% *}" \
    "the day and the clock agree about the day, reading as $tz_tag"
done

# ---------------------------------------------------------- the day heading a founder reads

# tz_folder <folder> <zone>: a founder's folder built and worked in under one
# zone. Two of them, because the two logs must not mix, and because the second
# one is what makes the first one mean something.
tz_folder() {                           # <work folder> <zone>
  mkdir -p "$1" || t_die "a folder for this case could not be made." \
    "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
  cd "$1" || t_die "a folder for this case is not there." "sh tests/run.sh again"
  HOME=$1
  TZ=$2
  export HOME TZ
  sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed under TZ=$2." "sh tests/run.sh again"
  sh "$GE" log note "wrote the first draft of the offer" > "$CASEWORK/log-$3.out" 2>&1 \
    || t_die "ge log failed under TZ=$2." "cat $CASEWORK/log-$3.out"
  sh "$GE" remember decision "b2b, my buyers are agencies" > "$CASEWORK/remember-$3.out" 2>&1 \
    || t_die "ge remember failed under TZ=$2." "cat $CASEWORK/remember-$3.out"
  sh "$GE" snapshot memory.md > "$CASEWORK/snapshot-$3.out" 2>&1 \
    || t_die "ge snapshot failed under TZ=$2." "cat $CASEWORK/snapshot-$3.out"
}

# The folder names carry a space, an apostrophe, a bracket and a backslash, the
# way every other sandbox in this suite does. A plainly named folder is how two
# real bugs in this toolkit stayed hidden.
TZ_BS='\'
TZ_LOCAL_DIR="$SANDBOX/Ana's [own] back${TZ_BS}slash folder"
TZ_UTC_DIR="$SANDBOX/Bo's [other] back${TZ_BS}slash folder"

tz_folder "$TZ_LOCAL_DIR/work" "$TZ_ZONE" local

# THE LINE THAT STOPS A FOUNDER IN ATLANTA READING TOMORROW'S DATE. The heading
# is the day they are living in, not the day the container is on.
assert_contains "$TZ_LOCAL_DIR/work/growth-engine/ops-log.md" "## $TZ_LOCAL_DAY" \
  "the day heading is the founder's own day"
assert_lacks "$TZ_LOCAL_DIR/work/growth-engine/ops-log.md" "## $TZ_UTC_DAY" \
  "and not the day the machine is on"
assert_contains "$TZ_LOCAL_DIR/work/growth-engine/ops-log.md" \
  "- $TZ_LOCAL_CLOCK note: wrote the first draft of the offer" \
  "and the entry is stamped at the founder's own clock"
assert_equals 1 "$(grep -c '^## ' "$TZ_LOCAL_DIR/work/growth-engine/ops-log.md")" \
  "one entry, one heading"

# What ge echoed back at the founder is the same day it filed the entry under.
# Two different answers there would send them looking under a heading that is
# not the one it wrote, in a file nothing can correct afterwards.
assert_contains "$CASEWORK/log-local.out" "$TZ_LOCAL_DAY $TZ_LOCAL_CLOCK" \
  "and ge echoed back the same day and time it filed"

# Every other place a day is written down follows the same clock. A decision
# dated a day ahead is a founder counting a follow up from the wrong morning.
assert_contains "$TZ_LOCAL_DIR/work/growth-engine/memory.md" "$TZ_LOCAL_DAY" \
  "the decision carries the founder's own day"
assert_lacks "$TZ_LOCAL_DIR/work/growth-engine/memory.md" "$TZ_UTC_DAY" \
  "and not the machine's"

# And the ring, which is the one thing that stays UTC.
assert_contains "$CASEWORK/snapshot-local.out" "$TZ_STAMP" \
  "the copy in the ring is stamped in UTC"
GE_T_HOME="$TZ_LOCAL_DIR/work/growth-engine"
assert_snapshots memory.md 2 "and the ring holds the two copies the two writes took"
[ -f "$TZ_LOCAL_DIR/work/growth-engine/.state/snapshots/memory.md.$TZ_STAMP" ] \
  && t_pass || t_fail "the copy in the ring is not named with the UTC stamp"

# ---------------------------------------------------------------- the control

# The same commands, the same instant, one zone apart. Without this the case
# would pass on a ge that had stopped reading the clock at all and was writing a
# fixed day back.
tz_folder "$TZ_UTC_DIR/work" UTC utc

assert_contains "$TZ_UTC_DIR/work/growth-engine/ops-log.md" "## $TZ_UTC_DAY" \
  "a founder on UTC at the same instant gets the 25th"
assert_lacks "$TZ_UTC_DIR/work/growth-engine/ops-log.md" "## $TZ_LOCAL_DAY" \
  "and not the 24th"
assert_contains "$TZ_UTC_DIR/work/growth-engine/ops-log.md" \
  "- $TZ_UTC_CLOCK note: wrote the first draft of the offer" \
  "and their entry is stamped at 03:00"

# One instant, two founders, two different day headings and ONE ring stamp. That
# sentence is the whole of change three in the build document.
assert_contains "$CASEWORK/snapshot-utc.out" "$TZ_STAMP" \
  "and their copy in the ring carries the very same UTC stamp"

PATH=$KEEP_PATH
export PATH
unset GE_T_REAL_DATE GE_T_NOW

t_done
