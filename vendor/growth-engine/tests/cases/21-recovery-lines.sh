#!/bin/sh
# 21-recovery-lines.sh: every refusal a founder can reach ends with a way out.
#
# WHY IT EXISTS: the promise is written at the top of every file in this toolkit,
#                and until now nothing checked it. It matters more here than in
#                most software: the people running these commands do not read
#                shell errors, there is no support desk, and at the event there
#                are three days and 130 of them. A refusal that names no command
#                is where somebody stops and waits for a mentor. This drives every
#                failure path that can be reached from a shell and reads every
#                arrow line each one prints, not only the one at the bottom.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/21-recovery-lines/
# POSTURE:       fail-closed. A path that stops failing is a failure here too:
#                the sweep counts what it drove, so a command that quietly starts
#                succeeding cannot leave this case passing on fewer paths. Every
#                path also declares which of the two recovery shapes it expects,
#                and the declaration is checked both ways round, so a path cannot
#                drift from one shape to the other without somebody saying so.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Anything that needs standard
#                input is given a file rather than a pipe, because a function on
#                the right of a pipe runs in a subshell and its failed checks
#                would be thrown away with it.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHAT THIS CASE PROVES, AND WHAT IT LEAVES TO 30-recovery-runs
#
# This one reads. It proves the refusal is a refusal, that it opens with FAIL,
# that it ends on a recovery line of the shape that path is meant to give, and
# that an arrow-run line carries the command and nothing else. It never runs
# anything, so it cannot tell whether the command works: that is what
# tests/cases/30-recovery-runs.sh is for, in folders named the awkward ways real
# founders name them. The two drive the same list in the same order, so they can
# be read side by side.
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
. "$TESTS/lib/recovery.sh"

t_start 21-recovery-lines

WORKDIR="$SANDBOX/work"
AWAY="$SANDBOX/away"
mkdir -p "$WORKDIR" "$AWAY" || t_die "the sandbox folders could not be made." "df -h ${TMPDIR:-/tmp}"
GE_T_HOME="$WORKDIR/growth-engine"
DRIVEN=0

