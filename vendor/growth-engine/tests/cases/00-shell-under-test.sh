#!/bin/sh
# 00-shell-under-test.sh: the pass really is reading ge with the shell it names.
#
# WHY IT EXISTS: the suite was green at 827 checks while four critical faults
#                were live, and one reason was that ge had never been read by
#                anything but bash. run.sh now runs everything twice and points
#                sh at dash for the second pass, but a shim that quietly stopped
#                working would give back the same green wall of PASS lines and
#                nobody would know the second pass had become a copy of the
#                first. This is the case that would go red instead. It runs
#                first on purpose: if the shell under test is not what it says,
#                nothing after it is worth reading.
# CALLED BY:     tests/run.sh
# READS:         plugins/growth-engine/bin/ge   WRITES: tests/.work/<shell>/00-shell-under-test/
# POSTURE:       fail-closed. The dash pass has to prove the shell is not bash,
#                and it has to prove the handoff inside ge still goes through the
#                name the shim covers. Neither is taken on trust.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 00-shell-under-test
cd "$SANDBOX" || t_die "the sandbox for 00-shell-under-test is not there." "sh tests/run.sh again"

PASS_SHELL=${GE_T_SHELL:-sh}

# 1. ge still hands the work over by the name the shim covers. bin/ge ends with
#    exec sh, and that one word is the whole reason putting a shortcut named sh
#    in front of PATH changes the shell the product is read by. A change to a
#    hard-coded path there would leave both passes reading ge with bash again,
#    and every case after this one would still be green.
grep -q -F -e 'exec sh "' -- "$GE"
assert_exit 0 $? "ge hands off with exec sh, which is what the shim covers"

# 2. The product answers under whichever shell this pass leads to. Version is
#    used because it touches no folder and so cannot fail for another reason.
sh "$GE" version > "$CASEWORK/version.out" 2>&1
assert_exit 0 $? "ge answers under $PASS_SHELL"
V=$(cat "$CASEWORK/version.out")
[ -n "$V" ] && t_pass || t_fail "ge version printed nothing under $PASS_SHELL"

# 3. What sh actually leads to in this pass.
sh -c 'printf "%s\n" "${BASH_VERSION:-none}"' > "$CASEWORK/flavour.out" 2>&1
FLAVOUR=$(cat "$CASEWORK/flavour.out")

if [ "$PASS_SHELL" = dash ]; then
  # dash sets no BASH_VERSION, so anything else here means the shortcut run.sh
  # puts in front of PATH is not being reached and this pass is a second copy
  # of the first one.
  assert_equals none "$FLAVOUR" "the dash pass is not reading ge with bash"

  # The other half of the same question, asked the way it will actually bite:
  # something only bash can read. dash refuses it outright, which is the whole
  # point of running the suite twice.
  sh -c 'x=abc; printf "%s\n" "${x:0:1}"' > /dev/null 2>&1
  bashism=$?
  if [ "$bashism" -eq 0 ]; then
    t_note "the dash pass read a bash-only expansion"
    printf 'a bash-only expansion was accepted, so sh is not dash in this pass\n' >> "$CASEWORK/diff.txt"
    t_fail "the dash pass is reading ge with a shell that is not dash"
  else
    t_pass
  fi
elif [ "$PASS_SHELL" = bash ]; then
  # Asked for by hand, and the whole reason to ask is to read ge with the family
  # Git Bash founders are on. A pass that quietly fell back to dash would prove
  # the opposite of what was wanted.
  if [ "$FLAVOUR" = none ]; then
    t_note "the bash pass is not reading ge with bash"
    printf 'no bash version was reported, so the shortcut is not being reached\n' >> "$CASEWORK/diff.txt"
    t_fail "the bash pass is reading ge with a shell that is not bash"
  else
    t_pass
  fi
else
  # The first pass takes whatever sh is on this machine, which is bash on a Mac
  # and dash on most of Linux. Both are wanted, so the only thing asserted is
  # that something answered.
  [ -n "$FLAVOUR" ] && t_pass || t_fail "sh answered with nothing at all in the $PASS_SHELL pass"
fi

t_done
