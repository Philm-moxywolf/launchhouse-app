#!/bin/sh
# 32-pinned-folder.sh: the boundary between one founder and the next.
#
# WHY IT EXISTS: everything in lib/paths.sh walks. It reads the folder ge was
#                started in, every folder above it, and four folders under the
#                home folder. On one laptop with one person on it that walk is
#                the right answer and it is why that file is as long as it is: a
#                founder opens Claude somewhere else every time and the folder
#                still has to be found.
#
#                Put two founders' folders on one machine and that same walk is
#                a boundary that can be stepped over, because nothing in the walk
#                can tell whose folder it just found. It never had to. GE_HOME is
#                the answer to that: the caller says which folder, and no walk
#                runs at all. This case is the proof, and it is the one case in
#                this suite whose failure is not a founder losing their own work.
#                It is a founder reading somebody else's prospects, which is the
#                failure that ends the product, so it is worth more than the
#                other three new cases together.
#
#                THE SHAPE IT DRIVES. ge is pinned to folder A and started while
#                standing in folder B, and B is not empty: it is a whole second
#                founder's tree, with its own anchor, its own memory and its own
#                person file, sitting in the working directory, which is the very
#                first place the walk would have looked. A third folder sits above
#                both of them, which is where the walk would have gone next. All
#                seventeen verbs then run, and nothing outside A may be touched.
#
#                THE DETECTOR IS PROVED BEFORE IT IS TRUSTED. A sweep that
#                reports "nothing changed" because it is looking in the wrong
#                place, or because it cannot see a change at all, would make this
#                whole case a green light for the fault it exists to catch. So
#                the pin is aimed at the wrong folder ON PURPOSE first, the sweep
#                is required to go red, and only then is it armed again for the
#                real run. A quiet sweep in that first pass ends the case outright.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/32-pinned-folder/
# POSTURE:       fail-closed. Every verb's exit code is asserted, the work is
#                asserted to have actually landed in A, and a verb that quietly
#                did nothing cannot pass this case: a ge that refused everything
#                would touch nothing outside A and would fail here on the other
#                half.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. cksum is POSIX and is what
#                stands in for a hash, since sha256sum is GNU and shasum is not
#                on every machine either.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHY THE FOLDERS ARE NAMED THE WAY THEY ARE. Half the folders in this programme
# are named after a business, so they carry a space, and the other three
# characters here are one keystroke away from it. A plainly named sandbox is how
# two real bugs in this toolkit stayed hidden, and this case compares paths for a
# living, so a plain name would prove the comparison only in the conditions where
# comparing paths cannot go wrong.
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 32-pinned-folder

# A backslash built from a variable rather than typed with an escape, so one
# backslash is what reaches the filesystem under every shell that reads this file.
PF_BS='\'
PF_A_REL="Ana's [own] back${PF_BS}slash folder"
PF_B_REL="Bo's [other] back${PF_BS}slash folder"
PF_A="$SANDBOX/$PF_A_REL"
PF_B="$SANDBOX/$PF_B_REL"

# The pin, and the two things it has to beat. ge is told PF_PIN and nothing else.
PF_PIN="$PF_A/growth-engine"

# What a missed pin would find, in the order the walk would find it: the folder
# in the working directory first, then the one above both founders.
PF_DECOY="$SANDBOX/growth-engine"

PF_DRIVEN=0
PF_FEED=/dev/null

# The transcript of every verb, kept whole, because two of the assertions at the
# foot of this file are about what ge said rather than about what it wrote.
true > "$CASEWORK/transcript" || t_die "the transcript file could not be made." "chmod u+w $CASEWORK"

# ------------------------------------------------------------------ the detector