# arrow <kind> <label> <ge arguments...>: run it, and hold it to the four things
# every founder-visible refusal owes them. The exit code is only checked for
# being non-zero, because ge person tells "there is no such person" apart from
# "no" with a 2 and both are refusals.
#
# THE KIND IS THE POINT, AND IT IS NEW. This function used to assert one thing
# for every path: a last line carrying "→ run:". That is how a line reading
# "→ run: the same command again with one of those" passed here, and a founder
# who pasted it got a shell error about a command called "the". It is also how a
# line reading "→ run: ge init, if this is the folder you want your Launchhouse
# work kept in" passed, and ge answered that it has no command called "init,".
# The two shapes are now told apart, and each path says which one it is:
#
#   command   the last line is "→ run: " and one command, to the end of the
#             line, with nothing else on it. No comma, no "then ...", no "to
#             see ...". A founder selects the whole line and pastes it, so an
#             English clause on the end of it is not an explanation to their
#             shell, it is more arguments. Anything they need to know goes on
#             its own line above, where a sentence belongs.
#   guidance  ge has no command it can stand behind here, because only the
#             founder knows the value that was meant. The last line is a bare
#             "→ " and the one thing they do by hand. That way the arrow-run
#             form means pasteable every single time, and guidance is visibly
#             different on the screen as well as to this case.
#
# Checked in both directions. A path declared command that comes back as
# guidance fails, and a path declared guidance that comes back as a command
# fails. Neither shape can drift into the other while this stays green.
arrow() {                               # <kind> <label> <ge arguments...>
  ar_kind=$1
  ar_label=$2
  shift 2
  # A kind this case does not know would fall through to one of the two branches
  # and quietly assert the wrong shape, which costs a path its proof and says
  # nothing. Being unable to produce a result is a different thing from a result.
  case $ar_kind in
    command|guidance) true ;;
    *) t_die "21-recovery-lines was given a kind it does not know: $ar_kind." \
             "grep -n \"arrow $ar_kind\" tests/cases/21-recovery-lines.sh" ;;
  esac
  sh "$GE" "$@" > "$CASEWORK/out" 2>&1
  ar_rc=$?
  DRIVEN=$((DRIVEN + 1))

  if [ "$ar_rc" -eq 0 ]; then
    t_note "$ar_label: it did not fail"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$ar_label: exited 0, so this path no longer refuses"
  else
    t_pass
  fi

  if grep -q '^FAIL' "$CASEWORK/out"; then
    t_pass
  else
    t_note "$ar_label: no FAIL banner"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$ar_label: the refusal does not open with FAIL"
  fi

  # EVERY arrow in the message, not only the one at the bottom.
  #
  # A founder does not only paste the bottom line. ge check prints an arrow for
  # every leg with something to say, and ge accounts set names each row it could
  # not read, so one message can carry several lines somebody might select. Both
  # recovery cases used to take the last line and stop, which meant a broken
  # command could sit on any line but the last and nothing in the suite would
  # ever read it. Each one is held to the rule for the shape it is: a run line
  # to carrying the command and nothing else, a bare one to naming an action
  # that is not a word the shell reads as syntax.
  #
  # Done before the declaration is checked below, because the declaration is
  # about the LAST line only. A path whose last line has the wrong shape still
  # has every other arrow in its message read.
  rl_every_arrow "$CASEWORK/out" "$ar_label"

  ar_last=$(sed '/^[[:space:]]*$/d' "$CASEWORK/out" | sed -n '$p')
  rl_arrow "$ar_last"

  if [ "$RL_FORM" = none ]; then
    t_note "$ar_label: the last line is not a recovery line"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$ar_label: ends [$ar_last], and a refusal has to end on a way out"
    return 0
  fi

  if [ "$ar_kind" = guidance ]; then
    if [ "$RL_FORM" = bare ]; then
      t_pass
      return 0
    fi
    t_note "$ar_label: declared guidance, and offered as a command to paste"
    printf 'the line was: %s\n' "$ar_last" >> "$CASEWORK/diff.txt"
    printf 'ge cannot know the value meant here, so this line has to be a bare arrow\n' \
      >> "$CASEWORK/diff.txt"
    printf 'and an instruction, with no "run:" in front of it\n' >> "$CASEWORK/diff.txt"
    t_fail "$ar_label: guidance is printed in the slot a founder pastes from"
    return 0
  fi

  if [ "$RL_FORM" != run ]; then
    t_note "$ar_label: declared a command, and there is none"
    printf 'the line was: %s\n' "$ar_last" >> "$CASEWORK/diff.txt"
    printf 'a bare arrow says ge has nothing to paste, and this path has\n' >> "$CASEWORK/diff.txt"
    t_fail "$ar_label: a command was expected and the line is guidance"
    return 0
  fi
  t_pass
  # And the command is the whole of what a founder pastes.
  rl_tail_free "$RL_AFTER" "$ar_label"
  return 0
}

# ---------------------------------------------------------------- no folder

# The first refusal most founders ever see. Every verb that needs the folder is
# driven, because each one writes this sentence itself and they have drifted
# apart before. ge context is not here on purpose: it is the one that a hook
# runs, so no folder is silence and exit 0 rather than a refusal.
cd "$AWAY" || t_die "the away folder is not there." "sh tests/run.sh again"
OLDHOME=$HOME
HOME=$AWAY
export HOME

