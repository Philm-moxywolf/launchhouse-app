#!/bin/sh
# 13-readonly-people.sh: a people folder that cannot be written to says so.
#
# WHY IT EXISTS: a folder inside OneDrive, iCloud Drive or Dropbox goes read only
#                while the client is reconciling, and it goes read only without
#                telling anybody. The founder is mid-conversation with a prospect
#                and the toolkit has to say, in their words, that nothing was
#                written and what to run. The two ways this goes wrong are both
#                silent: the shell's own complaint reaches the founder instead,
#                naming a line number and a temp file they have never heard of,
#                or the command reports success and the note is nowhere.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/13-readonly-people/
# POSTURE:       fail-closed. Every refusal is followed by a byte comparison of
#                the person file and a listing of the folder, because a half
#                written file and a temp file left behind are the two ways this
#                can look like it worked.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. The permission is put back
#                before anything can exit, because a folder nobody can write to
#                is a folder nobody can delete the contents of either.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# Read for the last section only, which runs the line ge printed rather than
# reading it. A line that is only read is a line nobody has ever tried.
. "$TESTS/lib/recovery.sh"

t_start 13-readonly-people
rl_setup "$SANDBOX/.ge-bin"
cd "$SANDBOX" || t_die "the sandbox for 13-readonly-people is not there." "sh tests/run.sh again"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1 \
  || t_die "the prospect could not be added." "sh tests/run.sh again"
sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1 \
  || t_die "the target could not be added." "sh tests/run.sh again"

PEOPLE="$SANDBOX/growth-engine/people"
PROSPECT="$PEOPLE/sam-northfield-io.md"
TARGET="$PEOPLE/ig-helen-makes.md"
cp "$PROSPECT" "$CASEWORK/prospect.keep" || t_die "the prospect file is not there." "sh tests/run.sh again"
cp "$TARGET" "$CASEWORK/target.keep" || t_die "the target file is not there." "sh tests/run.sh again"

chmod a-w "$PEOPLE" || t_die "the people folder could not be made read only." "sh tests/run.sh again"

# Two machines can take the write bit off and still write: a run as root, and a
# filesystem that does not carry one, which is what a Windows drive under Git
# Bash does. Either way the condition this case is built on is not there, and
# saying so is the only honest answer. A check that cannot run is a failure here,
# never a quiet pass. A suite that goes green on checks it never ran is worth
# less than no suite at all, because people believe it.
if { true > "$PEOPLE/.ge-test-probe"; } 2>/dev/null; then
  rm -f "$PEOPLE/.ge-test-probe"
  chmod u+w "$PEOPLE"
  t_die "this machine still writes into a folder with the write bit off, so nothing here can be proved on it." \
        "sh tests/run.sh as your own user, on a drive that carries permissions"
fi

# Everything is run first and the permission put back straight afterwards, before
# a single check runs. A check that fails must never leave a folder behind that
# the suite cannot clean up.
sh "$GE" person note sam@northfield.io "they replied on LinkedIn" > "$CASEWORK/note.out" 2>&1
note_rc=$?
sh "$GE" person touch sam@northfield.io email out "sent the opener" > "$CASEWORK/touch.out" 2>&1
touch_rc=$?
printf 'saw your reel about slow mornings\n' | sh "$GE" person opener ig:helen.makes - \
  > "$CASEWORK/opener.out" 2>&1
opener_rc=$?
sh "$GE" person set sam@northfield.io company "Northfield" > "$CASEWORK/set.out" 2>&1
set_rc=$?
sh "$GE" person add prospect kit@brightops.co.uk "Kit Alvarez" > "$CASEWORK/add.out" 2>&1
add_rc=$?
( cd "$PEOPLE" && ls -a ) > "$CASEWORK/listing.out" 2>&1

chmod u+w "$PEOPLE" || t_die "the people folder could not be made writable again." \
  "chmod u+w $PEOPLE, then sh tests/run.sh again"

