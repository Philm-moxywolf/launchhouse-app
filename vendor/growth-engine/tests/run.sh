#!/bin/sh
# run.sh — the golden test suite for ge. Run it as: sh tests/run.sh
#
# WHY IT EXISTS: ge is the only copy of a founder's work, and the ways it breaks
#                are byte level. A carriage return a Windows editor added. A
#                snapshot that quietly did not happen. A managed block guessed at
#                rather than refused. Nothing else in this repository proves that
#                a change to ge still produces the same bytes on GNU date, on BSD
#                date and on Git Bash, and 130 people find out at the event.
# CALLED BY:     humans, the pre-commit hook, and every CI job
# READS:         tests/fixtures/**   WRITES: tests/.work/<shell>/** and a sandbox
# POSTURE:       fail-closed. A difference is a failure, never a warning, and the
#                suite exits non-zero the moment one case fails.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Runs on macOS, Linux and Git Bash.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# TWO PASSES, AND WHY THE SECOND ONE IS NOT OPTIONAL.
#   Every case runs the product as `sh "$GE"`, and bin/ge hands off with `exec sh`.
#   `sh` is a name looked up on PATH, so on this Mac both of those were bash, and
#   the suite could be green while the product had never once been read by the
#   shell that half the cohort will be on. dash is /bin/sh on most Linux and the
#   closest local stand-in for the Git Bash floor: it is the shell that ends
#   outright when a redirect on a special built-in fails, rather than carrying on
#   and reporting success. So the whole suite is run twice, and the second pass
#   puts a shortcut named sh, pointing at dash, at the front of PATH. That is
#   what makes the product itself run under dash rather than only the harness
#   around it. A machine with no dash is told so and the suite ends red, because
#   a pass that silently did not happen is what let five faults through a green
#   suite once already. `--shell sh` is there for a machine that genuinely has
#   none, and it says on the tin that half the proof is missing. `--shell bash`
#   is there for the other direction: on Linux, sh is already dash, so that is
#   how somebody there reads ge with the family Git Bash founders are on.
set -u

TESTS=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || {
  printf 'FAIL  tests/run.sh cannot work out where it lives.\n      → run: sh tests/run.sh from inside the repository\n' >&2
  exit 1
}
REPO=$(CDPATH= cd -- "$TESTS/.." && pwd) || exit 1
GE="$REPO/plugins/growth-engine/bin/ge"
WORKBASE="$TESTS/.work"

run_die() {                             # <what went wrong> <the command that fixes it>
  printf 'FAIL  %s\n      → run: %s\n' "$1" "$2" >&2
  exit 1
}

[ -f "$GE" ] || run_die "there is no ge at $GE." \
  "git status, to see whether plugins/growth-engine/bin/ge is missing from your checkout"

UPDATE=0
ONLY=''
while [ "$#" -gt 0 ]; do
  case $1 in
    --update) UPDATE=1 ;;
    --shell)
      shift
      [ "$#" -gt 0 ] || run_die "tests/run.sh --shell was given no shell to use." \
        "sh tests/run.sh --shell sh, or sh tests/run.sh --shell dash"
      ONLY=$1 ;;
    *) run_die "tests/run.sh does not understand \"$1\"." \
               "sh tests/run.sh, or sh tests/run.sh --update to rewrite the fixtures" ;;
  esac
  shift
done

# Which shells this run will read the product with. Both, unless the machine has
# no dash or the caller narrowed it by hand.
DASH=$(command -v dash 2>/dev/null) || DASH=''
[ -n "$DASH" ] && [ -x "$DASH" ] || DASH=''
SHELLS='sh dash'
NO_DASH=0
[ -n "$DASH" ] || { SHELLS='sh'; NO_DASH=1; }

BASH=$(command -v bash 2>/dev/null) || BASH=''
case $ONLY in
  '') ;;
  sh)   SHELLS='sh'; NO_DASH=0 ;;
  dash)
    [ -n "$DASH" ] || run_die "this machine has no dash, so the dash pass cannot run." \
      "brew install dash on a Mac, or apt-get install dash on Linux"
    SHELLS='dash'; NO_DASH=0 ;;
  # Named by hand, never a default. On a Mac sh is already bash, so the two
  # passes cover both families. On Linux sh is dash, and this is how somebody
  # there reads ge with the family Git Bash founders are actually on.
  bash)
    [ -n "$BASH" ] && [ -x "$BASH" ] || run_die "this machine has no bash on PATH." \
      "command -v bash, to see what is installed"
    SHELLS='bash'; NO_DASH=0 ;;
  *) run_die "tests/run.sh does not know a shell called \"$ONLY\"." \
             "sh tests/run.sh --shell sh, sh tests/run.sh --shell dash, or --shell bash" ;;
esac

# Fixtures are written once, from the sh pass. Both passes produce the same
# bytes, so writing them twice would only make it harder to say which run wrote
# the file that is about to be committed.
[ "$UPDATE" -eq 1 ] && SHELLS='sh' && NO_DASH=0

# The sandbox lives outside the repository. ge walks up from the working folder
# looking for a growth-engine folder, so a sandbox inside the repo would find
# the folder of whoever is running the suite and every case would fail with a
# refusal about there being more than one.
SANDROOT=$(mktemp -d "${TMPDIR:-/tmp}/ge-tests.XXXXXX") || \
  run_die "a temporary folder could not be made under ${TMPDIR:-/tmp}." \
          "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
