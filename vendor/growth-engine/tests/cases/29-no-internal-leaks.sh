#!/bin/sh
# 29-no-internal-leaks.sh: nothing from inside ge is ever shown to a founder.
#
# WHY IT EXISTS: the promise at the top of every file in this toolkit is that a
#                founder never sees a raw shell error, a path from inside the
#                plugin, a line number in somebody's source file, or the name of
#                a working file ge made and meant to delete. A folder that goes
#                read only for a minute while OneDrive or iCloud reconciles is
#                the ordinary case, not an exotic one, and it used to answer with
#                a wall like "…/scripts/cmd/receipt.sh: line 94:
#                …/.state/receipt.md.ge-tmp.53278: Permission denied" and nothing
#                else at all. No sentence, no word about whether anything was
#                changed, and no line to try. That is four separate promises
#                broken in one line of output, and it was reachable from four
#                different commands.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/29-no-internal-leaks/
# POSTURE:       fail-closed. Both streams are captured for every command, and a
#                command that stops failing is still scanned, so this cannot end
#                up proving nothing because the failure paths moved.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. A machine that writes into a
#                folder with the write bit off, which is a run as root or a
#                Windows drive under Git Bash, is told plainly that the case
#                cannot be proved there rather than being passed.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 29-no-internal-leaks
cd "$SANDBOX" || t_die "the sandbox for 29-no-internal-leaks is not there." "sh tests/run.sh again"

GE_FOLDER="$SANDBOX/growth-engine"
SCANNED=0

# clean <label>: the four shapes an internal detail takes when it escapes. The
# plugin path, a line number in a source file, and the two names ge gives the
# working files it writes beside a founder's file while it replaces it.
clean() {                               # <label> <output file>
  SCANNED=$((SCANNED + 1))
  assert_lacks "$2" '/plugins/growth-engine/scripts/' "$1: no path from inside the toolkit"
  # Two spellings of the same thing, because the shell decides the wording. bash
  # says "receipt.sh: line 94:" and dash says "receipt.sh: 114:", and half the
  # cohort is on a machine where sh is the second one.
  assert_lacks_pattern "$2" '\.sh: line [0-9]' "$1: no line number from inside the toolkit"
  assert_lacks_pattern "$2" '\.sh: [0-9]+:' "$1: no line number from inside the toolkit, the other spelling"
  assert_lacks "$2" '.ge-tmp.' "$1: no working file name"
  assert_lacks "$2" '.ge-body.' "$1: no working file name"
}

# run_clean <label> <ge arguments...>: drive it, whatever it answers, and scan
# both streams. The exit code is deliberately not asserted: this is about what
# reaches the founder's eyes, and a command that starts succeeding still has to
# be scanned or the sweep quietly shrinks.
run_clean() {                           # <label> <ge arguments...>
  rc_label=$1
  shift
  sh "$GE" "$@" > "$CASEWORK/out" 2>&1
  clean "$rc_label" "$CASEWORK/out"
}

# no_markers <label> <file>: the markers ge puts in a file to say which part is
# its own are machine punctuation. A founder who asked to see a prospect should
# be shown the prospect. A refusal about a marker that is missing is the one
# place naming it is the only way to say what to put back, so refusals are held
# to the other four shapes above and not to this one.
no_markers() {                          # <label> <file>
  assert_lacks "$2" '<!-- GE:' "$1: no marker of ge's own is shown to the founder"
}

sh "$GE" init > "$CASEWORK/init.out" 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1
sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1
sh "$GE" person note sam@northfield.io "likes the pricing post" > /dev/null 2>&1
sh "$GE" remember decision "picked b2b, my buyers are agencies" > /dev/null 2>&1
sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1
sh "$GE" log note "day one, picked the b2b track" > /dev/null 2>&1
sh "$GE" receipt set plugin PASS "the toolkit answered" > /dev/null 2>&1
sh "$GE" index > /dev/null 2>&1

# ------------------------------------------------- what a good day looks like