# refused_readonly: what each of these owes the founder. The first line has to be
# ge's own, because the shell's answer to a folder it cannot write to names our
# line number and a temp file with a process id on the end, and a founder reading
# that has been handed a second problem on top of the first. The last line has to
# be the recovery line, because a founder who reads one line reads that one.
#
# The recovery line names the chmod that makes the folder writable again, and the
# folder it names is the one that could not be written. It used to name ge check,
# which is a truthful sentence and not a way out: it describes the problem back
# to somebody who has just read the problem, and leaves them to work out the
# command themselves. The founder in this case is mid conversation with a
# prospect and their sync client has the folder for a moment. A line they can
# paste is the difference between carrying on and waiting for a mentor. The
# section at the foot of this case runs the line and proves it.
refused_readonly() {                    # <output file> <label>
  rr_first=$(sed -n '1p' "$1")
  case $rr_first in
    FAIL*) t_pass ;;
    *) t_note "$2: the first line"
       printf 'the first line was [%s]\n' "$rr_first" >> "$CASEWORK/diff.txt"
       cat "$1" >> "$CASEWORK/diff.txt"
       t_fail "$2: the first line is not ge's own words" ;;
  esac
  assert_contains "$1" 'FAIL' "$2: says FAIL"
  assert_contains "$1" 'could not be written' "$2: says nothing was written"
  assert_contains "$1" '→ run: chmod ' "$2: names a chmod as the way out"
  # WHICH FLAGS, DELIBERATELY NOT ASKED HERE. This line used to be held to the
  # exact text "chmod u+w ". That is a spelling and not a property, and it was
  # the spelling that only works on the one folder mode this case drives: a
  # folder at 755 with chmod a-w on it is 555, which keeps the search bit, and
  # u+w is enough only because of that. A folder a sync client hands back with
  # no search bit needs the search bit back as well, so a repair that widens the
  # flags is a repair and not a regression, and a case that fails on it is
  # telling the reader the wrong thing. What has to hold is that it is a chmod,
  # that it acts on the folder that could not be written, and that running it
  # ends the refusal. The first two are here, the third is at the foot of this
  # case, and every folder mode is driven in tests/cases/31-permission-modes.sh.
  #
  # The folder is looked for among the WORDS a shell would see, not in the text
  # of the line. The people folder's path is a prefix of the path of every file
  # inside it, so "the text appears somewhere in the line" would pass just as
  # happily for a line naming one of the files instead of the folder.
  rr_last=$(sed '/^[[:space:]]*$/d' "$1" | sed -n '$p')
  rl_words "$(rl_part cmd "${rr_last#*→ run: }")" "$CASEWORK/rr.words"
  if grep -q -F -x -e "$PEOPLE" "$CASEWORK/rr.words"; then
    t_pass
  else
    t_note "$2: the folder that could not be written is not the folder named"
    printf 'the last line was:\n  %s\n' "$rr_last" >> "$CASEWORK/diff.txt"
    printf 'the folder that could not be written:\n  %s\n' "$PEOPLE" >> "$CASEWORK/diff.txt"
    printf 'the words a shell would see in that command:\n' >> "$CASEWORK/diff.txt"
    sed 's/^/  /' "$CASEWORK/rr.words" >> "$CASEWORK/diff.txt"
    t_fail "$2: the chmod does not act on the folder that could not be written"
  fi
  case $rr_last in
    *'→ run:'*) t_pass ;;
    *) t_note "$2: the last line"
       printf 'the last line was [%s]\n' "$rr_last" >> "$CASEWORK/diff.txt"
       t_fail "$2: the last line is not a recovery line" ;;
  esac
}

assert_exit 1 "$note_rc" "ge person note into a read only folder exits 1"
refused_readonly "$CASEWORK/note.out" "the note refusal"

assert_exit 1 "$touch_rc" "ge person touch into a read only folder exits 1"
refused_readonly "$CASEWORK/touch.out" "the touch refusal"

assert_exit 1 "$opener_rc" "ge person opener into a read only folder exits 1"
refused_readonly "$CASEWORK/opener.out" "the opener refusal"

assert_exit 1 "$set_rc" "ge person set into a read only folder exits 1"
refused_readonly "$CASEWORK/set.out" "the set refusal"

# Adding somebody new is the same folder and the same failure, and it is the one
# a founder hits first: they are typing in a prospect, not amending one.
assert_exit 1 "$add_rc" "ge person add into a read only folder exits 1"
refused_readonly "$CASEWORK/add.out" "the add refusal"
assert_absent "$PEOPLE/kit-brightops-co-uk.md" "and no half written person file was left"

