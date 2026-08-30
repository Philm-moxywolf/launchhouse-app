#!/bin/sh
# 30-recovery-runs.sh: every recovery line is run, and the state is read again.
#
# WHY IT EXISTS: 21-recovery-lines proves a recovery line is THERE. It holds
#                every driven path to a non-zero exit, a FAIL banner, and a last
#                line carrying the arrow, and it never once reads what is after
#                the arrow. That is how thousands of checks stayed green while
#                the toolkit printed lines that do not run. Three of them were
#                found by hand: one naming ge init with a comma stuck to it, so
#                ge answers that it has no command of that name; one telling the
#                founder to open a file and add a marker line, which pasted into
#                a shell is not a command and errors on the punctuation; one
#                naming a person by a two word name, which produces a second and
#                more confusing refusal. At the event there is no support desk
#                and three days. A founder selects the line, pastes it, and what
#                happens next is either the way out or the end of their session.
#                So here the line is run, and then the thing that failed is run
#                again and has to have stopped failing.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/30-recovery-runs/
# POSTURE:       fail-closed, in both directions. Every driven path declares what
#                kind of line it expects and the declaration is checked twice
#                over: by SHAPE, so a line declared guidance has to carry the
#                bare arrow and every other kind has to carry "→ run: ", and by
#                BEHAVIOUR, so a line declared runnable has to run and a line
#                declared guidance has to be prose. A broken command therefore
#                cannot sit quietly in the guidance bucket, and a real command
#                cannot be printed as guidance either. A path that stops failing
#                fails here too, and the sweep counts what it drove.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. No arrays, no local. Anything
#                that reads standard input is given a file, never the terminal,
#                so a line that waits for typing ends rather than wedging the run.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHY THE FOLDERS ARE NAMED THE WAY THEY ARE. Every sandbox this suite built
# before today was named plainly, and mktemp never puts a space in a path. That
# single accident is why an unquoted path in a recovery line was invisible: a
# folder called "sh" pastes back fine whether it was quoted or not. Half the
# folders in this programme are named after a business, so they carry a space,
# and the four characters below are the ones that break a pasted line: a space
# splits it, an apostrophe opens a quote that never closes, a bracket is a
# pattern, and a backslash is eaten. The wide sweep runs in a folder carrying all
# four at once, so no line in the whole enumeration is read in easy conditions.
# The narrow sweep runs the refusals that actually print a founder path, once per
# character, so when the wide one goes red there is something that says which
# character did it.
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
. "$TESTS/lib/recovery.sh"

t_start 30-recovery-runs
rl_setup "$SANDBOX/.ge-bin"

DRIVEN=0
CLEARED=0
TAG=''
true > "$CASEWORK/riding" || t_die "the notes file for this case could not be started." "chmod u+w $CASEWORK"
true > "$CASEWORK/riding.labels" || t_die "the notes file for this case could not be started." "chmod u+w $CASEWORK"
true > "$CASEWORK/prose" || t_die "the notes file for this case could not be started." "chmod u+w $CASEWORK"

# One line a founder would type, for the two commands that read what is typed.
printf 'saw your reel about slow mornings\n' > "$CASEWORK/typed-line.txt" \
  || t_die "the file standing in for what a founder types could not be made." "chmod u+w $CASEWORK"

# ---------------------------------------------------------------- the driver