# Every surface a founder reads on an ordinary day, with nothing wrong. These
# used to be the quiet ones: ge person get handed back the raw file, markers and
# all, to somebody who asked to see a prospect.
for v in 'help' 'version' 'context' 'check' 'index' 'lint' 'person list' 'person get sam@northfield.io' \
         'remember list' 'ledger list C' 'receipt show' 'accounts list'; do
  sh "$GE" $v > "$CASEWORK/good.out" 2>&1
  clean "ge $v on a folder with nothing wrong" "$CASEWORK/good.out"
  no_markers "ge $v on a folder with nothing wrong" "$CASEWORK/good.out"
done

sh "$GE" person add prospect kit@brightops.co.uk "Kit Alvarez" > "$CASEWORK/add.out" 2>&1
clean "ge person add" "$CASEWORK/add.out"
no_markers "ge person add" "$CASEWORK/add.out"
sh "$GE" person note kit@brightops.co.uk "runs the ops side" > "$CASEWORK/note.out" 2>&1
clean "ge person note" "$CASEWORK/note.out"
no_markers "ge person note" "$CASEWORK/note.out"

# ---------------------------------------------------------- the working files

# Nothing ge writes beside a founder's file while replacing it may be left in the
# folder. A founder who runs ls and sees memory.md.ge-tmp.53278 has no way to
# know whether it is theirs or safe to delete.
LEFTOVER=0
for f in "$GE_FOLDER"/* "$GE_FOLDER"/.[!.]* "$GE_FOLDER"/.state/* "$GE_FOLDER"/people/*; do
  [ -e "$f" ] || continue
  case ${f##*/} in
    *.ge-tmp.*|*.ge-body.*|*.ge-write-probe.*) LEFTOVER=$((LEFTOVER + 1)) ;;
  esac
done
assert_equals 0 "$LEFTOVER" "no working file of ge's is left in the folder after a day's work"

# ------------------------------------------------------ the folder goes read only

# The realistic cause is a sync client holding the folder for a moment. Proved
# rather than assumed: a machine that writes anyway cannot show anything here.
chmod a-w "$GE_FOLDER/.state" || t_die "the state folder would not change permissions." "ls -ld $GE_FOLDER/.state"
if { true > "$GE_FOLDER/.state/.ge-test-probe"; } 2>/dev/null; then
  rm -f "$GE_FOLDER/.state/.ge-test-probe"
  chmod u+w "$GE_FOLDER/.state"
  t_die "this machine still writes into a folder with the write bit off, so nothing here can be proved on it." \
        "sh tests/run.sh as your own user, on a drive that carries permissions"
fi

run_clean 'remember with a locked state folder'      remember decision "second"
run_clean 'remember list with a locked state folder' remember list
run_clean 'remember forget with a locked state folder' remember forget decision 1
run_clean 'remember amend with a locked state folder' remember --amend decision 1 "other" --expect "picked b2b, my buyers are agencies"
run_clean 'receipt set with a locked state folder'   receipt set ghl PASS "ok"
run_clean 'receipt show with a locked state folder'  receipt show
run_clean 'accounts list with a locked state folder' accounts list
run_clean 'accounts clear with a locked state folder' accounts clear
run_clean 'log with a locked state folder'           log note "anything"
run_clean 'index with a locked state folder'         index
run_clean 'check with a locked state folder'         check
run_clean 'context with a locked state folder'       context
run_clean 'lint with a locked state folder'          lint
run_clean 'person note with a locked state folder'   person note sam@northfield.io "anything"
run_clean 'person set with a locked state folder'    person set sam@northfield.io status contacted_ok
run_clean 'ledger add with a locked state folder'    ledger add-content 2 2 carousel media
run_clean 'snapshot with a locked state folder'      snapshot memory.md
run_clean 'undo with a locked state folder'          undo
printf 'acc_10441|facebook|Lumen Skin\n' > "$CASEWORK/accounts.txt"
sh "$GE" accounts set < "$CASEWORK/accounts.txt" > "$CASEWORK/out" 2>&1
clean 'accounts set with a locked state folder' "$CASEWORK/out"

