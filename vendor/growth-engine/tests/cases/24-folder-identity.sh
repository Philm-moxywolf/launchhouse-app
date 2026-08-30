#!/bin/sh
# 24-folder-identity.sh: a folder that moved, a folder inside a folder, two folders.
#
# WHY IT EXISTS: dragging the folder from Downloads to the Desktop is a normal
#                Monday, opening Claude inside growth-engine is what ge init's own
#                closing line leads a founder to do, and running ge init a second
#                time is documented as safe. All three used to end with ge either
#                nagging for ever about a folder that no longer existed, or
#                writing every entry into an empty folder one level down while
#                reporting success. What made them unrecoverable was not the
#                fault, it was the fix: the line the founder was handed did not
#                fix anything, and there was no other door. So this case does
#                what no other case did. It reads the recovery line ge printed,
#                types it, and then asks whether the thing it promised happened.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/24-folder-identity/
# POSTURE:       fail-closed. A recovery line that cannot be typed is a failure
#                here, and so is one that runs and leaves the folder in the same
#                state. Every refusal in the two-folder section is held to the
#                one wording in paths.sh, which is the only one that names an
#                action rather than describing one.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. ge is put on PATH as a shim so
#                the printed line can be run exactly as it reads, quotes and all.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 24-folder-identity

# ge on PATH, so a recovery line that opens with "ge" can be run the way it is
# written rather than translated first. Translating it is how a suite ends up
# proving something the founder was never told to do.
mkdir -p "$SANDBOX/bin" || t_die "the bin folder could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_BIN=$GE
export GE_T_BIN
cat > "$SANDBOX/bin/ge" <<'SHIM'
#!/bin/sh
exec sh "$GE_T_BIN" "$@"
SHIM
chmod +x "$SANDBOX/bin/ge" || t_die "the ge shim could not be made runnable." "ls -l $SANDBOX/bin/ge"
PATH="$SANDBOX/bin:$PATH"
export PATH

# arrow_of <file> [the line the fix belongs to]: the command that output names,
# with the sentence that explains it cut off at the first comma. That is what a
# founder copies: the words between "run:" and the explanation.
#
# The doctor reports nine things and ends on a summary, so its recovery lines sit
# in the middle rather than at the end. Given a second argument, the first
# recovery line after that line is the one read. Given none, the last line is.
# The text goes through the environment rather than into the awk program, because
# a folder path can hold any character at all.
arrow_of() {                            # <output file> [leg]
  if [ "$#" -lt 2 ]; then
    ao_last=$(sed '/^[[:space:]]*$/d' "$1" | sed -n '$p')
  else
    GE_T_LEG=$2
    GE_T_ARROW=$(printf '\342\206\222 run: ')
    export GE_T_LEG GE_T_ARROW
    ao_last=$(awk '
      found                                       { next }
      index($0, ENVIRON["GE_T_LEG"]) > 0          { seen = 1; next }
      seen && index($0, ENVIRON["GE_T_ARROW"]) > 0 { print; found = 1 }
    ' "$1")
  fi
  case $ao_last in
    *'→ run: '*) ;;
    *) printf '\n' ; return 0 ;;
  esac
  ao_cmd=${ao_last#*→ run: }
  printf '%s\n' "${ao_cmd%%,*}"
}

# run_arrow <file> <label>: type it and say whether it ran. The command is given
# to a fresh shell, so the quoting ge printed is read the way the founder's own
# shell would read it. A line with a space in a path that was not quoted fails
# here, which is the point.
run_arrow() {                           # <output file> <label> [leg]
  if [ "$#" -lt 3 ]; then ra_cmd=$(arrow_of "$1"); else ra_cmd=$(arrow_of "$1" "$3"); fi
  if [ -z "$ra_cmd" ]; then
    t_note "$2: there was no recovery line to run"
    cat "$1" >> "$CASEWORK/diff.txt"
    t_fail "$2: no recovery line"
    return 1
  fi
  sh -c "$ra_cmd" > "$CASEWORK/recover.out" 2>&1
  ra_rc=$?
  if [ "$ra_rc" -eq 0 ]; then t_pass; return 0; fi
  t_note "$2: the recovery line would not run"
  printf 'it said: %s\n' "$ra_cmd" >> "$CASEWORK/diff.txt"
  cat "$CASEWORK/recover.out" >> "$CASEWORK/diff.txt"
  t_fail "$2: [$ra_cmd] exited $ra_rc"
  return 1
}

