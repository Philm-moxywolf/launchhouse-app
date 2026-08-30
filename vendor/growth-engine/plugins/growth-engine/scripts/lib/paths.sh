#!/bin/sh
# paths.sh: finds the founder's growth-engine folder, reports where it is
# anchored, and settles whether ge may put a new file in place of one inside it.
#
# WHY IT EXISTS: founders open Claude in a different folder each time, so work
#                scatters and later skills cannot find the Brain. This is the
#                single most common failure in the programme, and the walk here
#                is deliberately wider than the obvious one because the common
#                real case is a folder built on the Desktop and Claude opened
#                somewhere else entirely.
# CALLED BY:     ge.sh and every subcommand that touches a founder file
# READS:         growth-engine/.state/HOME        WRITES: nothing of a founder's.
#                ge_keep_mode sets the permissions of a file ge itself built, on
#                its way into place, and that is the only write in the file.
# POSTURE:       fail-closed. If more than one folder is found it refuses and
#                names them all, because picking one silently is how a founder
#                loses a week of work into a folder nobody looks in again.
#                That refusal and its twin, for no folder at all, are both
#                written here, so thirteen verbs cannot drift into saying
#                thirteen different things about the same state.
#                No message here says a folder is not there without having
#                looked for it under that name as well as under its anchor.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. No readlink -f, which BSD lacks.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHAT "→ run:" PROMISES, AND WHAT THE BARE ARROW SAYS INSTEAD
#
# Everything after "→ run: " is the command. A founder selects the whole line
# and pastes it, so nothing else may sit on it: no comma, no "then ...", no
# "which ...", no explanation. Anything they need to know goes on its own line
# above, where a sentence belongs. Every path inside the command goes through
# ge_quote, and running it has to leave the thing ge refused about gone. Where
# clearing it takes two steps, both are on the one line, joined with &&: a
# chmod that hands the permission back and then leaves the founder reading a
# second refusal is half a way out, and half a way out is what makes somebody
# stop reading them.
#
# Three states in this file have no command ge can stand behind: more than one
# folder where every -old name beside them is taken, a thing in the way of the
# anchor whose -old name is taken too, and a thing wearing a founder file's name
# whose -old name is taken as well. Those get "→ " and an instruction, with no
# "run:", so the pasteable form means pasteable every single time. Three marked
# exceptions, and never a fake command in the slot a founder trusts.
set -u

# The mark a Windows editor writes at the very start of a file it saves as
# UTF-8. Notepad adds it, PowerShell redirection adds it, and it is invisible in
# every editor, so a founder can neither see it nor delete it. Left in place it
# made .state/HOME read as a different path from the identical one on screen,
# and the doctor printed the same path twice and called them different. Built
# from octal escapes so this file stays plain ASCII on the way to GitHub.
GE_BOM=$(printf '\357\273\277')