chmod u+w "$GE_FOLDER/.state" || t_die "the state folder would not change back." "ls -ld $GE_FOLDER/.state"

# ------------------------------------------------- the whole folder goes read only

chmod a-w "$GE_FOLDER" || t_die "the folder would not change permissions." "ls -ld $GE_FOLDER"

run_clean 'remember with a locked folder'          remember worked "the short posts got replies"
run_clean 'log with a locked folder'               log note "anything"
run_clean 'ledger add with a locked folder'        ledger add-content 3 3 short-post text
run_clean 'ledger set with a locked folder'        ledger set-content 1 status archived
run_clean 'export firstlines with a locked folder' person export firstlines
run_clean 'export openers with a locked folder'    person export openers
run_clean 'index with a locked folder'             index
run_clean 'check with a locked folder'             check
run_clean 'lint with a locked folder'              lint
run_clean 'context with a locked folder'           context

chmod u+w "$GE_FOLDER" || t_die "the folder would not change back." "ls -ld $GE_FOLDER"

# ------------------------------------------------- the people folder goes read only

chmod a-w "$GE_FOLDER/people" || t_die "the people folder would not change permissions." \
  "ls -ld $GE_FOLDER/people"

run_clean 'person add with a locked people folder'    person add prospect new@northfield.io "New Person"
run_clean 'person note with a locked people folder'   person note sam@northfield.io "anything"
run_clean 'person touch with a locked people folder'  person touch sam@northfield.io email out "anything"
run_clean 'person set with a locked people folder'    person set sam@northfield.io status contacted_ok
run_clean 'person remove with a locked people folder' person remove sam@northfield.io
run_clean 'person list with a locked people folder'   person list
run_clean 'check with a locked people folder'         check

chmod u+w "$GE_FOLDER/people" || t_die "the people folder would not change back." \
  "ls -ld $GE_FOLDER/people"

# ------------------------------------------------------------ damaged files

# A founder deleted a line they did not understand, or a sync client merged two
# copies of the same file. Both refuse, and both have to refuse in the founder's
# language rather than the shell's.
awk '!/GE:WORKED:END/' "$GE_FOLDER/memory.md" > "$CASEWORK/damaged" \
  || t_die "the damaged memory.md could not be prepared." "sh tests/run.sh again"
cp "$CASEWORK/damaged" "$GE_FOLDER/memory.md" || t_die "the damaged memory.md would not copy." \
  "ls -l $GE_FOLDER/memory.md"
run_clean 'remember into a half marked file' remember worked "the short posts got replies"
run_clean 'remember list on a half marked file' remember list
run_clean 'lint on a half marked file'       lint
run_clean 'check on a half marked file'      check

# A person file with a line in it that is not a field. What a founder gets told
# here has to be a sentence, not a tagged token out of the parser.
sh "$GE" person add prospect ada@northfield.io "Ada Lovelace" > /dev/null 2>&1
BADP="$GE_FOLDER/people/ada-northfield-io.md"
awk 'NR == 4 { print "remember to call him thursday" } { print }' "$BADP" > "$CASEWORK/badperson" \
  || t_die "the damaged person file could not be prepared." "sh tests/run.sh again"
cp "$CASEWORK/badperson" "$BADP" || t_die "the damaged person file would not copy." "ls -l $BADP"
run_clean 'person note on a damaged person file' person note ada@northfield.io "anything"
assert_lacks "$CASEWORK/out" 'BADLINE' "no parser tag reaches the founder from a damaged person file"
run_clean 'person list with a damaged person file' person list
assert_lacks "$CASEWORK/out" 'BADLINE' "and none reaches them from the list either"
run_clean 'lint on a damaged person file' lint
run_clean 'check on a damaged person file' check

# ---------------------------------------------------------------- the count

# Without this, a change that stopped any of these paths being reachable would
# leave the case passing on whatever was left of the sweep.
[ "$SCANNED" -ge 55 ] && t_pass || \
  t_fail "the sweep scanned only $SCANNED answers, and it is meant to scan at least 55"

t_done