# recovery <kind> <label> <ge arguments...>
#
# Four globals may be set immediately before a call, and every one of them is put
# back afterwards so it can never leak into the next path:
#   RL_IN    the file the failing command reads. Default /dev/null.
#   RL_FEED  the file the recovery command reads, standing in for what a founder
#            would type at it. Default /dev/null.
#   RL_FROM  the <placeholder> in a template line.
#   RL_TO    what this case substitutes for it, already quoted for a shell.
recovery() {                            # <kind> <label> <ge arguments...>
  rc_kind=$1
  rc_label=$2
  shift 2
  # A kind that is not one of the seven would fall through to the runnable branch
  # and quietly behave like the weakest of them, so a typo in a declaration would
  # cost a path its proof and say nothing. This case cannot produce a result for
  # a path it does not understand, and that is a different thing from a failure.
  case $rc_kind in
    clears|unblocks|instead|template|guidance|skill|settles) true ;;
    *) t_die "30-recovery-runs was given a kind it does not know: $rc_kind." \
             "grep -n \"recovery $rc_kind\" tests/cases/30-recovery-runs.sh" ;;
  esac
  rc_in=$RL_IN
  rc_feed=$RL_FEED
  rc_from=$RL_FROM
  rc_to=$RL_TO
  RL_IN=/dev/null; RL_FEED=/dev/null; RL_FROM=''; RL_TO=''
  DRIVEN=$((DRIVEN + 1))

  sh "$GE" "$@" < "$rc_in" > "$CASEWORK/out" 2>&1
  rc_rc=$?
  rc_first=$(rl_first_line "$CASEWORK/out")
  rc_last=$(rl_last_line "$CASEWORK/out")

  # It still refuses. A path that quietly starts succeeding would otherwise
  # leave this case passing on one fewer piece of evidence every time.
  if [ "$rc_rc" -eq 0 ]; then
    t_note "$rc_label: it did not fail"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$rc_label: exited 0, so this path no longer refuses"
    return 0
  fi
  t_pass

  # Which arrow the line carries, and what follows it.
  #
  # THE SHAPE IS PART OF THE DECLARATION NOW. A line beginning "→ run: " says to
  # a founder: select this and paste it. A bare "→ " says: this one is yours to
  # do by hand. Reading the two the same way is what let "→ run: the same command
  # again with one of those" sit here as guidance while a founder pasted it and
  # got a shell error about a command called "the". So guidance has to be the
  # bare shape and every other kind has to be the run shape, and a path that
  # swaps one for the other fails until somebody says which it is now.
  # EVERY arrow in the message first, and only then the one at the bottom.
  #
  # This case and 21-recovery-lines both used to read the last non-blank line
  # and stop, so a message carrying several ways out had all but one of them
  # read by nothing at all. ge check prints an arrow for every leg with
  # something to say, and ge accounts set names every row it could not read.
  # Each of those is a line a founder might select, and each is held here to the
  # rule for the shape it is: a run line to carrying the command and nothing
  # else, a bare one to naming an action that is not a word the shell reads as
  # syntax. The last line is then judged against what this path declared, which
  # is a different question and is asked below.
  rl_every_arrow "$CASEWORK/out" "$rc_label"

  rl_arrow "$rc_last"
  if [ "$RL_FORM" = none ]; then
    t_note "$rc_label: the last line is not a recovery line"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$rc_label: ends [$rc_last]"
    return 0
  fi
  rc_after=$RL_AFTER

  # Nothing in the line was broken into pieces on the way out.
  #
  # Asked before the shape is judged, and on purpose. A founder's folder name has
  # to come back whole whichever arrow the line carries, and the narrow sweep
  # drives every one of its paths once per awkward character for exactly that
  # proof. Left until after the shape check, a line with the wrong arrow would
  # take its quoting check down with it and four sweeps would quietly prove less.
  rl_quoted "$rc_after" "$rc_label"

  if [ "$rc_kind" = guidance ]; then
    if [ "$RL_FORM" != bare ]; then
      t_note "$rc_label: declared guidance, and offered as a command to paste"
      printf 'the line was: %s\n' "$rc_last" >> "$CASEWORK/diff.txt"
      printf 'ge cannot know the value meant here, so the line has to be a bare arrow\n' \
        >> "$CASEWORK/diff.txt"
      printf 'and an instruction, with no "run:" in front of it\n' >> "$CASEWORK/diff.txt"
      t_fail "$rc_label: guidance is printed in the slot a founder pastes from"
      return 0
    fi
    t_pass
  elif [ "$rc_kind" = settles ]; then
    # Either shape is honest here, so neither is demanded. What is demanded is
    # further down: whichever shape it is, it does not lead to a second refusal.
    t_pass
  else
    if [ "$RL_FORM" != run ]; then
      t_note "$rc_label: declared a command, and there is none"
      printf 'the line was: %s\n' "$rc_last" >> "$CASEWORK/diff.txt"
      printf 'a bare arrow says ge has nothing to paste, and this path has\n' >> "$CASEWORK/diff.txt"
      t_fail "$rc_label: a command was expected and the line is guidance"
      return 0
    fi
    t_pass
  fi

  rc_cmd=$(rl_part cmd "$rc_after")
  rc_rest=$(rl_part rest "$rc_after")
  # Only a run line can carry English after the command, because only a run line
  # claims that everything on it is a command. Guidance is English by design and
  # is already past this point.
  if [ -n "$rc_rest" ] && [ "$RL_FORM" = run ]; then
    printf '%s\n' "$rc_label" >> "$CASEWORK/riding.labels"
    { printf '%s\n' "$rc_label"
      printf '  the whole line : %s\n' "$rc_after"
      printf '  the command    : %s\n' "$rc_cmd"
      printf '  also pasted    : %s\n' "$rc_rest"
    } >> "$CASEWORK/riding"
  fi

  # Prose, declared. Held to being prose so a command cannot hide in here.
  #
  # The lookup is done with the test copy of ge on PATH, in a subshell so that
  # PATH goes back afterwards. Without it a line that opened with the word ge
  # would be looked up on the harness's own PATH, where there is no ge, come back
  # as "not a command", and pass as prose. That is exactly the hole this whole
  # case exists to close, one level up.
  if [ "$rc_kind" = guidance ]; then
    rc_word=${rc_after%% *}
    if [ -n "$rc_word" ] && ( PATH="$RL_BIN:$RL_PATH0"; command -v "$rc_word" ) > /dev/null 2>&1; then
      t_note "$rc_label: declared guidance and it is not"
      printf 'the line was: %s\n' "$rc_after" >> "$CASEWORK/diff.txt"
      printf 'and %s is a program on this machine, so this line is a command that was never run\n' \
        "$rc_word" >> "$CASEWORK/diff.txt"
      t_fail "$rc_label: declared guidance, but it opens with the command $rc_word"
    else
      t_pass
    fi
    { printf '%s\n' "$rc_label"; printf '  %s\n' "$rc_after"; } >> "$CASEWORK/prose"
    return 0
  fi

  # A path where more than one line would be honest, held to the one thing that
  # is true of all of them: it does not lead to a second refusal.
  #
  # A bare arrow needs nothing run, and it has already been read by
  # rl_every_arrow above, so it stops here. A Claude Code command is checked the
  # way the skill kind checks one. Anything else is a shell command and drops
  # through to be run like every other runnable kind.
  if [ "$rc_kind" = settles ]; then
    if [ "$RL_FORM" = bare ]; then
      { printf '%s\n' "$rc_label"; printf '  %s\n' "$rc_after"; } >> "$CASEWORK/prose"
      t_pass
      return 0
    fi
    case $rc_cmd in
      /*) rc_kind=skill ;;
    esac
  fi

  # A Claude Code command, not a shell one. Not run by a shell, and said so here
  # rather than left to look like a command that nobody thought to try.
  if [ "$rc_kind" = skill ]; then
    rc_slash=''
    case $rc_cmd in
      /growth-engine:*) rc_slash=${rc_cmd#/growth-engine:} ;;
    esac
    if [ -n "$rc_slash" ] && [ -f "$REPO/plugins/growth-engine/commands/$rc_slash.md" ]; then
      t_pass
    else
      t_note "$rc_label: the command it names is not in the plugin"
      printf 'the line was: %s\n' "$rc_after" >> "$CASEWORK/diff.txt"
      printf 'there is no plugins/growth-engine/commands/%s.md\n' "$rc_slash" >> "$CASEWORK/diff.txt"
      t_fail "$rc_label: names a Claude Code command the plugin does not have"
    fi
    return 0
  fi

  # A template. The brackets have to be there, because a founder can only fill in
  # a gap they can see, and then one real value goes in and the rest is ordinary.
  if [ "$rc_kind" = template ]; then
    case $rc_cmd in
      *"$rc_from"*) t_pass ;;
      *)
        t_note "$rc_label: the gap the founder has to fill is not marked"
        printf 'the line was: %s\n' "$rc_after" >> "$CASEWORK/diff.txt"
        printf 'this case expected to find: %s\n' "$rc_from" >> "$CASEWORK/diff.txt"
        t_fail "$rc_label: no $rc_from in the line"
        return 0 ;;
    esac
    rc_cmd="${rc_cmd%%"$rc_from"*}$rc_to${rc_cmd#*"$rc_from"}"
  fi

  # Run it, here, the way a founder would.
  rl_exec "$rc_cmd" "$rc_feed"
  if [ "$RL_RC" -ne 0 ] || grep -q '^FAIL' "$CASEWORK/recovery.out"; then
    t_note "$rc_label: the recovery line does not run"
    printf 'the refusal ended:\n  → run: %s\n' "$rc_after" >> "$CASEWORK/diff.txt"
    printf 'the command in it:\n  %s\n' "$rc_cmd" >> "$CASEWORK/diff.txt"
    printf 'running that exited %s and said:\n' "$RL_RC" >> "$CASEWORK/diff.txt"
    sed 's/^/  /' "$CASEWORK/recovery.out" >> "$CASEWORK/diff.txt"
    t_fail "$rc_label: the way out exits $RL_RC"
    return 0
  fi
  t_pass

  case $rc_kind in
    clears)
      sh "$GE" "$@" < "$rc_in" > "$CASEWORK/again.out" 2>&1
      rc_again=$?
      if [ "$rc_again" -eq 0 ]; then
        t_pass
        CLEARED=$((CLEARED + 1))
      else
        t_note "$rc_label: the way out ran and the condition is still there"
        printf 'it first said:\n  %s\n' "$rc_first" >> "$CASEWORK/diff.txt"
        printf 'the way out was:\n  %s\n' "$rc_cmd" >> "$CASEWORK/diff.txt"
        printf 'and running the same command again exited %s and said:\n' "$rc_again" >> "$CASEWORK/diff.txt"
        sed 's/^/  /' "$CASEWORK/again.out" >> "$CASEWORK/diff.txt"
        t_fail "$rc_label: the same command still exits $rc_again afterwards"
      fi ;;
    unblocks)
      sh "$GE" "$@" < "$rc_in" > "$CASEWORK/again.out" 2>&1
      rc_again_first=$(rl_first_line "$CASEWORK/again.out")
      if [ "$rc_again_first" != "$rc_first" ]; then
        t_pass
        CLEARED=$((CLEARED + 1))
      else
        t_note "$rc_label: the way out ran and the same refusal came back"
        printf 'both times it said:\n  %s\n' "$rc_first" >> "$CASEWORK/diff.txt"
        printf 'the way out was:\n  %s\n' "$rc_cmd" >> "$CASEWORK/diff.txt"
        t_fail "$rc_label: the same refusal comes back word for word"
      fi ;;
    *) true ;;
  esac
  return 0
}

# ---------------------------------------------------------------- the sandbox

# A folder with a founder's work already in it. Built once per sandbox and put
# back with a copy before every driven path, because running a recovery line
# changes the folder and the next path has to start from the same place. The
# anchor inside the copy already names the folder it is copied into, so nothing
# has to be rewritten afterwards. Times are kept, or the index would look older
# than the files it lists and the doctor would report a fault this case invented.
build_template() {                      # <root>
  bt_r=$1
  mkdir -p "$bt_r/work" "$bt_r/tmpl" || t_die "the sandbox folders could not be made." \
    "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
  cd "$bt_r/work" || t_die "the work folder is not there." "sh tests/run.sh again"
  HOME="$bt_r/work"
  export HOME
  sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
  sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1 \
    || t_die "the prospect could not be added." "sh tests/run.sh again"
  sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1 \
    || t_die "the target could not be added." "sh tests/run.sh again"
  sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1 \
    || t_die "the content piece could not be added." "sh tests/run.sh again"
  # The two files a founder has by the time they hit most of these refusals, and
  # which several recovery lines name. Written here rather than left out, because
  # a recovery line that says ge snapshot founder-brain.md is only fairly judged
  # against a folder that has one. Their contents are the shape ge expects and
  # nothing more: no numbers, no customers, nothing that reads as real.
  { printf '# Founder brain\n\n'
    printf 'Track: b2b\n'
    printf 'Locked: 2026-09-01\n\n'
    printf '## Thesis\n\nOps leads at small agencies lose a day a week to handovers.\n\n'
    printf '## Offer\n\nA two week handover audit, at a fixed price.\n\n'
    printf '## Audience\n\nOps leads at agencies of ten to forty people.\n\n'
    printf '## Proof\n\nNothing to point at yet, so write from what I see.\n\n'
    printf '## Numbers\n\nTen conversations is the number that matters.\n\n'
    printf '## Goal\n\nTen conversations booked by the end of September.\n\n'
    printf '## Channels\n\nEmail first, LinkedIn second.\n\n'
    printf '## Voice\n\nPlain, short sentences, nothing that sounds like selling.\n\n'
    printf '## Flags\n\n'
    printf -- '- nothing to point at yet, so write from what I see\n'
  } > growth-engine/founder-brain.md || t_die "the brain file could not be written." "chmod u+w $bt_r/work"
  printf 'C1 short-post\n\nThe first line of the first post.\n' > growth-engine/content-30.md \
    || t_die "the content file could not be written." "chmod u+w $bt_r/work"
  # One backup of the brain, so the line that says ge restore founder-brain.md
  # has something to restore. memory.md is deliberately left with none, because
  # one driven path is the refusal for a file that has no backups.
  sh "$GE" snapshot founder-brain.md > /dev/null 2>&1 \
    || t_die "the brain could not be backed up." "sh tests/run.sh again"
  sh "$GE" index > /dev/null 2>&1 || t_die "the index could not be built." "sh tests/run.sh again"
  cd "$bt_r" || t_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$bt_r/tmpl/growth-engine"
  cp -Rp "$bt_r/work/growth-engine" "$bt_r/tmpl/growth-engine" \
    || t_die "the copy this case starts every path from could not be made." \
             "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
}

stage_folder() {                        # <root>
  cd "$1" || t_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$1/work"
  mkdir -p "$1/work" || t_die "the work folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cp -Rp "$1/tmpl/growth-engine" "$1/work/growth-engine" \
    || t_die "the folder could not be put back for the next path." "df -h ${TMPDIR:-/tmp}"
  cd "$1/work" || t_die "the work folder is not there." "sh tests/run.sh again"
  HOME="$1/work"
  export HOME
}

# A folder ge init has just been run in and nothing else. Two of the refusals
# only happen before anything has been changed.
stage_fresh() {                         # <root>
  cd "$1" || t_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$1/work"
  mkdir -p "$1/work" || t_die "the work folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cd "$1/work" || t_die "the work folder is not there." "sh tests/run.sh again"
  HOME="$1/work"
  export HOME
  sh "$GE" init > /dev/null 2>&1 || t_die "ge init failed inside the sandbox." "sh tests/run.sh again"
}

# No folder anywhere ge looks. The first refusal most founders ever see.
stage_empty() {                         # <root>
  cd "$1" || t_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$1/away"
  mkdir -p "$1/away" || t_die "the empty folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cd "$1/away" || t_die "the empty folder is not there." "sh tests/run.sh again"
  HOME="$1/away"
  export HOME
}

# ---------------------------------------------------------- the other two stages

# THE STAGE A FOLDER IS AT IS PART OF THE STATE, AND IT WAS MISSING.
#
# Everything above builds one folder and one only: the Brain written, two people
# added, a ledger row, and content-30.md sitting beside them. That is a founder
# on the far side of session 2, and until now it was the only shape any driven
# path was ever run against.
#
# It is not the shape most of them are in. The programme runs over three
# sessions across three weeks. content-30.md is what session 2 writes, so
# between session 1 and session 2 every founder in the cohort has a Brain, a
# ledger with rows in it, and no words. ge ledger approve refuses outright in
# that folder, and refusals hand it over as the way out. Proved only against a
# folder that already had the file, every one of those lines passed.
#
# Two stages, because the file is missing in two different ways and the code
# tells them apart: not there at all, and there with nothing in it. The second
# is a founder who made the file by hand, or whose session 2 ended early.
#
# Built by copying the finished folder and taking the file away rather than by
# running ge init again, because the anchor inside the copy already names the
# folder every stage_ function restores into. The index is rebuilt afterwards,
# or it would count a file that is not there and the doctor would report a fault
# this case invented.
build_stages() {                        # <root>
  bs_r=$1

  stage_folder "$bs_r"
  rm -f growth-engine/content-30.md || t_die "the words file could not be taken away." \
    "chmod u+w $bs_r/work"
  sh "$GE" index > /dev/null 2>&1 || t_die "the index could not be rebuilt." "sh tests/run.sh again"
  rm -rf "$bs_r/tmpl-pieces"
  cp -Rp "$bs_r/work/growth-engine" "$bs_r/tmpl-pieces" \
    || t_die "the between sessions folder could not be kept." "df -h ${TMPDIR:-/tmp}"
  # Said out loud rather than assumed. A stage that turned out to be the same
  # folder as the finished one would drive six paths that prove nothing and
  # report six more passes for it, which is worse than not having them.
  [ ! -e "$bs_r/tmpl-pieces/content-30.md" ] || t_die \
    "the between sessions folder still has content-30.md in it, so it is not that stage at all." \
    "grep -n build_stages tests/cases/30-recovery-runs.sh"

  stage_folder "$bs_r"
  true > growth-engine/content-30.md || t_die "the words file could not be emptied." \
    "chmod u+w $bs_r/work"
  sh "$GE" index > /dev/null 2>&1 || t_die "the index could not be rebuilt." "sh tests/run.sh again"
  rm -rf "$bs_r/tmpl-empty"
  cp -Rp "$bs_r/work/growth-engine" "$bs_r/tmpl-empty" \
    || t_die "the empty words folder could not be kept." "df -h ${TMPDIR:-/tmp}"
  [ -f "$bs_r/tmpl-empty/content-30.md" ] && [ ! -s "$bs_r/tmpl-empty/content-30.md" ] || t_die \
    "the empty words folder does not have an empty content-30.md in it, so it is not that stage." \
    "grep -n build_stages tests/cases/30-recovery-runs.sh"
}

# stage_from <root> <template name>: the shared half of every stage_ function.
stage_from() {                          # <root> <template folder name>
  cd "$1" || t_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$1/work"
  mkdir -p "$1/work" || t_die "the work folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cp -Rp "$1/$2" "$1/work/growth-engine" \
    || t_die "the $2 folder could not be put back for the next path." "df -h ${TMPDIR:-/tmp}"
  cd "$1/work" || t_die "the work folder is not there." "sh tests/run.sh again"
  HOME="$1/work"
  export HOME
}

# Between session 1 and session 2. Everything but the words.
stage_pieces() {                        # <root>
  stage_from "$1" tmpl-pieces
}

# The words file made and left empty, which the code answers differently.
stage_empty_words() {                   # <root>
  stage_from "$1" tmpl-empty
}

# ---------------------------------------------------------------- the wide sweep

# sweep_typed <root>: every failure path a founder can reach by typing.
#
# The list is the one 21-recovery-lines enumerates, in the same order, so the two
# cases can be read side by side: that one proves the line is there, this one
# proves it works. Each path says what kind of line it expects. Anything left
# undeclared would be a path nobody thought about, so there is no default.
sweep_typed() {                         # <root>
  st_r=$1
  # The two values every line in this sweep has to keep whole: the folder,
  # named with all four awkward characters at once, and the founder's own name.
  rl_unwatch
  rl_watch "$st_r"
  rl_watch "Sam Carter"
  build_template "$st_r"

  # -------------------------------------------------- no folder anywhere
  # Twelve of these clear outright: once there is a folder, the command works.
  # Four cannot, because after ge init there is still nothing to restore, nothing
  # to undo, no receipt and no cached accounts. Those are declared unblocks, and
  # what is proved there is that the refusal that comes back is a different one.
  stage_empty "$st_r"; recovery clears   "$TAG check with no folder"            check
  stage_empty "$st_r"; recovery clears   "$TAG log with no folder"              log note "anything"
  stage_empty "$st_r"; recovery clears   "$TAG remember with no folder"         remember decision "anything"
  stage_empty "$st_r"; recovery clears   "$TAG person list with no folder"      person list
  stage_empty "$st_r"; recovery clears   "$TAG person add with no folder"       person add prospect sam@northfield.io "Sam Carter"
  stage_empty "$st_r"; recovery clears   "$TAG person export with no folder"    person export firstlines
  stage_empty "$st_r"; recovery clears   "$TAG ledger list with no folder"      ledger list C
  stage_empty "$st_r"; recovery clears   "$TAG ledger add with no folder"       ledger add-content 1 1 short-post text
  stage_empty "$st_r"; recovery clears   "$TAG snapshot with no folder"         snapshot memory.md
  stage_empty "$st_r"; recovery unblocks "$TAG restore with no folder"          restore memory.md
  stage_empty "$st_r"; recovery unblocks "$TAG undo with no folder"             undo
  stage_empty "$st_r"; recovery clears   "$TAG index with no folder"            index
  stage_empty "$st_r"; recovery clears   "$TAG lint with no folder"             lint
  stage_empty "$st_r"; recovery unblocks "$TAG receipt show with no folder"     receipt show
  stage_empty "$st_r"; recovery clears   "$TAG receipt set with no folder"      receipt set plugin PASS "ok"
  stage_empty "$st_r"; recovery unblocks "$TAG accounts list with no folder"    accounts list

  # -------------------------------------------------- a folder, nothing changed
  stage_fresh "$st_r";  recovery instead  "$TAG undo with nothing to undo"       undo
  # A file name after undo used to be taken, ignored, and answered by putting a
  # different file back. Staged with one write behind it, because that is the
  # founder who types this: they have been writing, and they want one file back.
  stage_folder "$st_r"
  sh "$GE" remember decision "picked b2b, my buyers are agencies" > /dev/null 2>&1 \
    || t_die "the entry that gives memory.md a backup could not be written." "sh tests/run.sh again"
  recovery instead  "$TAG undo with a file name"          undo memory.md

  # -------------------------------------------------- the verb and its flags
  stage_folder "$st_r"; recovery instead  "$TAG a verb ge does not have"          wibble
  stage_folder "$st_r"; recovery instead  "$TAG check with an argument"           check nonsense
  stage_folder "$st_r"; recovery instead  "$TAG context with an argument"         context nonsense
  stage_folder "$st_r"; recovery instead  "$TAG index with an argument"           index --strict
  stage_folder "$st_r"; recovery instead  "$TAG lint with a flag it has not"      lint --nope
  stage_folder "$st_r"; recovery instead  "$TAG lint --root with no folder"       lint --root "$st_r/nothing-here"
  stage_folder "$st_r"
  RL_FROM='<folder that holds growth-engine>'
  RL_TO=$(rl_squote "$st_r/work")
  recovery template "$TAG lint --root with no value"      lint --root

  # -------------------------------------------------- the day to day writes
  stage_folder "$st_r"; recovery instead  "$TAG log with a kind it has not"       log shout "hello"
  stage_folder "$st_r"; recovery instead  "$TAG log with no text"                 log note "   "
  stage_folder "$st_r"; recovery instead  "$TAG remember with a kind it has not"  remember feelings "hopeful"
  stage_folder "$st_r"; recovery instead  "$TAG remember amend against a miss"    remember --amend decision 1 "other" --expect "not what it says"

  # -------------------------------------------------- the ledger
  stage_folder "$st_r"; recovery instead  "$TAG ledger with a verb it has not"    ledger frobnicate
  # Three lines that name a list and ask the founder to pick from it. ge knows
  # the command that was typed but not which of the values was meant, so there is
  # no one command it could paste. Declared guidance, and held to being guidance.
  stage_folder "$st_r"; recovery guidance "$TAG ledger with a field it has not"   ledger set-content 1 vibe high
  stage_folder "$st_r"; recovery guidance "$TAG ledger with a lane it has not"    ledger set-content 1 lane carrier-pigeon
  stage_folder "$st_r"; recovery guidance "$TAG ledger with a status it has not"  ledger set-content 1 status banana
  stage_folder "$st_r"; recovery instead  "$TAG ledger approving by the back door" ledger set-content 1 status approved
  stage_folder "$st_r"; recovery instead  "$TAG ledger with a date it cannot read" ledger set-content 1 scheduled_for tomorrow
  stage_folder "$st_r"; recovery instead  "$TAG ledger with an id that is not there" ledger set-content 99 format short-post
  # Approve, typed wrongly, in a folder that has the words. Both of these hand
  # back ge ledger approve --all-text, and here that is a command that runs.
  stage_folder "$st_r"; recovery instead  "$TAG ledger approve with nothing after it" ledger approve
  stage_folder "$st_r"; recovery instead  "$TAG ledger approve with a flag it has not" ledger approve -x

  # -------------------------------------------------- the ledger, before the words
  #
  # The same refusals, in the folder a founder has between session 1 and session
  # 2: a Brain, rows in the ledger, and content-30.md not written yet. Every one
  # of these hands back a way out, and in this folder ge ledger approve is not
  # one: it refuses on the missing words. Declared settles rather than instead,
  # because two different lines would be honest here, naming the command that
  # writes the words or saying so in prose, and only ge can say which. What is
  # held is the thing both of them have to do, which is not send the founder
  # into a second refusal.
  build_stages "$st_r"
  stage_pieces "$st_r"; recovery settles "$TAG ledger approving with no words written" ledger set-content 1 status approved
  stage_pieces "$st_r"; recovery settles "$TAG ledger approve with nothing after it, no words" ledger approve
  stage_pieces "$st_r"; recovery settles "$TAG ledger approve with a flag it has not, no words" ledger approve -x
  # And the same three where the file was made and left empty, which the code
  # answers with a different sentence and has to answer with a working line.
  stage_empty_words "$st_r"; recovery settles "$TAG ledger approving with the words file empty" ledger set-content 1 status approved
  stage_empty_words "$st_r"; recovery settles "$TAG ledger approve with nothing after it, empty words" ledger approve
  stage_empty_words "$st_r"; recovery settles "$TAG ledger approve with a flag it has not, empty words" ledger approve -x
  # The rest of the sweep is back on the finished folder.
  stage_folder "$st_r"

  # -------------------------------------------------- the people
  stage_folder "$st_r"; recovery instead  "$TAG person with a verb it has not"    person frobnicate
  stage_folder "$st_r"; recovery instead  "$TAG person get someone not there"     person get nobody@nowhere.io
  stage_folder "$st_r"; recovery instead  "$TAG person note someone not there"    person note nobody@nowhere.io "text"
  # The founder's own words carried a marker. ge cannot know what they meant to
  # write instead of it, so this one is prose on purpose.
  stage_folder "$st_r"; recovery guidance "$TAG person note with a marker"        person note sam@northfield.io "x <!-- GE:NOTES:END --> y"
  stage_folder "$st_r"; recovery instead  "$TAG person note with no text"         person note sam@northfield.io ""
  stage_folder "$st_r"; recovery guidance "$TAG person note with a line break"    person note sam@northfield.io "first
second"
  stage_folder "$st_r"; recovery instead  "$TAG person touch with a bad channel"  person touch sam@northfield.io pigeon out "hello"
  stage_folder "$st_r"; recovery instead  "$TAG person touch with a bad way"      person touch sam@northfield.io email sideways "hello"
  stage_folder "$st_r"
  RL_FROM='<the right address>'; RL_TO=sam.carter@northfield.io
  recovery template "$TAG person set a field that cannot change" person set sam@northfield.io key other@example.com
  stage_folder "$st_r"
  RL_FROM='<one of those>'; RL_TO=company
  recovery template "$TAG person set a field it has not"   person set sam@northfield.io vibe high
  stage_folder "$st_r"
  RL_FROM='<one of those six>'; RL_TO=contacted_ok
  recovery template "$TAG person set a status it has not"  person set sam@northfield.io status banana
  stage_folder "$st_r"; recovery instead  "$TAG person add the same person twice" person add prospect sam@northfield.io "Sam Carter"
  stage_folder "$st_r"; recovery instead  "$TAG person add with no address"       person add prospect not-an-address "Nobody"
  stage_folder "$st_r"; recovery instead  "$TAG person add with a platform it has not" person add target myspace someone "Some One"
  # The two that read what a founder types. Given a file with one line in it,
  # because that is what the line asks them to type, and a terminal would hang.
  stage_folder "$st_r"; RL_FEED=$CASEWORK/typed-line.txt
  recovery instead  "$TAG person opener from nowhere"      person opener ig:helen.makes from-the-air
  stage_folder "$st_r"; RL_FEED=$CASEWORK/typed-line.txt
  recovery instead  "$TAG person opener from a file that is not there" person opener ig:helen.makes --file "$st_r/nothing.txt"
  stage_folder "$st_r"; recovery instead  "$TAG person remove someone not there"  person remove nobody@nowhere.io
  stage_folder "$st_r"; recovery instead  "$TAG person purge someone still live"  person purge sam@northfield.io
  stage_folder "$st_r"; recovery instead  "$TAG person purge someone not there"   person purge nobody@nowhere.io

  # -------------------------------------------------- the same person, by name
  # ge lets a founder name somebody by the name they wrote down, and most of them
  # will: sam@northfield.io is the key, "Sam Carter" is the person. Every refusal
  # that prints the name back into a command is printing two words with a space
  # between them, and a shell reads two words as two arguments. That is why the
  # same block is driven again here rather than only by the key: by the key it
  # can never go wrong, and by the name it is one space away from a second and
  # more confusing refusal.
  stage_folder "$st_r"
  RL_FROM='<the right address>'; RL_TO=sam.carter@northfield.io
  recovery template "$TAG person set a frozen field, by name"  person set "Sam Carter" key other@example.com
  stage_folder "$st_r"
  RL_FROM='<one of those>'; RL_TO=company
  recovery template "$TAG person set a field it has not, by name" person set "Sam Carter" vibe high
  stage_folder "$st_r"; recovery instead "$TAG person set created, by name"    person set "Sam Carter" created 2026-01-01
  stage_folder "$st_r"; recovery instead "$TAG person set kind, by name"       person set "Sam Carter" kind target
  stage_folder "$st_r"; recovery instead "$TAG person touch a bad channel, by name" person touch "Sam Carter" pigeon out "hello"
  stage_folder "$st_r"; recovery instead "$TAG person purge someone still live, by name" person purge "Sam Carter"

  # -------------------------------------------------- backups
  stage_folder "$st_r"; recovery instead  "$TAG snapshot with no file name"       snapshot
  stage_folder "$st_r"
  RL_FROM='<the file inside it>'; RL_TO=sam-northfield-io.md
  recovery template "$TAG snapshot of a folder"            snapshot people
  stage_folder "$st_r"; recovery instead  "$TAG snapshot outside the folder"      snapshot /etc/hosts
  stage_folder "$st_r"; recovery instead  "$TAG snapshot stepping outside"        snapshot ../memory.md
  stage_folder "$st_r"; recovery instead  "$TAG restore with no file name"        restore
  stage_folder "$st_r"; recovery clears   "$TAG restore a file with no backups"   restore memory.md
  stage_folder "$st_r"; recovery instead  "$TAG restore a stamp that is not there" restore ledger.md 20200101T000000Z

  # -------------------------------------------------- the receipt
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a verb it has not"   receipt fetch
  stage_folder "$st_r"; recovery guidance "$TAG receipt show with no receipt"     receipt show
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a result it has not" receipt set plugin MAYBE "half working"
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a name that is not one word" receipt set "two words" PASS "ok"
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a check and no result" receipt set plugin
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a date in words"     receipt set pit-created "last tuesday"
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a day that is not one" receipt set pit-created 2026-13-40
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a day not on the calendar" receipt set pit-created 2026-02-30
  stage_folder "$st_r"; recovery instead  "$TAG receipt with a day in the future" receipt set pit-created 2030-01-01
  # The founder wrote a token where a description belongs. ge cannot know what
  # they would have said instead, so this one is prose on purpose.
  stage_folder "$st_r"; recovery guidance "$TAG receipt carrying a token"         receipt set ghl PASS "pit-abc123def"

  # -------------------------------------------------- the accounts
  stage_folder "$st_r"; recovery instead  "$TAG accounts with a verb it has not"  accounts refresh
  stage_folder "$st_r"; recovery guidance "$TAG accounts list with nothing cached" accounts list

  printf 'just one field\n' > "$CASEWORK/badrow.txt" || t_die "the bad row file could not be made." "chmod u+w $CASEWORK"
  printf 'pit-abc123|facebook|Lumen Skin\n' > "$CASEWORK/tokenrow.txt" || t_die "the token row file could not be made." "chmod u+w $CASEWORK"
  true > "$CASEWORK/norows.txt" || t_die "the empty file could not be made." "chmod u+w $CASEWORK"
  printf 'a line\n<!-- GE:OPENER:END -->\n' > "$CASEWORK/markeropener.txt" || t_die "the marker file could not be made." "chmod u+w $CASEWORK"

  stage_folder "$st_r"; RL_IN=$CASEWORK/badrow.txt
  recovery instead  "$TAG accounts set with a row it cannot read" accounts set
  stage_folder "$st_r"; RL_IN=$CASEWORK/tokenrow.txt
  recovery instead  "$TAG accounts set carrying a token"   accounts set
  stage_folder "$st_r"; RL_IN=$CASEWORK/norows.txt
  recovery instead  "$TAG accounts set with nothing piped in" accounts set
  stage_folder "$st_r"; RL_IN=$CASEWORK/markeropener.txt; RL_FEED=$CASEWORK/typed-line.txt
  recovery instead  "$TAG person opener piped in with a marker" person opener ig:helen.makes -

  # -------------------------------------------------- the half marked file
  # A founder deletes a line they do not understand. Every write to that file
  # afterwards has to refuse and say what to put back.
  #
  # WHY THIS IS GUIDANCE AND NOT A CLEARS. It was declared clears, on the reading
  # that a founder should be able to paste their way out of everything. That
  # reading does not survive this state. The START marker is in the file and the
  # END is gone, so where the founder's section stops is the one thing ge cannot
  # work out. Putting the END back at the bottom would swallow whatever they
  # wrote underneath into a block ge rewrites, and that is their own writing.
  # lib/blocks.sh says exactly this in its own header and prints a bare arrow for
  # all five damaged shapes. A command here could only be a guess at where
  # somebody's writing ends, so the honest line is the bare arrow, and the
  # guidance branch below still holds it to being prose rather than a command
  # nobody ran.
  stage_folder "$st_r"
  awk '!/GE:WORKED:END/' growth-engine/memory.md > "$CASEWORK/damaged" \
    || t_die "the damaged memory.md could not be prepared." "sh tests/run.sh again"
  cp "$CASEWORK/damaged" growth-engine/memory.md \
    || t_die "the damaged memory.md could not be put in place." "sh tests/run.sh again"
  recovery guidance "$TAG remember into a half marked file" remember worked "the short posts got replies"
}

# ---------------------------------------------------------------- the narrow sweep

# sweep_paths <root>: the refusals that print a founder's own path.
#
# These are the ones an awkward folder name can break, and the reason this case
# runs them once per awkward character rather than only in the folder that
# carries all four: when the wide sweep goes red, this says which character did
# it. Six of the seven are a clears, because six of them are a real fault in the
# world with a command that ends it: a sync client holding the folder, a file
# that cannot be read, a second folder. The seventh is the marker line a founder
# deleted by hand, and that one is guidance for the reason written where it is
# driven. Whichever it is, the line names their folder, so every one of the seven
# proves the same thing about the awkward character in the name.
sweep_paths() {                         # <root>
  sp_r=$1
  rl_unwatch
  rl_watch "$sp_r"
  build_template "$sp_r"
  sp_g="$sp_r/work/growth-engine"

  # A sync client has the people folder for a moment.
  stage_folder "$sp_r"; chmod a-w "$sp_g/people" || t_die "the people folder could not be made read only." "sh tests/run.sh again"
  recovery clears "$TAG person note into a read only people folder" person note sam@northfield.io "they replied on LinkedIn"
  chmod -R u+rwX "$sp_r/work" 2>/dev/null

  stage_folder "$sp_r"; chmod a-w "$sp_g/people" || t_die "the people folder could not be made read only." "sh tests/run.sh again"
  recovery clears "$TAG person add into a read only people folder" person add prospect kit@brightops.co.uk "Kit Alvarez"
  chmod -R u+rwX "$sp_r/work" 2>/dev/null

  stage_folder "$sp_r"; chmod a-w "$sp_g" || t_die "the folder could not be made read only." "sh tests/run.sh again"
  recovery clears "$TAG log into a read only folder"      log note "day one, picked the b2b track"
  chmod -R u+rwX "$sp_r/work" 2>/dev/null

  stage_folder "$sp_r"; chmod a-r "$sp_g/memory.md" || t_die "memory.md could not be made unreadable." "sh tests/run.sh again"
  recovery clears "$TAG remember into a file it cannot read" remember decision "picked b2b, my buyers are agencies"
  chmod -R u+rwX "$sp_r/work" 2>/dev/null

  # Two folders. The one refusal every verb prints, and the only fix that is
  # true every time: move one aside.
  stage_folder "$sp_r"
  rm -rf "$sp_r/growth-engine"
  cp -Rp "$sp_g" "$sp_r/growth-engine" || t_die "the second folder could not be made." "df -h ${TMPDIR:-/tmp}"
  printf '%s\n' "$sp_r/growth-engine" > "$sp_r/growth-engine/.state/HOME" \
    || t_die "the second folder's anchor could not be written." "chmod u+w $sp_r"
  recovery clears "$TAG log with two folders"             log note "day one, picked the b2b track"
  rm -rf "$sp_r/growth-engine"

  # ge init where there is already a folder above.
  stage_folder "$sp_r"
  mkdir -p "$sp_r/work/sub" || t_die "the folder below the work folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cd "$sp_r/work/sub" || t_die "the folder below the work folder is not there." "sh tests/run.sh again"
  HOME="$sp_r/work/sub"
  export HOME
  recovery clears "$TAG init below a folder that already exists" init
  cd "$sp_r" || t_die "the sandbox root is not there." "sh tests/run.sh again"

  # The marker line a founder deleted. Guidance for the reason set out where the
  # wide sweep drives it: only the founder knows where their own section stops.
  # It is still driven here, once per awkward character, because the line names
  # their file and rl_quoted reads a bare arrow exactly as it reads a run one, so
  # this sweep still proves the path comes back in one piece.
  stage_folder "$sp_r"
  awk '!/GE:WORKED:END/' growth-engine/memory.md > "$CASEWORK/damaged" \
    || t_die "the damaged memory.md could not be prepared." "sh tests/run.sh again"
  cp "$CASEWORK/damaged" growth-engine/memory.md \
    || t_die "the damaged memory.md could not be put in place." "sh tests/run.sh again"
  recovery guidance "$TAG remember into a half marked file" remember worked "the short posts got replies"
}

# ---------------------------------------------------------------- the sandboxes

# Two machines take the write bit off and still write: a run as root, and a
# filesystem that does not carry one, which is what a Windows drive under Git
# Bash does. On either of those the read only paths below are not being tested at
# all, and saying so is the only honest answer. A suite that goes green on checks
# it never ran is worth less than no suite, because people believe it.
PROBE="$SANDBOX/probe"
mkdir -p "$PROBE" || t_die "the folder that checks this machine could not be made." "df -h ${TMPDIR:-/tmp}"
chmod a-w "$PROBE" || t_die "the write bit could not be taken off a folder." "sh tests/run.sh again"
if { true > "$PROBE/.ge-test-probe"; } 2>/dev/null; then
  rm -f "$PROBE/.ge-test-probe"
  chmod u+w "$PROBE"
  t_die "this machine still writes into a folder with the write bit off, so the read only paths here cannot be proved on it." \
        "sh tests/run.sh as your own user, on a drive that carries permissions"
fi
chmod u+w "$PROBE" || t_die "the write bit could not be put back." "chmod u+w $PROBE"

# One character each, so a red line says which one broke it. A backslash is built
# from a variable rather than typed with an escape, so one backslash is what
# reaches the filesystem under every shell that reads this file.
BS='\'
TAG='space:'      ; sweep_paths "$SANDBOX/founder space"
TAG='apostrophe:' ; sweep_paths "$SANDBOX/o'brien"
TAG='bracket:'    ; sweep_paths "$SANDBOX/bracket[1]"
TAG='backslash:'  ; sweep_paths "$SANDBOX/back${BS}slash"

# And all four at once, for the whole enumeration. A folder named after a
# business carries a space, and the other three are one keystroke away from it.
WIDE="$SANDBOX/Sam's [big] back${BS}slash file"
TAG='all four:'
sweep_typed "$WIDE"

cd "$SANDBOX" || t_die "the sandbox is not there." "sh tests/run.sh again"
chmod -R u+rwX "$SANDBOX" 2>/dev/null

# ---------------------------------------------------------------- what was driven

# The two counts. Without them a change that stopped any of these failing, or
# stopped any of them being proved, would leave this case passing on whatever was
# left. The wide sweep drives 93 paths and the narrow one 7, four times over.
[ "$DRIVEN" -ge 110 ] && t_pass || \
  t_fail "the sweep drove only $DRIVEN failure paths, and it is meant to drive at least 110"
# Forty of these are proved all the way through: the line ran, and the command
# that failed was run again and worked. Forty one are declared clears or
# unblocks today, seventeen in the wide sweep and six in each of the four narrow
# ones. That number can only go up as the lines that do not run yet are repaired,
# so it is a floor and never a target, and it is never lowered to reach green:
# a fall means a path stopped being proved and somebody has to say why.
[ "$CLEARED" -ge 40 ] && t_pass || \
  t_fail "only $CLEARED recovery lines were proved to clear the thing they were printed for, and it is meant to be at least 40"

# Everything after the arrow is what a founder selects and pastes. A line that
# carries an English clause after the command is a line that runs something else
# when it is pasted whole: ge init, if this is the folder becomes a command called
# "init," and ge answers that it has no such thing. Counted once, listed in full,
# because thirty of these are one decision and not thirty. Only run lines reach
# here: guidance is English on purpose and is held to its own shape above.
RIDING=0
[ -f "$CASEWORK/riding.labels" ] && RIDING=$(grep -c . "$CASEWORK/riding.labels")
if [ "$RIDING" -eq 0 ]; then
  t_pass
else
  t_note "recovery lines carrying more than the command a founder pastes"
  cat "$CASEWORK/riding" >> "$CASEWORK/diff.txt"
  t_fail "$RIDING recovery lines carry English after the command, so pasting the line runs something else"
fi

# The prose lines, written out whether or not anything failed, so the next reader
# can see which paths this case decided ge could not give a command for. An empty
# list is said in words rather than left as a blank heading, because a blank one
# reads as "this case declares none" and that would be the wrong thing to take
# away: it means none of them got this far.
t_note "the lines this case declares are prose, and holds to being prose"
if [ -s "$CASEWORK/prose" ]; then
  cat "$CASEWORK/prose" >> "$CASEWORK/diff.txt"
else
  printf 'None reached this check. Every path declared guidance stopped at an\n' >> "$CASEWORK/diff.txt"
  printf 'earlier one, listed above, so what those lines say has not been read yet.\n' >> "$CASEWORK/diff.txt"
fi

t_done