# pf_manifest <out file>: every path in the sandbox that is not inside A, with
# the contents of every file reduced to a checksum.
#
# WHY A CHECKSUM AND NOT A DIFF. The whole sandbox is walked after every pass, so
# the comparison has to be cheap enough to do more than once, and what is being
# asked is only ever "is this the same file". cksum is POSIX and is on every
# machine this suite runs on, which sha256sum is not.
#
# WHY THE FILE IS READ THROUGH A REDIRECT rather than named as an argument:
# cksum prints the name it was given, and the names here carry a backslash and a
# bracket, so the output would be carrying the same path twice in two spellings.
# Read on standard input it prints the checksum and the byte count and nothing
# else, and this file writes the path itself.
#
# The A subtree is taken out by string comparison and not by a pattern, because a
# pattern built from a path holding a backslash and a bracket is a pattern that
# matches something other than the folder that was meant.
pf_manifest() {                         # <out file>
  ( cd "$SANDBOX" && find . -print ) | LC_ALL=C sort | while IFS= read -r pf_p; do
    pf_rest=${pf_p#./}
    [ "$pf_rest" = "$PF_A_REL" ] && continue
    [ "${pf_rest#"$PF_A_REL"/}" != "$pf_rest" ] && continue
    if [ -f "$SANDBOX/$pf_rest" ]; then
      printf 'file %s  %s\n' "$(cksum < "$SANDBOX/$pf_rest")" "$pf_rest"
    elif [ -d "$SANDBOX/$pf_rest" ]; then
      printf 'dir   %s\n' "$pf_rest"
    else
      printf 'other %s\n' "$pf_rest"
    fi
  done > "$1"
}

# pf_arm: the state of everything outside A, and a mark in time to measure from.
#
# TWO BELTS, because they miss different things. The manifest sees a file that
# gained, lost or changed bytes, and it sees a file that appeared or went away.
# It does not see a write that put back exactly the bytes that were already
# there. find -newer does see that one, since the write still moves the modified
# time. It has its own blind spot: a filesystem stamps to the second, so a write
# inside the same second as the mark is not newer than it. The second is spent
# here on purpose so that belt means something, and it is spent twice in the
# whole case rather than in a loop.
pf_arm() {
  pf_manifest "$CASEWORK/outside.before"
  sleep 1
  true > "$CASEWORK/mark" || t_die "the mark the sweep measures from could not be made." \
    "chmod u+w $CASEWORK"
}

# pf_changed <out file>: everything outside A that is not as it was. Empty means
# nothing moved. Never returns a status, because both answers are results here
# and one of the two passes below wants each of them.
pf_changed() {                          # <out file>
  pf_manifest "$CASEWORK/outside.after"
  true > "$1" || t_die "the list of what changed could not be made." "chmod u+w $CASEWORK"
  diff -u "$CASEWORK/outside.before" "$CASEWORK/outside.after" >> "$1" 2>&1
  # The second belt. -newer is strictly newer, so the mark is what the run has to
  # beat, and pf_arm spent a second making sure it can be beaten.
  find "$SANDBOX" -newer "$CASEWORK/mark" -print 2>/dev/null | while IFS= read -r pf_n; do
    pf_rest=${pf_n#"$SANDBOX"/}
    [ "$pf_rest" = "$pf_n" ] && continue
    [ "$pf_rest" = "$PF_A_REL" ] && continue
    [ "${pf_rest#"$PF_A_REL"/}" != "$pf_rest" ] && continue
    printf 'touched %s\n' "$pf_rest" >> "$1"
  done
}

# ------------------------------------------------------------------ the battery

# pf_run <wanted exit> <label> <ge arguments...>: one verb, run the way the app
# runs it. The pin is in the environment and nothing else says where the folder
# is. The working directory is B throughout, which is the whole point.
#
# PF_FEED names the file the command reads, for the two verbs that read what is
# piped into them. It is put back to /dev/null after every call, so it can never
# leak into the next verb, and it is never the terminal, so a verb that waits for
# input ends rather than wedging the run.
pf_run() {                              # <wanted exit> <label> <ge arguments...>
  pf_want=$1
  pf_label=$2
  shift 2
  pf_feed=$PF_FEED
  PF_FEED=/dev/null
  PF_DRIVEN=$((PF_DRIVEN + 1))

  cd "$PF_B/work" || t_die "the folder ge is meant to be standing in is not there." \
    "sh tests/run.sh again"
  GE_HOME=$PF_PIN
  HOME=$PF_A
  export GE_HOME HOME
  sh "$GE" "$@" < "$pf_feed" > "$CASEWORK/out" 2>&1
  pf_rc=$?
  printf '### %s\n' "$pf_label" >> "$CASEWORK/transcript"
  cat "$CASEWORK/out" >> "$CASEWORK/transcript"
  assert_exit "$pf_want" "$pf_rc" "$pf_label"
  return 0
}

# ------------------------------------------------------- the other founder, and the decoy

# pf_build <folder>: a whole growth-engine tree, made the way a founder makes
# one, with a person in it. Used for B and for the folder above both of them, so
# that a missed pin has something real to find rather than an empty folder that
# would look the same as no folder at all.
pf_build() {                            # <work folder>
  mkdir -p "$1" || t_die "a folder for this case could not be made." \
    "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
  cd "$1" || t_die "a folder for this case is not there." "sh tests/run.sh again"
  GE_HOME=''
  unset GE_HOME
  HOME=$1
  export HOME
  sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed while building $1." "sh tests/run.sh again"
  sh "$GE" person add prospect rae@fieldhouse.co "Rae Lindqvist" > /dev/null 2>&1 \
    || t_die "the other founder's prospect could not be added." "sh tests/run.sh again"
  sh "$GE" remember decision "b2c, and my people are on instagram" > /dev/null 2>&1 \
    || t_die "the other founder's decision could not be recorded." "sh tests/run.sh again"
  sh "$GE" log note "the other founder was here first" > /dev/null 2>&1 \
    || t_die "the other founder's log entry could not be written." "sh tests/run.sh again"
}

# THE ORDER OF THESE TWO IS NOT FREE, and swapping them breaks the case for a
# reason that has nothing to do with what it measures. ge init refuses when it
# can see more than one growth-engine folder, and it looks upward. Build the one
# above first and the one below it is refused. Build the one below first and the
# one above is made without incident, because the walk does not go downward.
pf_build "$PF_B/work"
# The decoy is built directly in the sandbox, which is also where HOME points
# during pf_build, so it is what both halves of the walk would reach. The tree it
# makes sits at $SANDBOX/growth-engine, which is what PF_DECOY names.
pf_build "$SANDBOX"
[ -d "$PF_DECOY" ] || t_die "the decoy folder above both founders was not built." \
  "sh tests/run.sh again"
[ -d "$PF_B/work/growth-engine" ] || t_die "the other founder's folder was not built." \
  "sh tests/run.sh again"

# A loose file with nobody's name on it, so the sweep is watching something that
# is not a growth-engine folder as well.
#
# Every redirect from here down is on a group, with the shell's own complaint
# sent away. A redirect that fails is reported by the shell first, naming this
# file and a line number inside it, above the sentence written for the reader,
# and a case whose own failures read like that is a case nobody trusts.
if ! { printf 'a file that belongs to neither of them\n' > "$SANDBOX/shared-notes.txt"; } 2>/dev/null; then
  t_die "the loose file could not be written." "chmod u+w $SANDBOX"
fi

# The copy everything outside A is put back from, kept in the working folder
# rather than in the sandbox, because anything inside the sandbox would be swept
# along with what it is there to restore.
rm -rf "$CASEWORK/keep"
mkdir -p "$CASEWORK/keep" || t_die "the folder holding the pristine copy could not be made." \
  "chmod u+w $CASEWORK"
cp -Rp "$PF_B" "$CASEWORK/keep/B" || t_die "the pristine copy of the other founder could not be made." \
  "df -h ${TMPDIR:-/tmp}"
cp -Rp "$PF_DECOY" "$CASEWORK/keep/decoy" || t_die "the pristine copy of the decoy could not be made." \
  "df -h ${TMPDIR:-/tmp}"
cp -p "$SANDBOX/shared-notes.txt" "$CASEWORK/keep/shared-notes.txt" \
  || t_die "the pristine copy of the loose file could not be made." "df -h ${TMPDIR:-/tmp}"

# ------------------------------------------------- first, prove the sweep can go red

# pf_restore_outside: everything outside A put back the way it was built. Called
# after each of the two passes below, because both of them damage it on purpose.
pf_restore_outside() {
  cd "$SANDBOX" || t_die "the sandbox is not there." "sh tests/run.sh again"
  rm -rf "$PF_B" "$PF_DECOY" "$SANDBOX/shared-notes.txt"
  cp -Rp "$CASEWORK/keep/B" "$PF_B" || t_die "the other founder's folder could not be put back." \
    "df -h ${TMPDIR:-/tmp}"
  cp -Rp "$CASEWORK/keep/decoy" "$PF_DECOY" || t_die "the decoy folder could not be put back." \
    "df -h ${TMPDIR:-/tmp}"
  cp -p "$CASEWORK/keep/shared-notes.txt" "$SANDBOX/shared-notes.txt" \
    || t_die "the loose file could not be put back." "df -h ${TMPDIR:-/tmp}"
  # The put-back really put it back. Without this, the run that follows could be
  # sweeping a folder that is already wrong and reporting it as clean.
  pf_arm
  pf_changed "$CASEWORK/settled.txt"
  if [ -s "$CASEWORK/settled.txt" ]; then
    t_die "the folders outside A were put back and the sweep still says they differ, so the case cannot start from a known state." \
          "cat $CASEWORK/settled.txt"
  fi
  t_pass
}

# THE FIRST PASS: damage done by hand, with ge nowhere near it.
#
# This is the half that proves the sweep can see at all, and it is done by hand
# on purpose, so its answer does not depend on ge doing anything. A sweep that
# reports "nothing changed" because it is walking the wrong folder, or because
# the manifest is being compared against itself, would turn this whole case into
# a green light for the fault it exists to catch. Each of the three things it
# watches is damaged in a different way, because they fail differently: one file
# gains bytes, one file appears, and one file goes away.
pf_arm
if ! { printf 'a line nobody asked for\n' >> "$PF_B/work/growth-engine/memory.md"; } 2>/dev/null; then
  t_die "the deliberate damage to the other founder's memory could not be made." \
        "chmod u+w $PF_B/work/growth-engine"
fi
if ! { printf 'a file nobody asked for\n' > "$PF_DECOY/uninvited.md"; } 2>/dev/null; then
  t_die "the deliberate new file could not be made." "chmod u+w $PF_DECOY"
fi
rm -f "$SANDBOX/shared-notes.txt" \
  || t_die "the loose file could not be taken away." "chmod u+w $SANDBOX"

pf_changed "$CASEWORK/byhand.txt"
if [ ! -s "$CASEWORK/byhand.txt" ]; then
  t_die "three files outside A were changed by hand and the sweep reported nothing, so it is blind and every green answer it gives after this would mean nothing." \
        "sh tests/run.sh, and read tests/cases/32-pinned-folder.sh from pf_manifest down"
fi
t_pass
for pf_want in memory.md uninvited.md shared-notes.txt; do
  if ! grep -q -F -e "$pf_want" "$CASEWORK/byhand.txt"; then
    t_die "the sweep went red but never mentioned $pf_want, so it sees some changes and not others." \
          "cat $CASEWORK/byhand.txt"
  fi
  t_pass
done
pf_restore_outside

# THE SECOND PASS: the pin aimed at the other founder on purpose.
#
# The sweep is known to work by now, so what this adds is that it goes red on the
# exact shape ge itself produces, which is the shape the real run has to come
# back clean from. Nothing else changes: the same verbs, the same working
# directory, the same everything.
pf_arm
PF_PIN="$PF_B/work/growth-engine"
pf_run 0 'the deliberately wrong pin writes a log entry' log note "this one is meant to land in the wrong place"
pf_run 0 'the deliberately wrong pin adds a person' \
  person add prospect wrong@example.com "Wrongly Filed"
PF_PIN="$PF_A/growth-engine"

pf_changed "$CASEWORK/control.txt"
if [ ! -s "$CASEWORK/control.txt" ]; then
  # Two ways to arrive here and they need different fixes, so both are named. The
  # two exit codes above say which one it was: they are asserted, so a run that
  # refused has already reported itself one line further up.
  t_die "a ge pinned at the other founder wrote nothing the sweep could find, so either the sweep cannot see what ge writes or those two verbs refused." \
        "cat $CASEWORK/transcript, and read the two exit codes above this line"
fi
t_pass
# The manifest half specifically, and not only the pair of them together. The
# second belt can be quiet for a reason that is nothing to do with ge, so a red
# result that came only from it would not prove the half that matters most.
if ! grep -q '^+file ' "$CASEWORK/control.txt"; then
  t_die "the wrongly pinned run changed a file outside A and the manifest did not notice." \
        "cat $CASEWORK/control.txt"
fi
t_pass
pf_restore_outside

# ------------------------------------------------------------- all seventeen verbs

# Nothing before this line ran with the real pin, so the mark is armed again and
# everything from here is measured from one moment.
pf_arm

# The three that never look at a folder at all. They are let through ahead of the
# pin check in ge.sh, so they are the three that would still answer a founder
# whose folder cannot be read, and they are verbs one, two and three of the
# seventeen.
pf_run 0 'ge help'       help
pf_run 0 'ge version'    version
pf_run 0 'ge invocation' invocation
# A pinned ge is one that something else started, so the line it hands a founder
# is the bare verb rather than the laptop instruction. That is the first half of
# change five in the build document, and it is read off the pin.
assert_equals 'ge' "$(sed -n '1p' "$CASEWORK/out")" \
  "a pinned ge prints the short form of its own name"

# Four. The folder is built where the pin says, not where ge is standing.
pf_run 0 'ge init' init
assert_contains "$PF_A/growth-engine/.state/HOME" "$PF_A_REL" \
  "ge init built the folder at the pin"

pf_run 0 'ge context' context
assert_contains "$CASEWORK/out" "$PF_PIN" "ge context names the pinned folder"
assert_lacks "$CASEWORK/out" "$PF_B_REL" "and never names the folder it is standing in"

pf_run 0 'ge index'   index
pf_run 0 'ge lint'    lint
pf_run 0 'ge receipt set' receipt set ghl-token PASS "a token was made and it works"

if ! { printf 'acc-1|facebook|Northfield Page\n' > "$CASEWORK/accounts.in"; } 2>/dev/null; then
  t_die "the accounts input could not be written." "chmod u+w $CASEWORK"
fi
PF_FEED="$CASEWORK/accounts.in"
pf_run 0 'ge accounts set' accounts set

# Ten, eleven and twelve are the three that write over a file that is already
# there, so they are run as a sequence: a copy is taken, the file is changed by
# hand the way a founder changes it, the copy is put back by name, and then the
# newest change is undone. Each one is a real write, and each one is measured.
pf_run 0 'ge snapshot' snapshot memory.md
PF_STAMP=$(sed -n '1p' "$CASEWORK/out")
PF_STAMP=${PF_STAMP##* }
[ -n "$PF_STAMP" ] || t_die "ge snapshot did not print the stamp it wrote." "cat $CASEWORK/out"

if ! { printf 'a paragraph the founder typed into their own file\n' >> "$PF_A/growth-engine/memory.md"; } 2>/dev/null; then
  t_die "the founder's own edit could not be made, so the pin did not build the folder where it said." \
        "cat $CASEWORK/transcript, and read what ge context said its working folder was"
fi
pf_run 0 'ge restore with a stamp' restore memory.md "$PF_STAMP"
assert_contains "$CASEWORK/out" "restored memory.md from the backup stamped $PF_STAMP" \
  "ge restore put the pinned folder's own file back"

if ! { printf 'and a second paragraph, after the restore\n' >> "$PF_A/growth-engine/memory.md"; } 2>/dev/null; then
  t_die "the second edit could not be made, so the pin did not build the folder where it said." \
        "cat $CASEWORK/transcript, and read what ge context said its working folder was"
fi
pf_run 0 'ge undo' undo
assert_contains "$CASEWORK/out" 'restored memory.md from the backup stamped ' \
  "ge undo put the pinned folder's own file back"

# Thirteen to seventeen. Every one of these writes a file a founder would be
# upset to find in somebody else's folder.
pf_run 0 'ge log'      log note "standing in the other founder's folder"
pf_run 0 'ge remember' remember decision "b2b, my buyers are agencies"
pf_run 0 'ge person'   person add prospect sam@northfield.io "Sam Carter"
pf_run 0 'ge ledger'   ledger add-content 1 1 short-post text
pf_run 0 'ge check'    check

# Seventeen, counted rather than trusted. Two of the calls above were the control
# pass with the wrong pin, so those are taken off.
assert_equals 17 "$((PF_DRIVEN - 2))" "all seventeen verbs ran"

# ---------------------------------------------------------------- the boundary held

pf_changed "$CASEWORK/outside.txt"
if [ -s "$CASEWORK/outside.txt" ]; then
  t_note "seventeen verbs, and something outside the pinned folder moved"
  cat "$CASEWORK/outside.txt" >> "$CASEWORK/diff.txt"
  printf '\nThis is one founder reaching into another founder tree. Nothing below the\n' \
    >> "$CASEWORK/diff.txt"
  printf 'pin in scripts/lib/paths.sh may read or write outside the folder it names.\n' \
    >> "$CASEWORK/diff.txt"
  t_fail "the pin did not hold: $(grep -c . "$CASEWORK/outside.txt") lines of difference outside it"
else
  t_pass
fi

# The other founder's own files, named one at a time. The sweep above says
# nothing changed, and these say what it was that did not change, so a sweep
# pointed at an empty folder could not pass this.
assert_contains "$PF_B/work/growth-engine/.state/HOME" "$PF_B_REL" \
  "the other founder's anchor still names their own folder"
assert_contains "$PF_B/work/growth-engine/people/rae-fieldhouse-co.md" 'rae@fieldhouse.co' \
  "the other founder's prospect is still theirs"
assert_absent "$PF_B/work/growth-engine/people/sam-northfield-io.md" \
  "the pinned founder's prospect was not written into the other founder's folder"
assert_lacks "$PF_B/work/growth-engine/ops-log.md" "standing in the other founder's folder" \
  "the pinned founder's log entry did not land in the other founder's log"
assert_lacks "$PF_B/work/growth-engine/memory.md" 'my buyers are agencies' \
  "and the pinned founder's memory did not land there either"
assert_absent "$PF_DECOY/people/sam-northfield-io.md" \
  "nor in the folder above both of them"

# ------------------------------------------------------ and the work really landed in A

# The other half of the claim, and without it this case would pass on a ge that
# refused all seventeen verbs. Every verb that writes is asked for its own file.
assert_contains "$PF_A/growth-engine/ops-log.md" "standing in the other founder's folder" \
  "the log entry landed in the pinned folder"
assert_contains "$PF_A/growth-engine/memory.md" 'my buyers are agencies' \
  "the decision landed in the pinned folder"
assert_contains "$PF_A/growth-engine/people/sam-northfield-io.md" 'sam@northfield.io' \
  "the person file landed in the pinned folder"
assert_contains "$PF_A/growth-engine/ledger.md" 'short-post' \
  "the content piece landed in the pinned folder"
assert_contains "$PF_A/growth-engine/.state/receipt.md" 'ghl-token' \
  "the receipt landed in the pinned folder"
assert_contains "$PF_A/growth-engine/.state/ghl-accounts.md" 'acc-1' \
  "the cached account landed in the pinned folder"
GE_T_HOME="$PF_A/growth-engine"
# Four, and each one is named so that a change in the count has to be explained
# rather than absorbed: ge snapshot took one, ge restore took one before it wrote
# over the file, ge undo took one before it wrote over it again, and ge remember
# took one before it added the decision. Every write to a founder file in this
# toolkit is preceded by a copy, and this is the count of that promise.
assert_snapshots memory.md 4 "the pinned folder holds one backup per write to memory.md"

# Not one line of seventeen verbs' output named the folder ge was standing in, or
# the one above it. On a server the working directory is the founder's own, so
# this is not a fault a founder could reach on a laptop. It is the guarantee that
# makes running two founders under one working directory safe at all, and a
# message that starts naming the cwd would take it away quietly.
assert_lacks "$CASEWORK/transcript" "$PF_B_REL" \
  "no verb named the folder it was standing in"
assert_lacks "$CASEWORK/transcript" "$PF_DECOY" \
  "and none named the folder above both founders"

# ---------------------------------------------------------------- the guard rails

# A pin ge will not use, and the two shapes of it. Neither is repaired, because a
# repaired pin is a guess at which folder was meant and the whole point of a pin
# is that ge does no guessing about that.
#
# The upward one is aimed through A at B by name, which is exactly the shape that
# walks into the other founder's tree while looking like a full path. It is a
# real folder and it still gets refused, which is the fail-closed half.
pf_arm
cd "$PF_B/work" || t_die "the folder ge is meant to be standing in is not there." "sh tests/run.sh again"
HOME=$PF_A
export HOME

GE_HOME="growth-engine"
export GE_HOME
sh "$GE" context < /dev/null > "$CASEWORK/relative.out" 2>&1
assert_exit 1 $? "a pin that is not a full path exits 1"
assert_contains "$CASEWORK/relative.out" 'the folder ge was told to work in cannot be used' \
  "and says so plainly"
assert_contains "$CASEWORK/relative.out" 'It has to be a full path, starting at the top of the disk.' \
  "and says which way it is wrong"
assert_contains "$CASEWORK/relative.out" 'Nothing of yours was read, changed or deleted.' \
  "and says nothing was touched"

GE_HOME="$PF_A/../$PF_B_REL/work/growth-engine"
export GE_HOME
sh "$GE" context < /dev/null > "$CASEWORK/upward.out" 2>&1
assert_exit 1 $? "a pin that walks upward exits 1, even though that folder is really there"
assert_contains "$CASEWORK/upward.out" 'It reaches upward out of itself, and ge will not follow that.' \
  "and says which way that one is wrong"

# The three that never look at a folder still answer under a pin ge refused. A
# founder in this state is exactly who needs to be able to read the help.
GE_HOME="growth-engine"
export GE_HOME
sh "$GE" help < /dev/null > "$CASEWORK/badpin-help.out" 2>&1
assert_exit 0 $? "ge help still answers under a pin ge will not use"
assert_lacks "$CASEWORK/badpin-help.out" 'cannot be used' "and says nothing about the pin"

pf_changed "$CASEWORK/badpin.txt"
if [ -s "$CASEWORK/badpin.txt" ]; then
  t_note "a pin ge refused still moved something outside the pinned folder"
  cat "$CASEWORK/badpin.txt" >> "$CASEWORK/diff.txt"
  t_fail "a refused pin is not allowed to touch anything, and it touched something"
else
  t_pass
fi

t_done