# The permissions are put back before the sandbox is removed. Several cases take
# them off a folder on purpose, to drive what ge says when a sync client has the
# folder for a moment, and a case that stops early leaves them off. Without this
# the suite would leave folders behind that nothing can delete.
#
# u+rwX, and it used to be u+w. chmod walks a tree by entering each folder, so
# adding the write bit alone to a folder at 000 gives it 200, chmod itself then
# cannot read what is inside it, and rm has exactly the same problem afterwards.
# The old line reported Permission denied and the sandbox stayed in ${TMPDIR:-/tmp}
# for ever. It was never seen because every case took the write bit off with
# chmod a-w, which on a folder at 755 leaves 555 and keeps the search bit.
# 31-permission-modes drives 400 and 000 on purpose, so it is seen now. The X
# adds the search bit to folders and leaves ordinary files alone, which is the
# whole of the difference.
trap 'chmod -R u+rwX "$SANDROOT" 2>/dev/null; rm -rf "$SANDROOT"' EXIT
# TMPDIR ends with a slash on macOS, which leaves a doubled slash in the middle
# of every path built from it. ge prints the folder it made, so a doubled slash
# would show up in half the fixtures and in none of the others.
SANDROOT=$(CDPATH= cd -- "$SANDROOT" && pwd) || \
  run_die "the temporary folder could not be opened." "df -h ${TMPDIR:-/tmp}"

# Same reason, checked rather than assumed. If a growth-engine folder sits above
# the temporary folder, say so plainly instead of letting nine cases fail with a
# message about the wrong thing.
guard=$SANDROOT
while [ -n "$guard" ] && [ "$guard" != / ]; do
  [ -f "$guard/growth-engine/.state/HOME" ] && run_die \
    "there is a growth-engine folder at $guard/growth-engine, above the test sandbox." \
    "mv $guard/growth-engine elsewhere, then sh tests/run.sh again"
  guard=$(dirname -- "$guard")
done

rm -rf "$WORKBASE"
mkdir -p "$WORKBASE" || run_die "$WORKBASE could not be made." "chmod u+w $TESTS"

export TESTS REPO GE UPDATE

# GE_HOME pins ge to one folder and turns its search off. Every case except
# 32-pinned-folder builds a sandbox and expects the search to run inside it, so
# one left over in the shell of whoever runs the suite would point all thirty
# six cases at somebody's real folder and half of them would write into it.
# Cleared here, once, rather than in each case, because a case that forgot would
# be the one that did the damage. 32-pinned-folder sets it per command, and puts
# it back to the folder it built before it goes on to the next one.
unset GE_HOME

[ "$UPDATE" -eq 1 ] && printf 'Rewriting the fixtures. Read every changed line before you commit it.\n\n'

KEEP_PATH=$PATH
TOTAL_FAILED=0

for shell in $SHELLS; do
  # The shortcut is what makes `sh` mean dash for everything inside this pass:
  # the case scripts, the product they run, and bin/ge's own handoff.
  PASS_PATH=$KEEP_PATH
  if [ "$shell" != sh ]; then
    case $shell in
      dash) PASS_BIN=$DASH ;;
      *)    PASS_BIN=$BASH ;;
    esac
    mkdir -p "$SANDROOT/.as-$shell" || run_die "the $shell folder could not be made." \
      "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
    ln -s "$PASS_BIN" "$SANDROOT/.as-$shell/sh" || run_die \
      "a shortcut to $shell could not be made at $SANDROOT/.as-$shell/sh." \
      "ln -s $PASS_BIN $SANDROOT/.as-$shell/sh"
    PASS_PATH="$SANDROOT/.as-$shell:$KEEP_PATH"
  fi

  WORK="$WORKBASE/$shell"
  WORKROOT="$SANDROOT/$shell"
  mkdir -p "$WORK" "$WORKROOT" || run_die "$WORK could not be made." "chmod u+w $TESTS"
  GE_T_SHELL=$shell
  export WORK WORKROOT GE_T_SHELL

  printf 'Reading ge with %s\n' "$shell"

  PATH=$PASS_PATH
  export PATH

  PASSED=0
  FAILED=0
  for c in "$TESTS"/cases/*.sh; do
    [ -f "$c" ] || run_die "there are no cases in $TESTS/cases." \
      "git status, to see whether tests/cases is missing from your checkout"
    name=${c##*/}
    name=${name%.sh}
    # Run, never source. A sourced case that calls exit would end the suite here
    # and report everything after it as clean.
    if sh "$c"; then
      PASSED=$((PASSED + 1))
      n=0
      [ -f "$WORK/$name/checks" ] && n=$(cat "$WORK/$name/checks")
      printf 'PASS  %-22s %s checks\n' "$name" "$n"
    else
      FAILED=$((FAILED + 1))
      printf 'FAIL  %-22s see tests/.work/%s/%s/diff.txt\n' "$name" "$shell" "$name"
    fi
  done

  PATH=$KEEP_PATH
  export PATH

  printf '%s passed, %s failed, reading ge with %s\n\n' "$PASSED" "$FAILED" "$shell"
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
done

[ "$TOTAL_FAILED" -eq 0 ] || {
  printf 'FAIL  the golden suite is red, so the code and the fixtures disagree.\n      → run: cat tests/.work/<shell>/<case>/diff.txt, and fix the code before you touch a fixture\n' >&2
  exit 1
}

[ "$NO_DASH" -eq 0 ] || {
  printf 'FAIL  this machine has no dash, so ge was only ever read by one shell.\n' >&2
  printf '      dash is /bin/sh on most of Linux, and it is the one that stops dead\n' >&2
  printf '      where bash carries on and reports success. Half the proof is missing.\n' >&2
  printf '      On a machine that genuinely cannot have one, sh tests/run.sh --shell sh\n' >&2
  printf '      runs the half that can and says so rather than going quietly green.\n' >&2
  printf '      → run: brew install dash on a Mac, or apt-get install dash on Linux\n' >&2
  exit 1
}

exit 0