# ------------------------------------------------------ the folder moved

MOVED="$SANDBOX/moved"
mkdir -p "$MOVED/Downloads" "$MOVED/Desktop" || t_die "the moved-folder sandbox could not be made." \
  "df -h ${TMPDIR:-/tmp}"
HOME=$MOVED
export HOME
cd "$MOVED/Downloads" || t_die "the Downloads folder is not there." "sh tests/run.sh again"
GE_T_HOME="$MOVED/Downloads/growth-engine"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed in Downloads." "sh tests/run.sh again"
sh "$GE" remember decision "picked b2b, my buyers are agencies" > /dev/null 2>&1 \
  || t_die "the decision could not be written." "sh tests/run.sh again"
sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1 \
  || t_die "the prospect could not be added." "sh tests/run.sh again"

mv "$MOVED/Downloads/growth-engine" "$MOVED/Desktop/" \
  || t_die "the folder could not be moved to the Desktop." "ls -l $MOVED"
cd "$MOVED/Desktop" || t_die "the Desktop folder is not there." "sh tests/run.sh again"
GE_T_HOME="$MOVED/Desktop/growth-engine"

# 1. The doctor sees it, says so, and offers something.
sh "$GE" check > "$CASEWORK/moved-check.out" 2>&1
assert_contains "$CASEWORK/moved-check.out" 'FAIL  anchor' "a moved folder is reported"
assert_contains "$CASEWORK/moved-check.out" "$MOVED/Downloads/growth-engine" \
  "and the refusal names where it used to be"

# 2. What it offered, typed. This is the check that was never made, and the
#    reason a founder could sit in this state for three weeks.
run_arrow "$CASEWORK/moved-check.out" "the moved-folder recovery line" "FAIL  anchor"

# 3. And now the state. A recovery line that runs and changes nothing is worse
#    than one that fails, because the founder believes it worked.
assert_equals "$MOVED/Desktop/growth-engine" \
  "$(cat "$MOVED/Desktop/growth-engine/.state/HOME")" \
  "the folder is anchored where it now is"
sh "$GE" check > "$CASEWORK/moved-check2.out" 2>&1
assert_contains "$CASEWORK/moved-check2.out" 'PASS  anchor' "and the doctor agrees at the second ask"
assert_lacks "$CASEWORK/moved-check2.out" "$MOVED/Downloads" \
  "and nothing still points at the folder that is not there"

# 4. Nothing of the founder's was touched on the way.
assert_contains "$MOVED/Desktop/growth-engine/memory.md" 'picked b2b, my buyers are agencies' \
  "the decision written before the move is still there"
assert_contains "$MOVED/Desktop/growth-engine/people/sam-northfield-io.md" 'key: sam@northfield.io' \
  "and so is the prospect"
sh "$GE" remember decision "and the folder still works after the move" > "$CASEWORK/moved-rem.out" 2>&1
assert_exit 0 $? "and a new entry can be written from where the folder now is"

# 5. The other half of the same fault: an anchor emptied by a sync client that
#    created the file and had not written it yet.
true > "$MOVED/Desktop/growth-engine/.state/HOME" \
  || t_die "the anchor could not be emptied." "chmod u+w $MOVED/Desktop/growth-engine/.state"
sh "$GE" check > "$CASEWORK/empty-check.out" 2>&1
assert_contains "$CASEWORK/empty-check.out" 'FAIL' "an emptied anchor is reported"
run_arrow "$CASEWORK/empty-check.out" "the emptied-anchor recovery line" "FAIL  anchor"
assert_equals "$MOVED/Desktop/growth-engine" \
  "$(cat "$MOVED/Desktop/growth-engine/.state/HOME")" \
  "and it wrote the anchor rather than leaving it empty"

# ------------------------------------------------- a folder inside the folder

NEST="$SANDBOX/nest"
mkdir -p "$NEST" || t_die "the nesting sandbox could not be made." "df -h ${TMPDIR:-/tmp}"
HOME=$NEST
export HOME
cd "$NEST" || t_die "the nesting sandbox is not there." "sh tests/run.sh again"
GE_T_HOME="$NEST/growth-engine"

sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed in the nesting sandbox." "sh tests/run.sh again"
sh "$GE" log decision "day one, picked b2b" > /dev/null 2>&1 \
  || t_die "the first log entry could not be written." "sh tests/run.sh again"