arrow command  'check with no folder'            check
arrow command  'log with no folder'              log note "anything"
arrow command  'remember with no folder'         remember decision "anything"
arrow command  'person list with no folder'      person list
arrow command  'person add with no folder'       person add prospect sam@northfield.io "Sam Carter"
arrow command  'person export with no folder'    person export firstlines
arrow command  'ledger list with no folder'      ledger list C
arrow command  'ledger add with no folder'       ledger add-content 1 1 short-post text
arrow command  'snapshot with no folder'         snapshot memory.md
arrow command  'restore with no folder'          restore memory.md
arrow command  'undo with no folder'             undo
arrow command  'index with no folder'            index
arrow command  'lint with no folder'             lint
arrow command  'receipt show with no folder'     receipt show
arrow command  'receipt set with no folder'      receipt set plugin PASS "ok"
arrow command  'accounts list with no folder'    accounts list

HOME=$OLDHOME
export HOME

# ---------------------------------------------------------------- a real folder

cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"
sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"

# Driven before anything has been changed, so it is the empty ring answer rather
# than an undo that succeeds.
arrow command  'undo with nothing to undo'       undo
# The natural guess, and the shape every other verb uses. It used to be taken,
# ignored, and answered by putting a different file back.
arrow command  'undo with a file name'           undo memory.md

sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1 \
  || t_die "the prospect could not be added." "sh tests/run.sh again"
sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1 \
  || t_die "the target could not be added." "sh tests/run.sh again"
sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1 \
  || t_die "the piece could not be added." "sh tests/run.sh again"

arrow command  'a verb ge does not have'         wibble
arrow command  'check with an argument'          check nonsense
arrow command  'context with an argument'        context nonsense
arrow command  'index with an argument'          index --strict
arrow command  'lint with a flag it has not'     lint --nope
arrow command  'lint --root with no folder'      lint --root "$SANDBOX/nothing-here"
arrow command  'lint --root with no value'       lint --root

arrow command  'log with a kind it has not'      log shout "hello"
arrow command  'log with no text'                log note "   "
arrow command  'remember with a kind it has not' remember feelings "hopeful"
arrow command  'remember amend against a miss'   remember --amend decision 1 "other" --expect "not what it says"

arrow command  'ledger with a verb it has not'   ledger frobnicate
# Three refusals that name a list and ask the founder to pick from it. ge knows
# the command that was typed but not which of the values was meant, so there is
# no one command it could paste, and the arrow has to be the bare one.
arrow guidance 'ledger with a field it has not'  ledger set-content 1 vibe high
arrow guidance 'ledger with a lane it has not'   ledger set-content 1 lane carrier-pigeon
arrow guidance 'ledger with a status it has not' ledger set-content 1 status banana
arrow guidance 'ledger approving by the back door' ledger set-content 1 status approved
arrow command  'ledger with a date it cannot read' ledger set-content 1 scheduled_for tomorrow
arrow command  'ledger with an id that is not there' ledger set-content 99 format short-post

arrow command  'person with a verb it has not'   person frobnicate
arrow command  'person get someone not there'    person get nobody@nowhere.io
arrow command  'person note someone not there'   person note nobody@nowhere.io "text"
# The founder's own words carried a marker, or a line break. ge cannot know what
# they meant to write instead, so both of these are the bare arrow.
arrow guidance 'person note with a marker'       person note sam@northfield.io "x <!-- GE:NOTES:END --> y"
arrow command  'person note with no text'        person note sam@northfield.io ""
arrow guidance 'person note with a line break'   person note sam@northfield.io "first
second"
arrow command  'person touch with a bad channel' person touch sam@northfield.io pigeon out "hello"
arrow command  'person touch with a bad way'     person touch sam@northfield.io email sideways "hello"
arrow command  'person set a field that cannot change' person set sam@northfield.io key other@example.com
arrow command  'person set a field it has not'   person set sam@northfield.io vibe high
arrow command  'person set a status it has not'  person set sam@northfield.io status banana
arrow command  'person add the same person twice' person add prospect sam@northfield.io "Sam Carter"
arrow command  'person add with no address'      person add prospect not-an-address "Nobody"
arrow command  'person add with a platform it has not' person add target myspace someone "Some One"
arrow command  'person opener from nowhere'      person opener ig:helen.makes from-the-air
arrow command  'person opener from a file that is not there' person opener ig:helen.makes --file "$SANDBOX/nothing.txt"
arrow command  'person remove someone not there' person remove nobody@nowhere.io
arrow command  'person purge someone still live' person purge sam@northfield.io
arrow command  'person purge someone not there'  person purge nobody@nowhere.io