# THE PIN. GE_HOME names the folder, so the search never runs.
#
# WHY IT EXISTS: everything below this line walks. It reads the folder ge was
# started in, every folder above it, and four folders under the home folder.
# With one person on one laptop that walk is the right answer, and it is why
# this file is as long as it is: a founder opens Claude somewhere else every
# time and the folder still has to be found.
#
# Somewhere else, that same walk is a boundary that can be stepped over. Put two
# founders' folders on one machine and a walk that goes up far enough reaches
# the other one, because nothing in the walk can tell whose folder it just
# found. It never had to: on a laptop there was only ever one person to be.
#
# So the caller may say instead, and when it does, its answer is the whole
# answer. GE_HOME is the folder. No walk runs: not the one that finds it, not
# the one that describes what the finding walked past, and not ge init's choice
# of where to build. A boundary the caller states once holds wherever the
# process happens to be standing, and a boundary read off the working directory
# does not.
#
# THE PIN IS READ ONCE, HERE. Every verb loads this file, so a pin worked out
# again inside each of them is a pin that can be worked out differently in one
# of them, and the one is the one that costs a founder somebody else's data.
#
# WHAT IS REFUSED, AND WHY REFUSING BEATS REPAIRING. A pin that is relative is
# read against the working directory, which is the thing the pin exists to stop
# mattering. A pin with a .. in it walks upward by another name. Neither is
# repaired here, because a repaired pin is a guess at which folder was meant,
# and the whole point of a pin is that ge does no guessing about that. GE_PIN
# stays empty and GE_PIN_BAD is set, and ge.sh refuses every verb that touches
# a folder before any of them starts.
GE_CR=$(printf '\015')
GE_PIN=''
GE_PIN_BAD=''
if [ -n "${GE_HOME:-}" ]; then
  GE_PIN=${GE_HOME%"$GE_CR"}
  GE_PIN=${GE_PIN#"$GE_BOM"}
  # Trailing slashes off, so the pin compares equal to the same folder named
  # without them. .state/HOME holds a path with no trailing slash, and
  # ge_same_dir compares strings before it compares folders.
  while :; do
    case $GE_PIN in
      */) GE_PIN=${GE_PIN%/} ;;
      *)  break ;;
    esac
  done
  case $GE_PIN in
    '' | /*) ;;
    *) GE_PIN_BAD=relative ;;
  esac
  [ -n "$GE_PIN" ] || GE_PIN_BAD=relative
  # Every shape of a .. component, and not the substring, because a folder may
  # honestly be called "..of mine" and refusing that would be ge refusing a
  # name a founder is allowed to have.
  case $GE_PIN in
    ..|../*|*/..|*/../*) GE_PIN_BAD=upward ;;
  esac
  [ -z "$GE_PIN_BAD" ] || GE_PIN=''
fi

# The one refusal for a pin ge cannot use. Printed on standard output, and the
# caller sends it to standard error, which is the rule every other refusal in
# this file follows.
#
# There is no "run:" here, and that is deliberate. The three other places in
# this file with a bare arrow are the states where ge has no command it can
# stand behind, and this is a fourth: nothing a founder types changes what the
# thing that started ge told it. A fake command in the slot a founder trusts is
# worse than no command, because they paste it and are answered by a second
# refusal about a command that does not exist.
#
# The variable is not named and neither is the path. A founder reading this has
# no use for either, and the sentence still says exactly which knob is wrong to
# anybody who set one.
ge_pin_refusal() {
  printf 'FAIL  the folder ge was told to work in cannot be used, so ge did nothing.\n'
  if [ "$GE_PIN_BAD" = upward ]; then
    printf '      It reaches upward out of itself, and ge will not follow that.\n'
  else
    printf '      It has to be a full path, starting at the top of the disk.\n'
  fi
  printf '      Nothing of yours was read, changed or deleted.\n'
  printf '      → Tell whoever set this up. Nothing typed here changes it.\n'
}

# ge_abs <dir>: absolute path without readlink -f, which is GNU-only.
ge_abs() {
  ( CDPATH= cd -- "$1" 2>/dev/null && pwd ) || return 1
}

# ge_real <dir>: the same folder with every shortcut on the way resolved.
#
# Only ever used to answer "are these two names the same folder". A Mac reaches
# /tmp/x as /private/tmp/x, and a founder who works through an alias or a mapped
# drive reaches one folder by two names. Comparing the names alone said the
# folder had moved when it had not, and the fix offered for that could not fix
# anything, because there was nothing wrong.
ge_real() {
  ( CDPATH= cd -P -- "$1" 2>/dev/null && pwd -P ) || return 1
}

# ge_same_dir <a> <b>: true when both names lead to one folder.
ge_same_dir() {
  [ "$1" = "$2" ] && return 0
  gs_a=$(ge_real "$1") || return 1
  gs_b=$(ge_real "$2") || return 1
  [ "$gs_a" = "$gs_b" ]
}

# ge_quote <path>: the path in a form a founder can paste straight into a
# command. Half the folders in this programme are named after a business, so
# they carry a space, and an unquoted path with a space in it splits into two
# arguments and the command fails. A recovery line that fails is worse than none.
ge_quote() {
  case $1 in
    *[!A-Za-z0-9/._-]*)
      printf "'%s'\n" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")" ;;
    *)
      printf '%s\n' "$1" ;;
  esac
}

# ge_here: the folder the founder is standing in, or a failure.
#
# WHY IT IS NOT JUST pwd: a founder can be standing in a folder they cannot read,
# which is what a sync client mid-conflict and a restrictive ACL both produce.
# pwd then fails and prints the shell's own words about getcwd, and the empty
# answer that came back was being used as a path. "$empty/growth-engine" is
# "/growth-engine", so ge named the root of the disk as the folder it wanted to
# write in, and the way out it printed was "chmod u+w /". That is a command that
# would change the permissions on the root of a founder's disk, offered for a
# problem in a folder somewhere under their home.
#
# Every caller must treat a failure here as a refusal, never as a default.
ge_here() {
  ge_here_d=$(pwd 2>/dev/null) || return 1
  [ -n "$ge_here_d" ] || return 1
  printf '%s' "$ge_here_d"
}

# ge_nowhere_refusal: the one answer to standing in a folder ge cannot name.
# There is no chmod, because naming the folder is the thing that failed, so the
# way out is to stand somewhere readable. cd is a shell built-in and runs when
# pasted; the home folder is the one place every founder is certain to have.
ge_nowhere_refusal() {
  printf 'FAIL  ge cannot tell which folder you are in, so it did nothing.\n'
  printf '      The folder you are standing in cannot be read, which usually means a\n'
  printf '      sync client is partway through something, or its permissions changed.\n'
  printf '      Move somewhere ge can read, then run your command again.\n'
  printf '      → run: cd ~\n'
}

# ge_candidates_here: the folder the founder is standing in, and every folder
# above it. This is the answer whenever there is one, because it is the only
# part of the walk the founder controls by moving.
ge_candidates_here() {
  ge_d=$(ge_here) || return 1
  while [ -n "$ge_d" ] && [ "$ge_d" != / ]; do
    printf '%s\n' "$ge_d"
    ge_d=$(dirname -- "$ge_d")
  done
  printf '%s\n' /
}

# ge_candidates_home: the three folders a founder builds things in when they are
# not thinking about where they are. Searched only when the walk above found
# nothing, because that is the case they are for: the folder is on the Desktop
# and Claude was opened somewhere else entirely.
#
# They used to be searched every time, alongside the walk above. That turned a
# question with one answer into a refusal: a founder standing in the folder they
# meant was told there was more than one and to move to the folder they were
# already in. Searching them second means moving into a folder is what settles it.
ge_candidates_home() {
  [ -n "${HOME:-}" ] || return 0
  printf '%s\n' "$HOME" "$HOME/Desktop" "$HOME/Documents" "$HOME/Downloads"
}

# ge_scan <newline separated folders>: adds every growth-engine folder found
# under them to ge_found, and counts them in ge_count.
ge_scan() {
  # A folder path can contain a space, and on a founder machine it usually does:
  # "My Business", "OneDrive - Acme", "C:\Users\Jane Smith" under Git Bash. The
  # walk below used the default IFS, which cut such a path into pieces that do
  # not exist, so every command except ge init reported no folder at all. ge init
  # takes pwd directly and so kept succeeding, which left the founder in a loop
  # with no way out. Word splitting is pinned to the newline the candidates are
  # printed with, pathname expansion is turned off so a folder named with * or ?
  # is not rewritten, and both are put back exactly as they were found.
  ge_ifs_save=$IFS
  ge_noglob=''
  case $- in *f*) ge_noglob=1 ;; esac
  set -f
  IFS='
'
  for ge_c in $1; do
    [ -n "$ge_c" ] || continue
    [ -f "$ge_c/growth-engine/.state/HOME" ] || continue
    ge_abs_c=$(ge_abs "$ge_c/growth-engine") || continue
    # De-duplicate: the home folders can repeat a parent already walked.
    #
    # Both ends of the name are pinned with a newline. Without the closing one
    # this asked whether the name appeared anywhere in the list, and a folder
    # inside a folder answers yes: growth-engine is the front of
    # growth-engine/growth-engine. The real folder was dropped as a repeat of
    # the one nested inside it, so ge saw one where there were two, refused
    # nothing, and wrote every entry into the empty inner folder.
    case "
$ge_found" in
      *"
$ge_abs_c
"*) continue ;;
    esac
    ge_found="$ge_found$ge_abs_c
"
    ge_count=$((ge_count + 1))
  done
  IFS=$ge_ifs_save
  [ -n "$ge_noglob" ] || set +f
}

# ge_find_home: prints the absolute path of the growth-engine folder, or fails.
# Prints every match when there is more than one, so the caller can refuse.
# Nearest to the founder first, which is the order the refusal reads them in.
ge_find_home() {
  ge_found=''
  ge_count=0
  # THE PIN, ASKED FIRST AND ANSWERED WHOLE. Nothing below this branch runs when
  # a pin is set, which is what makes the pin a boundary rather than a
  # preference. The anchor file is still required, and it is required for the
  # same reason it is required of a folder found by walking: a folder with no
  # anchor in it is not one ge made, and ge init is what turns one into one.
  # Two answers here and never three, because a pin names one folder and one
  # folder cannot be scattered.
  if [ -n "$GE_PIN" ]; then
    [ -f "$GE_PIN/.state/HOME" ] || return 1
    ge_found="$GE_PIN
"
    ge_count=1
    printf '%s' "$ge_found"
    return 0
  fi
  ge_scan "$(ge_candidates_here)"
  [ "$ge_count" -eq 0 ] && ge_scan "$(ge_candidates_home)"
  [ "$ge_count" -gt 0 ] || return 1
  printf '%s' "$ge_found"
  [ "$ge_count" -eq 1 ] || return 2
}

# ge_al_scan <newline separated folders>: adds every folder actually called
# growth-engine that ge_scan walked past to ge_al_found, and counts them in
# ge_al_count. Repairs nothing. It exists only so the refusal below can describe
# what is on the disk instead of guessing.
#
# WHY IT EXISTS: ge_scan tests for the anchor file INSIDE the folder, so a folder
# whose anchor a sync client or a tidy up removed is invisible to all thirteen
# verbs. The founder is looking at growth-engine in Finder with their prospects
# inside it, and was told ge had looked everywhere, found none, and that theirs
# must be somewhere ge does not look. Every part of that is false, and it is the
# one sentence most likely to make somebody build the second folder that the
# refusal above exists to stop.
#
# Not folded into ge_scan. ge_scan answers the question all thirteen verbs act
# on, and one wrong branch in it writes a founder's work into the wrong folder,
# so it keeps one test and one meaning. The IFS and glob discipline below is the
# same as ge_scan's, and it is the same for the same reasons.
ge_al_scan() {                          # <newline separated folders>
  ge_al_ifs=$IFS
  ge_al_noglob=''
  case $- in *f*) ge_al_noglob=1 ;; esac
  set -f
  IFS='
'
  for ge_al_c in $1; do
    [ -n "$ge_al_c" ] || continue
    [ -d "$ge_al_c/growth-engine" ] || continue
    # Anchored folders are ge_scan's business. The same test, written the same
    # way, so the two can never disagree about which folder belongs to which.
    [ -f "$ge_al_c/growth-engine/.state/HOME" ] && continue
    # The parent is the one resolved, never the folder itself. A folder a founder
    # has no permission to enter is one of the states this has to be able to
    # name, and cd into that one fails and drops it back out of sight.
    ge_al_p=$(ge_abs "$ge_al_c") || continue
    case $ge_al_p in
      /) ge_al_abs=/growth-engine ;;
      *) ge_al_abs=$ge_al_p/growth-engine ;;
    esac
    # De-duplicate, pinned at both ends with a newline, for the reason set out
    # in ge_scan: without the closing one a folder inside a folder of the same
    # name reads as a repeat of the one nested in it.
    case "
$ge_al_found" in
      *"
$ge_al_abs
"*) continue ;;
    esac
    ge_al_found="$ge_al_found$ge_al_abs
"
    ge_al_count=$((ge_al_count + 1))
  done
  IFS=$ge_al_ifs
  [ -n "$ge_al_noglob" ] || set +f
}

# ge_al_find: every folder called growth-engine that ge_find_home walked past,
# nearest to the founder first.
#
# It walks the same candidates as ge_find_home, in the same order, so nothing
# built from it can describe a wider search than the one that ran. Both groups
# every time, and that matches: this is only ever asked after ge_find_home found
# nothing at all, which is exactly when it went on to read the home group too.
ge_al_find() {
  ge_al_found=''
  ge_al_count=0
  # The pin again, and for the same reason. This is only ever asked after
  # ge_find_home found nothing, so under a pin the question is narrower and has
  # one candidate: is the pinned folder there, without the anchor inside it.
  # Walking here would describe a search that did not happen and would name
  # folders the pin exists to keep ge out of.
  if [ -n "$GE_PIN" ]; then
    [ -d "$GE_PIN" ] || return 0
    [ -f "$GE_PIN/.state/HOME" ] && return 0
    ge_al_found="$GE_PIN
"
    ge_al_count=1
    return 0
  fi
  ge_al_scan "$(ge_candidates_here)"
  ge_al_scan "$(ge_candidates_home)"
}

# ge_al_reason <the growth-engine folder>: why ge walked past it. Sets GE_AL_WHY,
# and GE_AL_PATH to the thing a command in the message has to act on.
#
# WHY IT IS NOT ONE ANSWER: a check may not claim more than it examined. "The
# file is missing" is only true when ge could get at the place that file belongs
# and saw nothing there. A folder ge is not allowed to open gives ge the same
# silence for a different reason, and ge init cannot clear that one, so a message
# saying the file is missing would hand the founder a command that does nothing
# and leave them with no idea why.
#
#   missing  nothing at all is where the anchor belongs, and ge could see that
#            for itself. ge init writes the anchor back and keeps every file.
#   shut     a folder in the way cannot be entered, read or written, so ge cannot
#            say what is in it. One chmod hands it back.
#   blocked  something is where the anchor belongs and it is not an ordinary
#            file, so ge cannot read a path out of it and ge init cannot write
#            over it either. Moving it aside is the way through.
GE_AL_WHY=''
GE_AL_PATH=''
ge_al_reason() {                        # <the growth-engine folder>
  GE_AL_WHY=missing
  GE_AL_PATH=$1
  # All three bits at once, because ge has to enter the folder, read it, and
  # write the anchor into it, and one chmod hands back whichever is missing.
  if ! { [ -r "$1" ] && [ -w "$1" ] && [ -x "$1" ]; }; then
    GE_AL_WHY=shut
    return 0
  fi
  # No .state at all is the ordinary shape of this fault. ge init makes the
  # folder and writes the anchor into it, so there is nothing else to say.
  [ -e "$1/.state" ] || [ -h "$1/.state" ] || return 0
  if [ ! -d "$1/.state" ]; then
    GE_AL_WHY=blocked
    GE_AL_PATH=$1/.state
    return 0
  fi
  if ! { [ -r "$1/.state" ] && [ -w "$1/.state" ] && [ -x "$1/.state" ]; }; then
    GE_AL_WHY=shut
    GE_AL_PATH=$1/.state
    return 0
  fi
  # ge_al_scan has already established there is no ordinary file here. So
  # anything still answering to the name is something else wearing it: a folder,
  # or a shortcut pointing at something that is not there any more. -h as well
  # as -e, because a shortcut to a missing file answers to neither on its own.
  if [ -e "$1/.state/HOME" ] || [ -h "$1/.state/HOME" ]; then
    GE_AL_WHY=blocked
    GE_AL_PATH=$1/.state/HOME
  fi
}

# ge_scatter_refusal <the list ge_find_home printed>: the one refusal every verb
# prints when there is more than one folder. Written here rather than in each
# command so all of them say the same thing.
#
# It names moving a folder aside, and nothing else, because that is the only
# action that is true every time. Moving to another folder clears it when the
# extra folder is on a Desktop, and does nothing at all when one folder sits
# inside the other, and a founder who has been handed the wrong one of those
# twice stops reading. Nothing is deleted, so a founder who moves the wrong one
# moves it back. Which one it offers to move is its own business, and the body
# says to keep the one the work is in, so the founder is never being told this is
# the one to lose.
#
# TWO THINGS IT USED TO GET WRONG, BOTH IN THE SAME DIRECTION.
#
# It said "add -old to the name of the other" over a list of three. ge had
# established that there was more than one, never that there were two. The
# founder ran the line they were given, got the same refusal back, and had been
# told a single rename would settle it.
#
# And the rename was offered whether or not the name it landed on was free. With
# a growth-engine-old already beside it, which is what a founder who has been
# here once before has, mv does not refuse: on a Mac it puts the folder INSIDE
# growth-engine-old. That folder is not a place ge looks, so the work went out of
# sight, in the one refusal written to stop exactly that. So the folder offered
# is the first whose -old name is free and whose parent ge can write to, and if
# there is no such folder ge says so rather than naming a move that buries one.
#
# Prints on standard output. The caller sends it to standard error, or not, so
# the session hook can keep saying everything on one stream.
ge_scatter_refusal() {                  # <list> [one extra sentence]
  # Same IFS and glob discipline as ge_scan, and for the same reasons: these are
  # founder folders, so one of them has a space in its name, and one named with
  # a * or a ? must not be rewritten on the way through.
  ge_sc_move=''
  ge_sc_ifs=$IFS
  ge_sc_noglob=''
  case $- in *f*) ge_sc_noglob=1 ;; esac
  set -f
  IFS='
'
  for ge_sc_p in $1; do
    [ -n "$ge_sc_p" ] || continue
    # -h as well as -e, because a shortcut pointing at something that is gone
    # answers to neither on its own, and mv onto it follows it.
    if [ -e "$ge_sc_p-old" ] || [ -h "$ge_sc_p-old" ]; then continue; fi
    # The folder is renamed inside its parent, so the parent is what has to be
    # writable. Without this the line handed over prints the system's own
    # complaint at a founder and moves nothing.
    ge_sc_dir=$(dirname -- "$ge_sc_p") || continue
    [ -w "$ge_sc_dir" ] || continue
    ge_sc_move=$ge_sc_p
    break
  done
  IFS=$ge_sc_ifs
  [ -n "$ge_sc_noglob" ] || set +f

  printf 'FAIL  there is more than one growth-engine folder, so ge cannot tell which one is yours:\n'
  printf '%s\n' "$1" | sed '/^$/d; s/^/        /'
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
  printf '      Open them and keep the one your work is in.\n'
  # "every other one" rather than "the other", because ge counted more than one
  # and never counted two. It reads the same to a founder looking at two.
  printf '      Add -old to the name of every other one. ge will use the one that is left.\n'
  printf '      Nothing is deleted by this, so you can put the name back.\n'
  if [ -n "$ge_sc_move" ]; then
    printf '      → run: mv %s %s\n' "$(ge_quote "$ge_sc_move")" "$(ge_quote "$ge_sc_move-old")"
  else
    # DELIBERATE: guidance, not a command. ge will not invent a third name for
    # the founder to keep track of, and it will not name a move that buries one
    # folder inside another. Both reasons the loop above rejects a folder are
    # said, and not just the likelier one, because ge knows one of the two is
    # true here and not which.
    #
    # The arrow is there and the word run is not, which is the whole difference:
    # "→ run:" means select this line and paste it, every time, and a sentence
    # in that slot teaches a founder to stop trusting the ones that are commands.
    printf '      ge has no rename to offer: beside each of them the -old name is taken,\n'
    printf '      or the folder it sits in cannot be written to.\n'
    printf '      → Give the one you are moving aside any other name, then run this again.\n'
  fi
}

# ge_nofolder_refusal <fail|plain> [one extra sentence]: the twin of the refusal
# above, for the other answer ge_find_home gives, which is no folder anywhere.
# Written here rather than in each command so all of them say the same thing.
#
# What each of them said before was wrong, and wrong in the direction that does
# damage. Seven of them said the folder was not found "here or above here", and
# ge_find_home also reads the home folder, the Desktop, Documents and Downloads.
# A founder whose folder is on the Desktop read that ge had never looked there,
# believed they had none, ran ge init, and made the second folder that the
# refusal above exists to stop. So the search is described in full, and the
# founder who already has a folder is sent to it before ge init is offered.
#
# The recovery line is the one place ge init can be named. Creating a folder is
# the right answer only for a founder who has none, so that condition is said in
# the body, on its own line, where a sentence belongs. It used to ride on the
# recovery line itself, and a line a founder cannot paste is not a way out.
#
# AND IT WAS STILL WRONG, IN THE SAME DIRECTION. It said no folder was found
# over a growth-engine folder sitting in plain sight, because ge_scan tests for
# the anchor file inside the folder and not for the folder. A founder whose
# anchor a sync client or a tidy up had removed was looking at growth-engine in
# Finder with their prospects inside it, and read that ge had searched
# everywhere, found nothing, and that theirs must be somewhere ge does not look.
# So the folder is looked for under its own name as well, and where one is found
# it is named, and what is actually wrong with it is said instead. ge init does
# repair that folder in place and keeps every file in it, so the outcome was
# always right and only the sentence was false.
#
# Two ways of reading it, because the same fact is a refusal for twelve verbs
# and an ordinary answer for ge context. A founder who has not run ge init yet
# has no folder, and ge context is what a session hook runs before they have
# typed anything, so a FAIL banner there would open the first session of the
# programme with a failure that is not one.
#
# Prints on standard output. The caller sends it to standard error, or not, so
# the session hook can keep saying everything on one stream.
ge_nofolder_refusal() {                 # <fail|plain> [one extra sentence]
  case ${1:-} in
    plain) ge_nf_pad='' ;;
    *)     ge_nf_pad='      ' ;;
  esac

  # Asked before a word is said, because the answer decides what is true. A
  # folder ge_scan walked past is still a folder, and it is usually the one the
  # founder is looking at while they read this.
  ge_al_find
  if [ "$ge_al_count" -gt 0 ]; then
    ge_nf_anchorless "${2:-}"
    return 0
  fi

  # One sentence, printed two ways, so the opening word is the only thing that
  # can ever differ between the twelve refusals and ge context's answer.
  ge_nf_said='growth-engine folder was found.'
  case ${1:-} in
    plain) printf 'No %s\n' "$ge_nf_said" ;;
    *)     printf 'FAIL  no %s\n' "$ge_nf_said" ;;
  esac
  # The home folders are named only while there is a HOME to name them from.
  # ge_candidates_home returns nothing without one, so saying they were searched
  # would be describing a search that did not happen. Under a pin no search
  # happened at all, and the same rule applies with more force: this message
  # exists because it once described a search that was wider than the one that
  # ran, and describing one that was narrower is the same fault mirrored.
  if [ -n "$GE_PIN" ]; then
    printf '%sge works in the one folder it was given, and there is nothing in it yet.\n' "$ge_nf_pad"
  elif [ -n "${HOME:-}" ]; then
    printf '%sge looked here, in every folder above here, and in your home folder, on\n' "$ge_nf_pad"
    printf '%syour Desktop, in Documents and in Downloads.\n' "$ge_nf_pad"
  else
    printf '%sge looked here and in every folder above here.\n' "$ge_nf_pad"
  fi
  [ -n "${2:-}" ] && printf '%s%s\n' "$ge_nf_pad" "$2"
  # Both sentences are about moving to another folder, and under a pin there is
  # no other folder to move to. Telling a founder to go and find one would send
  # them looking for something that does not exist and cannot be made to.
  if [ -z "$GE_PIN" ]; then
    printf '%sIf you already have one, it is in a folder ge does not look in. Go to it\n' "$ge_nf_pad"
    printf '%sand run this again. A second folder would split your work in two.\n' "$ge_nf_pad"
    # The condition sits in the body and the command sits on its own. It used to
    # ride on the recovery line, as "ge init, if this is the folder you want your
    # Launchhouse work kept in", and a founder pastes that line whole: the shell
    # hands ge a verb called "init," and ge answers that it has no such thing. A
    # line that does not run is not a way out, however careful its wording.
    printf '%sIf you have none, this is the folder your work will be kept in.\n' "$ge_nf_pad"
  else
    printf '%sThis makes it, and nothing you have written is touched.\n' "$ge_nf_pad"
  fi
  # ge init is only a way out when ge init would work. Standing in a folder that
  # will not take a new one, this used to hand over "ge init", which refused and
  # printed the chmod itself, so the founder pasted two lines where ge already
  # held everything needed for one. The same reasoning ge person and ge receipt
  # follow for a locked folder: name the chmod rather than sending them a step
  # further to be told it.
  #
  # Under a pin the folder ge init will write in is the pin, or the folder above
  # it while the pin itself is still to be made. The working directory is not
  # that folder and has nothing to do with it, so probing it would hand over a
  # chmod on a folder ge is never going to write in.
  ge_nf_bits=''
  if [ -n "$GE_PIN" ]; then
    ge_nf_at=$GE_PIN
    [ -d "$ge_nf_at" ] || ge_nf_at=$(dirname -- "$GE_PIN")
    [ -d "$ge_nf_at" ] || ge_nf_at=''
  else
    ge_nf_at=$(ge_here 2>/dev/null) || ge_nf_at=''
  fi
  if [ -n "$ge_nf_at" ]; then
    [ -w "$ge_nf_at" ] || ge_nf_bits=w
    [ -x "$ge_nf_at" ] || ge_nf_bits="${ge_nf_bits}x"
  fi
  if [ -n "$ge_nf_bits" ]; then
    printf '%s→ run: chmod u+%s %s && ge init\n' "$ge_nf_pad" "$ge_nf_bits" "$(ge_quote "$ge_nf_at")"
  else
    printf '%s→ run: ge init\n' "$ge_nf_pad"
  fi
}

# ge_nf_anchorless <one extra sentence>: what ge says about a growth-engine
# folder that ge_scan walked past. Reads ge_al_found, ge_al_count and ge_nf_pad,
# which ge_nofolder_refusal has already set. Split out only to keep that function
# readable, and it has no other caller.
#
# The founder is told what is true and nothing more: there is a folder here, it
# is named, and ge walked past it for the reason ge_al_reason established and no
# other. What is deliberately NOT said, in any of the three branches, is that
# their work is all still in there. ge looked for one file. It never read the
# rest of the folder, so it cannot say what is in it.
#
# Every branch ends with one pasteable line that leaves the folder usable, or
# with guidance and no "run:" where ge has no such line to give. Nothing here
# hands over a step that clears half of it and leaves a second refusal behind.
ge_nf_anchorless() {                    # [one extra sentence]
  ge_nf_first=$(printf '%s\n' "$ge_al_found" | sed '/^$/d' | sed -n '1p')
  ge_al_reason "$ge_nf_first"

  if [ "$ge_al_count" -eq 1 ]; then
    ge_nf_said='a growth-engine folder it did not recognise:'
  else
    ge_nf_said='growth-engine folders it did not recognise:'
  fi
  case $ge_nf_pad in
    '') printf 'ge found %s\n' "$ge_nf_said" ;;
    *)  printf 'FAIL  ge found %s\n' "$ge_nf_said" ;;
  esac

  # Two literal sed programs rather than one built from the pad. Nothing is
  # interpolated into a sed script anywhere in this toolkit, and an indent is
  # not a good enough reason to start.
  if [ -n "$ge_nf_pad" ]; then
    printf '%s\n' "$ge_al_found" | sed '/^$/d; s/^/        /'
  else
    printf '%s\n' "$ge_al_found" | sed '/^$/d; s/^/  /'
  fi

  # Said before the rest, so every "it" below has one folder to point at. The
  # nearest one is the one a founder is standing next to, which is the one they
  # mean, and it is the one the command at the end acts on.
  [ "$ge_al_count" -eq 1 ] || \
    printf '%sThe rest of this is about the first one listed.\n' "$ge_nf_pad"

  # Worked out once, here, because every branch below that hands over a command
  # ends in ge init and puts this in front of it. ge init works on the folder the
  # founder is standing in, and they may not be standing in this one.
  ge_nf_parent=$(dirname -- "$ge_nf_first")

  case $GE_AL_WHY in
    shut)
      # Which folder refused, growth-engine or the .state inside it, is settled
      # by ge_al_reason and named on the command line below. The sentence has to
      # be true of either, so it describes the reach and not one folder.
      printf '%sge does not have permission to read and write everything it needs inside\n' "$ge_nf_pad"
      printf '%sit, so it could not reach the file that records where the folder lives,\n' "$ge_nf_pad"
      printf '%sand could not tell whether this is one of its own. ge changed nothing.\n' "$ge_nf_pad"
      # Said here because the line below does two things, and a founder is owed
      # both before they paste it. The chmod on its own left them reading a
      # second refusal, about the file that is still not there.
      #
      # "if it is not there", and never "the missing file". ge could not get
      # inside that folder, so it does not know whether the file is missing, and
      # a sentence here that says it is would be ge claiming more than it looked at.
      printf '%sThis hands that permission back and runs ge init on the folder. ge init\n' "$ge_nf_pad"
      printf '%swrites that file if it is not there, and overwrites nothing you have\n' "$ge_nf_pad"
      printf '%swritten.\n' "$ge_nf_pad" ;;
    blocked)
      printf '%sWhere that folder keeps the file recording where it lives, there is\n' "$ge_nf_pad"
      printf '%ssomething else that is not an ordinary file. ge could not read a folder\n' "$ge_nf_pad"
      # True whichever way this ends: the line below moves it aside and runs
      # ge init, and where ge has no safe move to offer the founder is asked to
      # do the same two things by hand.
      printf '%spath out of it. Move that aside and ge init writes the file properly.\n' "$ge_nf_pad"
      printf '%sNothing is deleted by moving it, so you can put the name back.\n' "$ge_nf_pad" ;;
    *)
      # What is NOT said here: that the founder's work is all still in there. ge
      # looked for one file and found it absent. It never read the rest of the
      # folder, so it cannot say what is in it. What it can say, and what does
      # the same job, is what ge init will do, which is nothing to their files.
      printf '%sIt is missing the small file that records where it lives. That file is\n' "$ge_nf_pad"
      printf '%show ge tells its own folders apart, so ge read past this one and said you\n' "$ge_nf_pad"
      printf '%shad none. Some sync and tidying tools take a file like that away.\n' "$ge_nf_pad"
      printf '%sge init writes that file again. It does not overwrite anything you have\n' "$ge_nf_pad"
      printf '%swritten.\n' "$ge_nf_pad" ;;
  esac

  [ -n "${1:-}" ] && printf '%s%s\n' "$ge_nf_pad" "$1"

  # EVERY LINE BELOW ENDS WITH THE FOLDER USABLE, OR IT IS NOT OFFERED.
  # A chmod on its own, and a mv on its own, both left the founder reading a
  # second refusal: the permission was back, or the thing in the way was gone,
  # and the file recording where the folder lives still was not there. So the
  # step that clears it is joined on. && and never a semicolon, all the way
  # along: if the first part fails, ge init must not run, or it builds the
  # second folder that this whole message exists to prevent.
  case $GE_AL_WHY in
    shut)
      printf '%s→ run: chmod u+rwx %s && cd %s && ge init\n' "$ge_nf_pad" \
        "$(ge_quote "$GE_AL_PATH")" "$(ge_quote "$ge_nf_parent")" ;;
    blocked)
      # Offered only while the name it lands on is free. mv onto something that
      # is already there buries one inside the other on a Mac, or refuses, and
      # either way the line handed over becomes the founder's second problem.
      if [ ! -e "$GE_AL_PATH-old" ] && [ ! -h "$GE_AL_PATH-old" ]; then
        printf '%s→ run: mv %s %s && cd %s && ge init\n' "$ge_nf_pad" \
          "$(ge_quote "$GE_AL_PATH")" "$(ge_quote "$GE_AL_PATH-old")" \
          "$(ge_quote "$ge_nf_parent")"
      else
        # DELIBERATE: guidance, not a command, and the arrow says so by not
        # carrying the word run. Both names are taken, ge will not invent a
        # third for the founder to keep track of, and the only commands left
        # either delete something or write over something. A fake command in the
        # pasteable slot is worse than a sentence, because the next founder who
        # pastes a real one has already learned not to trust it.
        #
        # It opens on Give, and not on Rename, for the reason ge_may_replace
        # writes down where it faces the same choice further down this file: a
        # Mac reads a file name either way round, so on any machine carrying the
        # rename tool a line opening on Rename is a real command, and a founder
        # who pastes it anyway sets about renaming something. Give is neither a
        # program nor a shell word, so the worst a paste can do is one line
        # saying there is no such command.
        #
        # ge init is named, and so is the folder to run it from, for the same
        # reason the two commands above join it on: the rename on its own leaves
        # the file recording where the folder lives still missing, and ge init
        # run from the wrong folder makes the second growth-engine folder this
        # whole message exists to prevent.
        printf '%sge has no move to offer: the -old name beside it is taken. ge init\n' "$ge_nf_pad"
        printf '%shas to be run from:\n' "$ge_nf_pad"
        printf '%s  %s\n' "$ge_nf_pad" "$ge_nf_parent"
        printf '%s→ Give that any other name, then run ge init there.\n' "$ge_nf_pad"
      fi ;;
    *)
      printf '%s→ run: cd %s && ge init\n' "$ge_nf_pad" "$(ge_quote "$ge_nf_parent")" ;;
  esac
}

# ============================================================================
# MAY GE PUT A NEW FILE IN PLACE OF THIS FOUNDER FILE. Asked in one place here,
# because it was asked in no place at all and a founder file was lost to it.
#
# WHY IT EXISTS: every writer in this toolkit builds a new file beside the
# founder's and renames it over the top, so an interrupt halfway through can
# never leave half a ledger. A rename asks the FOLDER for permission and never
# the file. So a ledger.md the founder had set to read only was replaced anyway,
# ge said "Added piece c2." and exited 0, and the read only bit was gone
# afterwards, because the file that landed carries the temp file's permissions
# and not theirs. Nothing said a word.
#
# lib/blocks.sh already refused that, inside itself, and that made it worse
# rather than better: ge remember and ge log kept the founder's setting while ge
# ledger, ge person, ge receipt and ge index took it off in silence, and ge check
# then called the same file read only in the same second ge had written into it.
# The doctor and the writer disagreeing about one file is how a founder stops
# believing either. One guard, in the file every writer already loads, is what
# stops that.
#
# WHAT IT DOES NOT ANSWER, so no caller drops the check it already has:
#   * whether the write will succeed. This names what ge can SEE in the way. A
#     disk that fills, a folder that goes away mid run, or a sync client that
#     locks the file a moment later are all still the caller's own failure path.
#   * whether ge can read the old file. Replacing is not reading. Callers that
#     read the file first keep their own answer for that.
#
# HOW A WRITER USES IT, all four lines of it:
#   ge_may_replace "$file" || { ge_replace_refusal "$file" >&2; return 1; }
#   ... build "$tmp" ...
#   ge_keep_mode "$file" "$tmp"
#   mv "$tmp" "$file" 2>/dev/null || { ...the caller's own refusal... }
# ============================================================================

# What ge_may_replace found, for a caller that wants to say it in its own words.
# Started empty so a caller reading them before asking anything gets an empty
# answer rather than falling over under set -u.
#
#   GE_REPLACE_WHY   ok, readonly, folder or notfile
#   GE_REPLACE_PATH  the thing the way out acts on: their file, or the folder
#   GE_REPLACE_FIX   one command, every path in it already through ge_quote, or
#                    empty where there is no command ge can stand behind
#   GE_REPLACE_DO    the named action for that case, and empty otherwise
#
# Exactly one of FIX and DO carries anything whenever WHY is not ok.
GE_REPLACE_WHY=''
GE_REPLACE_PATH=''
GE_REPLACE_FIX=''
GE_REPLACE_DO=''

# ge_may_replace <the founder file ge is about to replace>: 0 when nothing ge can
# see stands in the way. Non-zero, with the four fields above set, when something
# does.
#
#   0  ok        their file is absent, or it is an ordinary file that takes a
#                write, and the folder takes a new file. Absent is a yes, and it
#                has to stay one: that is a founder's first write.
#   1  readonly  their file is there and will not take a write. This is the one
#                the founder set, or a sync client set, and it is kept.
#   2  folder    the folder will not take a new file, so nothing can be put in
#                place inside it, whatever their own file says.
#   3  notfile   something has that name and it is not an ordinary file, so a
#                rename onto it would land inside it or follow it somewhere else.
#
# -w is the right question on their file even where the bit means nothing: a run
# as root reads it as true, and so does a Windows drive under Git Bash, so
# neither is refused here for a setting that would not have stopped them. Where
# it does mean something it is the founder's own decision, and ge keeps it.
ge_may_replace() {                      # <the founder file>
  GE_REPLACE_WHY=ok
  GE_REPLACE_PATH=$1
  GE_REPLACE_FIX=''
  GE_REPLACE_DO=''

  ge_mr_dir=$(dirname -- "$1") || ge_mr_dir=.
  # Write and search, both, because ge makes a new file in that folder and then
  # renames it over the top, and it has to be able to enter the folder to do
  # either. A folder that is not there at all is not answered here: ge cannot
  # name a chmod for a folder that is gone, and a check may not claim more than
  # it examined, so that one is left to the caller's own failure path.
  ge_mr_shut=0
  if [ -d "$ge_mr_dir" ] && ! { [ -w "$ge_mr_dir" ] && [ -x "$ge_mr_dir" ]; }; then
    ge_mr_shut=1
  fi
  # Joined on the front of the commands below, and joined with && so that if the
  # chmod fails the rest does not run. A line that hands the permission back and
  # then leaves the founder reading a second refusal is half a way out, and half
  # a way out is what makes somebody stop reading them.
  ge_mr_first=''
  [ "$ge_mr_shut" -eq 1 ] && ge_mr_first="chmod u+rwx $(ge_quote "$ge_mr_dir") && "

  # -h as well as -e, because a shortcut pointing at something that is gone
  # answers to neither on its own, and a rename onto it follows it.
  if [ -e "$1" ] || [ -h "$1" ]; then
    if [ ! -f "$1" ]; then
      GE_REPLACE_WHY=notfile
      # Offered only while the name it lands on is free. mv onto something that
      # is already there buries one inside the other on a Mac, or refuses, and
      # either way the line handed over becomes the founder's second problem.
      if [ ! -e "$1-old" ] && [ ! -h "$1-old" ]; then
        GE_REPLACE_FIX="${ge_mr_first}mv $(ge_quote "$1") $(ge_quote "$1-old")"
      else
        # DELIBERATE: guidance, not a command, and the arrow says so by not
        # carrying the word run. ge will not invent a third name for the founder
        # to keep track of, and the only commands left either delete something
        # or write over something.
        #
        # It opens on Give, which is the same word ge_scatter_refusal opens its
        # own guidance line on, and it is chosen rather than inherited: it is not
        # a shell reserved word, so a founder who pastes it anyway is answered
        # about a command that does not exist rather than with a syntax error,
        # and it is not the name of a program either. Rename is: a Mac reads a
        # file name either way round, so on any machine carrying the rename tool
        # a line opening on Rename is a real command, and pasting it would set
        # about renaming something.
        GE_REPLACE_DO='Give it any other name, then run this again.'
      fi
      return 3
    fi
    if [ ! -w "$1" ]; then
      GE_REPLACE_WHY=readonly
      # u+rw and not u+w. On the common shape, a file at 444, the two do exactly
      # the same thing. On a file whose owner has no read either, u+w hands back
      # half of it and the founder reads a second refusal.
      GE_REPLACE_FIX="${ge_mr_first}chmod u+rw $(ge_quote "$1")"
      return 1
    fi
  fi

  if [ "$ge_mr_shut" -eq 1 ]; then
    GE_REPLACE_WHY=folder
    GE_REPLACE_PATH=$ge_mr_dir
    GE_REPLACE_FIX="chmod u+rwx $(ge_quote "$ge_mr_dir")"
    return 2
  fi
  return 0
}

# ge_replace_refusal <the founder file> [one extra sentence]: the one refusal
# every writer prints when ge will not replace a file. Written here rather than
# in each command so all of them say the same thing about the same state.
#
# It asks ge_may_replace itself rather than reading what a caller asked a moment
# ago, so the message can never describe a state that has since changed. Where
# ge can see nothing in the way it says that, and sends the founder to the
# doctor, which is what a caller should print after a write failed for a reason
# ge cannot name.
#
# THE ARROW LINE IS THE LAST LINE, every time. Everything after "→ run: " is the
# command and nothing else is on it: a founder selects the whole line and pastes
# it. What they need to know sits above it, where a sentence belongs.
#
# Prints on standard output. The caller sends it to standard error, or not, so
# the session hook can keep saying everything on one stream.
ge_replace_refusal() {                  # <the founder file> [one extra sentence]
  ge_may_replace "$1"
  case $GE_REPLACE_WHY in
    readonly)
      printf 'FAIL  %s is read only, so nothing changed.\n' "$1"
      printf '      ge does not write over a file that is set that way, and it does not\n'
      printf '      take the setting off either.\n' ;;
    folder)
      # The folder, and not the file. What is in the way is the folder, and a
      # founder sent to look at a file that is perfectly fine gets nowhere.
      printf 'FAIL  %s cannot be written to, so nothing changed.\n' "$GE_REPLACE_PATH"
      printf '      ge writes a new copy of the file beside the old one and then puts it\n'
      printf '      in place. Both of those ask the folder, and not the file.\n' ;;
    notfile)
      printf 'FAIL  %s is not an ordinary file, so nothing changed.\n' "$1"
      printf '      Something else has that name: a folder, or a shortcut pointing at\n'
      printf '      something that is gone. ge will not write over it.\n'
      printf '      Nothing is deleted by moving it aside, so you can put the name back.\n' ;;
    *)
      # Reached when a caller prints this after a write that failed for a reason
      # ge cannot see. Nothing is named, because nothing was found, and naming a
      # cause here would send the founder to a chmod on something already fine.
      printf 'FAIL  %s could not be written, so nothing changed.\n' "$1"
      printf '      ge could not see anything in the way, so this one needs a look at the\n'
      printf '      whole folder.\n' ;;
  esac
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
  if [ -n "$GE_REPLACE_FIX" ]; then
    printf '      Do this, then run the same command again.\n'
    printf '      → run: %s\n' "$GE_REPLACE_FIX"
  elif [ -n "$GE_REPLACE_DO" ]; then
    # Only the notfile branch ever leaves a named action instead of a command,
    # and only for the one reason said here.
    printf '      ge has no move to offer: the -old name beside it is taken.\n'
    printf '      → %s\n' "$GE_REPLACE_DO"
  else
    printf '      → run: ge check\n'
  fi
}

# ge_keep_mode <the founder's file> <the file ge will put in its place>: carry
# the founder's own permissions onto the replacement, before it is moved into
# place.
#
# WHY A REPLACE PRESERVES THE MODE, AND WHY THAT IS NOT OPTIONAL: a founder who
# sets a file to owner only has said something about a file holding prospect
# names and phone numbers. The rename that lands puts ge's own new file there,
# carrying whatever the umask gave it, so a private file came back readable by
# everybody and ge said "Added piece c2." while it happened. Undoing a founder's
# setting in silence is its own fault even where the write itself is wanted, so
# the mode goes across first and the founder's decision survives the write.
#
# Best effort, and deliberately so. It never stops a write ge has already agreed
# to, it never says anything, and it always ends at 0. The two ways of copying a
# mode outright are both out: chmod --reference is GNU only, and stat prints a
# different thing on BSD from GNU. So the mode is read from the one field POSIX
# does pin down, the first field of ls -l, and put back as a symbolic mode, which
# every chmod reads the same way. Anything that does not arrive in that shape is
# left alone rather than guessed at.
#
# Called immediately before the mv, never after: after it there is nothing left
# to read the founder's mode from.
ge_keep_mode() {                        # <their file> <the file taking its place>
  [ -f "$1" ] || return 0               # no file yet, so there is nothing to keep
  [ -f "$2" ] || return 0
  ge_km_bits=$(LC_ALL=C ls -ld -- "$1" 2>/dev/null | cut -c2-10)
  case $ge_km_bits in
    ?????????) ;;
    *) return 0 ;;
  esac
  # The nine characters are three sets of three: the owner, their group, and
  # everybody else. All three go across, and not the owner's alone, because a
  # founder who took the group off a file of prospect names meant that too.
  ge_km_u=${ge_km_bits%??????}
  ge_km_o=${ge_km_bits#??????}
  ge_km_g=${ge_km_bits#???}
  ge_km_g=${ge_km_g%???}
  ge_km_letters "$ge_km_u"; ge_km_mu=$GE_KM_SET
  ge_km_letters "$ge_km_g"; ge_km_mg=$GE_KM_SET
  ge_km_letters "$ge_km_o"; ge_km_mo=$GE_KM_SET
  # The sticky bit gets a clause of its own, with nobody named in front of it.
  # Put inside the o= clause instead, where ls printed it, BSD chmod reads the
  # clause, sets the other three and drops that one without a word. The file
  # then came out of the write without a bit this said it had kept.
  ge_km_sticky=''
  case $ge_km_o in ??[tT]) ge_km_sticky=',+t' ;; esac
  # -- in front of the mode, and never after it. BSD chmod stops reading options
  # at the mode, so a -- written behind it is taken as the name of a file, and
  # the command then complains about a file called -- and hands back a failure
  # for a mode it had already set.
  chmod -- "u=$ge_km_mu,g=$ge_km_mg,o=$ge_km_mo$ge_km_sticky" "$2" 2>/dev/null || return 0
  return 0
}

# ge_km_letters <the three characters ls printed for one of them>: the same
# permissions written the way chmod takes them. Left in GE_KM_SET rather than
# printed, because printing it would put a subshell around every one of the
# three and this runs on the way to every write.
#
# The odd letters are the ones ls uses for a bit that is set two ways at once: s
# is execute and set-user, S is set-user without execute, and t and T are the
# same pair for the sticky bit. Each is read for exactly what it says, so a file
# carrying one comes out of the write carrying it still. The sticky bit is the
# one this does not hand back, because chmod will not take it inside a clause
# with somebody named in front of it. ge_keep_mode adds that clause itself.
GE_KM_SET=''
ge_km_letters() {                       # <three characters>
  GE_KM_SET=''
  case $1 in r??) GE_KM_SET=r ;; esac
  case $1 in ?w?) GE_KM_SET=${GE_KM_SET}w ;; esac
  case $1 in ??[xst]) GE_KM_SET=${GE_KM_SET}x ;; esac
  case $1 in ??[sS]) GE_KM_SET=${GE_KM_SET}s ;; esac
}

# ge_backup_fix <the backup folder>: the way out of a backup that was refused,
# as one command wherever ge can name what refused it.
#
# WHY: all three refusals below used to end on "→ run: ge check". That does
# recover, but in two steps: the doctor's own answer is a chmod, so the founder
# runs the doctor and then runs the line the doctor prints. ge is already holding
# the path, so it says the chmod itself, which is what ge receipt and ge person
# now do for this same locked folder.
#
# ALL THE MISSING BITS, NAMED TOGETHER, AND NOT u+w ALONE. A folder takes a new
# file only when it can be entered as well as written to, so a folder at 400
# handed chmod u+w becomes 600 and refuses again in the same words. Asked one at
# a time, the founder reads a second refusal for one condition.
#
# When mkdir is what failed the folder is not there to ask, so the parent is what
# refused and the parent is what gets named.
#
# The doctor stays the answer when the folder is fine and the write failed
# anyway, because then ge cannot name what is in the way, and a chmod on
# something already correct sends the founder down a dead end.
ge_backup_fix() {                     # <the backup folder>
  gbf_d=$1
  [ -d "$gbf_d" ] || gbf_d=${1%/*}
  [ -d "$gbf_d" ] || { printf 'ge check'; return 0; }
  gbf_bits=''
  [ -r "$gbf_d" ] || gbf_bits=r
  [ -w "$gbf_d" ] || gbf_bits="${gbf_bits}w"
  [ -x "$gbf_d" ] || gbf_bits="${gbf_bits}x"
  [ -n "$gbf_bits" ] || { printf 'ge check'; return 0; }
  printf 'chmod u+%s %s' "$gbf_bits" "$(ge_quote "$gbf_d")"
}

# The sentence above the arrow and the arrow itself, built from one answer, so a
# line describing a chmod can never sit above a line that says something else.
ge_backup_refusal() {                  # <the backup folder>
  gbr_fix=$(ge_backup_fix "$1")
  if [ "$gbr_fix" = 'ge check' ]; then
    printf '      ge check reads that folder and says whether it is read only or full.\n'
  else
    printf '      The backup folder will not take a new file until those are put back.\n'
  fi
  printf '      → run: %s\n' "$gbr_fix"
}

# ge_anchor <home>: the path the folder says it lives at, with the two marks a
# Windows editor leaves behind taken off first: the carriage return at the end
# of the line, and the byte order mark at the very start of the file.
ge_anchor() {
  ge_an_line=$(tr -d '\r' < "$1/.state/HOME" 2>/dev/null | sed -n '1p')
  printf '%s\n' "${ge_an_line#"$GE_BOM"}"
}