# 6. Standing inside growth-engine, which is where ge init's own closing line
#    sends a founder, and running the one command it says is safe to run again.
cd "$NEST/growth-engine" || t_die "the growth-engine folder is not there." "sh tests/run.sh again"
sh "$GE" init > "$CASEWORK/nest-init.out" 2>&1
assert_exit 0 $? "ge init run from inside growth-engine still exits 0"
assert_absent "$NEST/growth-engine/growth-engine" \
  "and it does not build a second folder inside the first"
assert_contains "$CASEWORK/nest-init.out" "$NEST/growth-engine" \
  "and it names the folder the founder already had"

# 7. Work done from inside it lands in the folder the founder can see.
sh "$GE" log result "day two, sent 25 emails" > "$CASEWORK/nest-log.out" 2>&1
assert_exit 0 $? "ge log works from inside growth-engine"
assert_contains "$NEST/growth-engine/ops-log.md" 'day one, picked b2b' "day one is still in the ops log"
assert_contains "$NEST/growth-engine/ops-log.md" 'day two, sent 25 emails' "and day two is in the same one"

sh "$GE" remember decision "written from inside the folder" > /dev/null 2>&1
assert_contains "$NEST/growth-engine/memory.md" 'written from inside the folder' \
  "and a memory entry lands there too"

# 8. A folder inside the folder made another way: a founder duplicating it, or a
#    sync client restoring a copy in place. Two anchored folders are visible from
#    here, and ge has to say so rather than pick the empty one.
cp -R "$NEST/growth-engine" "$SANDBOX/copy-for-nest" \
  || t_die "the copy could not be made." "df -h ${TMPDIR:-/tmp}"
mv "$SANDBOX/copy-for-nest" "$NEST/growth-engine/growth-engine" \
  || t_die "the nested copy could not be put in place." "ls -l $NEST/growth-engine"
sh "$GE" log note "this must not be swallowed" > "$CASEWORK/nest-two.out" 2>&1
assert_exit 1 $? "two folders, one inside the other, is refused rather than guessed at"
assert_contains "$CASEWORK/nest-two.out" "$NEST/growth-engine/growth-engine" \
  "and the refusal names the folder inside"
assert_contains "$CASEWORK/nest-two.out" 'FAIL' "and it opens with FAIL"

# The doctor is the line the founder is sent to when nothing else works, so it is
# the one whose fix is typed here. Whether every other verb offers the same one
# is asked further down, on its own, so that a verb that does not cannot make
# this look like the fix itself failed.
sh "$GE" check > "$CASEWORK/nest-check.out" 2>&1
run_arrow "$CASEWORK/nest-check.out" "the nested-folder recovery line"
sh "$GE" log note "and after the fix the entry lands" > "$CASEWORK/nest-three.out" 2>&1
assert_exit 0 $? "and after running what it said, the same command works"
assert_contains "$NEST/growth-engine/ops-log.md" 'and after the fix the entry lands' \
  "and the entry is in the folder that was left"

# ------------------------------------------------------ two folders, side by side

TWINS="$SANDBOX/twins"
mkdir -p "$TWINS/Desktop" "$TWINS/Documents" "$TWINS/elsewhere" \
  || t_die "the two-folder sandbox could not be made." "df -h ${TMPDIR:-/tmp}"
HOME=$TWINS
export HOME
cd "$TWINS/Desktop" || t_die "the Desktop folder is not there." "sh tests/run.sh again"
GE_T_HOME="$TWINS/Desktop/growth-engine"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed on the Desktop." "sh tests/run.sh again"
sh "$GE" remember decision "the Desktop folder holds the onboarding week" > /dev/null 2>&1 \
  || t_die "the Desktop decision could not be written." "sh tests/run.sh again"

# The second one is copied rather than made with ge init, because ge init now
# refuses to make it. A founder gets here by duplicating the folder, by a sync
# client putting a copy back, or by unzipping the one they mailed themselves.
cp -R "$TWINS/Desktop/growth-engine" "$TWINS/Documents/growth-engine" \
  || t_die "the second folder could not be made." "df -h ${TMPDIR:-/tmp}"
printf '\n- 2026-09-10 the Documents folder holds the real work\n' \
  >> "$TWINS/Documents/growth-engine/ops-log.md" \
  || t_die "the second folder could not be marked." "ls -l $TWINS/Documents/growth-engine"