arrow command  'snapshot with no file name'      snapshot
arrow command  'snapshot of a folder'            snapshot people
arrow command  'snapshot outside the folder'     snapshot /etc/hosts
arrow command  'snapshot stepping outside'       snapshot ../memory.md
arrow command  'restore with no file name'       restore
arrow command  'restore a file with no backups'  restore memory.md
arrow command  'restore a stamp that is not there' restore ledger.md 20200101T000000Z

arrow command  'receipt with a verb it has not'  receipt fetch
arrow guidance 'receipt show with no receipt'    receipt show
arrow command  'receipt with a result it has not' receipt set plugin MAYBE "half working"
arrow command  'receipt with a name that is not one word' receipt set "two words" PASS "ok"
arrow command  'receipt with a check and no result' receipt set plugin
arrow command  'receipt with a date in words'    receipt set pit-created "last tuesday"
arrow command  'receipt with a day that is not one' receipt set pit-created 2026-13-40
arrow command  'receipt with a day not on the calendar' receipt set pit-created 2026-02-30
arrow command  'receipt with a day in the future' receipt set pit-created 2030-01-01
# The founder wrote a token where a description belongs. Only they know what
# they saw, so ge has no description to put in a command, and the arrow is bare.
arrow guidance 'receipt carrying a token'        receipt set ghl PASS "pit-abc123def"

arrow command  'accounts with a verb it has not' accounts refresh
arrow guidance 'accounts list with nothing cached' accounts list

# The three that read standard input. Given a file rather than a pipe, so the
# checks inside arrow are recorded rather than lost with a subshell.
printf 'just one field\n' > "$CASEWORK/badrow.txt"
arrow command  'accounts set with a row it cannot read' accounts set < "$CASEWORK/badrow.txt"
printf 'pit-abc123|facebook|Lumen Skin\n' > "$CASEWORK/tokenrow.txt"
arrow command  'accounts set carrying a token'   accounts set < "$CASEWORK/tokenrow.txt"
true > "$CASEWORK/norows.txt" || t_die "the empty file could not be made." "chmod u+w $CASEWORK"
arrow command  'accounts set with nothing piped in' accounts set < "$CASEWORK/norows.txt"
printf 'a line\n<!-- GE:OPENER:END -->\n' > "$CASEWORK/markeropener.txt"
arrow command  'person opener piped in with a marker' person opener ig:helen.makes - < "$CASEWORK/markeropener.txt"

# The half marked file. A founder deletes a line they do not understand, and
# every write to that file afterwards has to refuse and say what to put back.
#
# Declared guidance, and this is the one worth reading twice. Where the founder's
# section stops is the one thing ge cannot work out: the START marker is there
# and the END is gone, so putting the END back at the bottom of the file would
# swallow whatever they wrote underneath into a block ge rewrites. lib/blocks.sh
# says so in its own header and prints a bare arrow for all five damaged shapes.
# A command in this slot could only be a guess at where somebody's writing ends.
awk '!/GE:WORKED:END/' growth-engine/memory.md > "$CASEWORK/damaged" \
  || t_die "the damaged memory.md could not be prepared." "sh tests/run.sh again"
cp "$CASEWORK/damaged" growth-engine/memory.md
arrow guidance 'remember into a half marked file' remember worked "the short posts got replies"

# The count. Without it a change that stopped any of these failing would leave
# this case passing on whatever was left.
[ "$DRIVEN" -ge 65 ] && t_pass || \
  t_fail "the sweep drove only $DRIVEN failure paths, and it is meant to drive at least 65"

t_done