# Nothing was written. This is the whole promise, and it is byte for byte.
assert_bytes_equal "$CASEWORK/prospect.keep" "$PROSPECT" \
  "the prospect file is byte for byte what it was"
assert_bytes_equal "$CASEWORK/target.keep" "$TARGET" \
  "the target file is byte for byte what it was"

# And nothing was left lying in the folder either. A half written temp file with
# a process id on the end is a file the founder will find in a week and open.
assert_equals 5 "$(grep -c . "$CASEWORK/listing.out")" \
  "the people folder holds what it held: the two people, the readme, and the two dots"
assert_equals 0 "$(grep -c 'ge-tmp\|ge-body\|ge-open' "$CASEWORK/listing.out")" \
  "no temp file was left behind by any of the four"

# The doctor is the next thing a founder reaches for when something has gone
# wrong, whether or not a line told them to, so it has to work while the folder
# is like that rather than becoming a second failure on top of the first.
chmod a-w "$PEOPLE" || t_die "the people folder could not be made read only again." "sh tests/run.sh again"
sh "$GE" check > "$CASEWORK/check.out" 2>&1
chmod u+w "$PEOPLE" || t_die "the people folder could not be made writable again." \
  "chmod u+w $PEOPLE, then sh tests/run.sh again"
assert_contains "$CASEWORK/check.out" 'PASS  anchor' "ge check still runs while the folder is read only"

# The same four commands work again the moment the folder does, so what was
# refused was the write and not the founder's text.
sh "$GE" person note sam@northfield.io "they replied on LinkedIn" > "$CASEWORK/note-ok.out" 2>&1
assert_exit 0 $? "the note goes through once the folder is writable again"
assert_contains "$PROSPECT" 'they replied on LinkedIn' "and it is in the file"

# ---------------------------------------------------------------- the way out, run
#
# Everything above reads the line. This runs it, which is the only thing that
# proves it. The folder is put back into the state the founder is in, the refusal
# is captured, the command in its last line is taken and run by a shell, and then
# the command that was refused is run again and has to go through. Nothing here
# types the chmod out by hand: if it did, this would be proving that a chmod
# works and not that ge printed a usable one.
#
# The command is taken from the line rather than the whole line, because ge puts
# an English clause after it. Whether that clause belongs on the line at all is
# counted once, for every refusal in the toolkit, in 30-recovery-runs.
chmod a-w "$PEOPLE" || t_die "the people folder could not be made read only again." "sh tests/run.sh again"
sh "$GE" person note sam@northfield.io "they said yes to Thursday" > "$CASEWORK/refused.out" 2>&1
refused_rc=$?
LAST=$(rl_last_line "$CASEWORK/refused.out")
AFTER=${LAST#*→ run: }
WAY_OUT=$(rl_part cmd "$AFTER")
rl_exec "$WAY_OUT" /dev/null
way_out_rc=$RL_RC
# Whatever happened, the folder has to be writable before anything below can
# fail, or a red check leaves a folder behind that nothing can clean up.
chmod u+w "$PEOPLE" 2>/dev/null

assert_exit 1 "$refused_rc" "the note into a read only folder refuses again"
assert_exit 0 "$way_out_rc" "the command in the recovery line runs"
if [ "$way_out_rc" -ne 0 ]; then
  t_note "the recovery line does not run"
  printf 'the line was:\n  %s\n' "$AFTER" >> "$CASEWORK/diff.txt"
  printf 'the command in it:\n  %s\n' "$WAY_OUT" >> "$CASEWORK/diff.txt"
  printf 'running it said:\n' >> "$CASEWORK/diff.txt"
  sed 's/^/  /' "$CASEWORK/recovery.out" >> "$CASEWORK/diff.txt"
fi
sh "$GE" person note sam@northfield.io "they said yes to Thursday" > "$CASEWORK/cleared.out" 2>&1
assert_exit 0 $? "and the note that was refused goes through afterwards"
assert_contains "$PROSPECT" 'they said yes to Thursday' "and the founder's words are in the file"

t_done