cd "$TWINS/elsewhere" || t_die "the elsewhere folder is not there." "sh tests/run.sh again"

# 9. Every verb that needs the folder, held to the one wording that names an
#    action. paths.sh says this refusal lives in one place so that all of them
#    say the same thing, and the thing it says is a command with both paths in
#    it. Thirteen different sentences, twelve of them describing rather than
#    naming, is what left founders with no door that opened.
TWINNED=0
scatter() {                             # <label> <ge arguments...>
  sc_label=$1
  shift
  sh "$GE" "$@" > "$CASEWORK/out" 2>&1
  TWINNED=$((TWINNED + 1))

  if grep -q -F -e "$TWINS/Desktop/growth-engine" -- "$CASEWORK/out" &&
     grep -q -F -e "$TWINS/Documents/growth-engine" -- "$CASEWORK/out"; then
    t_pass
  else
    t_note "$sc_label: the refusal does not name both folders"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$sc_label: both folders are not named"
  fi

  sc_cmd=$(arrow_of "$CASEWORK/out")
  case $sc_cmd in
    'mv '*) t_pass ;;
    *)
      t_note "$sc_label: the recovery line is not something to type"
      printf 'it said: %s\n' "$sc_cmd" >> "$CASEWORK/diff.txt"
      cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
      t_fail "$sc_label: [$sc_cmd] is not a command a founder can run" ;;
  esac
}

scatter 'check with two folders'        check
scatter 'context with two folders'      context
scatter 'log with two folders'          log note "anything"
scatter 'remember with two folders'     remember decision "anything"
scatter 'remember list with two folders' remember list
scatter 'person list with two folders'  person list
scatter 'person add with two folders'   person add prospect kit@brightops.co.uk "Kit Alvarez"
scatter 'ledger list with two folders'  ledger list C
scatter 'ledger add with two folders'   ledger add-content 1 1 short-post text
scatter 'snapshot with two folders'     snapshot memory.md
scatter 'restore with two folders'      restore memory.md
scatter 'undo with two folders'         undo
scatter 'index with two folders'        index
scatter 'lint with two folders'         lint
scatter 'receipt show with two folders' receipt show
scatter 'accounts list with two folders' accounts list
scatter 'init with two folders'         init

[ "$TWINNED" -ge 17 ] && t_pass || \
  t_fail "the sweep drove only $TWINNED verbs, and it is meant to drive at least 17"

# 10. Type the line, then ask whether ge can work again. Nothing else in the
#     suite has ever done this, and it is the whole difference between a refusal
#     that ends somewhere and one that does not.
sh "$GE" check > "$CASEWORK/twins-check.out" 2>&1
run_arrow "$CASEWORK/twins-check.out" "the two-folder recovery line"

sh "$GE" remember decision "and now there is only one folder" > "$CASEWORK/twins-rem.out" 2>&1
assert_exit 0 $? "after running what it said, ge writes again"
sh "$GE" check > "$CASEWORK/twins-check2.out" 2>&1
assert_lacks "$CASEWORK/twins-check2.out" 'more than one growth-engine folder' \
  "and the doctor stops saying there is more than one"
sh "$GE" person list > "$CASEWORK/twins-plist.out" 2>&1
assert_exit 0 $? "and so do the other verbs that were refusing"

# 11. Nothing was deleted. The refusal says so in as many words, and a founder
#     who renamed the wrong one has to be able to put it back. Which of the two
#     ge names is its own business, so both answers are allowed for and the
#     checks are on what has to be true either way.
if [ -d "$TWINS/Desktop/growth-engine" ]; then
  KEPT="$TWINS/Desktop/growth-engine"
  ASIDE="$TWINS/Documents/growth-engine-old"
else
  KEPT="$TWINS/Documents/growth-engine"
  ASIDE="$TWINS/Desktop/growth-engine-old"
fi
assert_contains "$ASIDE/memory.md" 'the Desktop folder holds the onboarding week' \
  "the folder that was moved aside still holds everything it held"
assert_contains "$KEPT/memory.md" 'and now there is only one folder' \
  "and the entry written afterwards landed in the one that was left"
[ -d "$KEPT" ] && [ -d "$ASIDE" ] && t_pass || \
  t_fail "one of the two folders is gone, and the refusal promised nothing would be deleted"

t_done
