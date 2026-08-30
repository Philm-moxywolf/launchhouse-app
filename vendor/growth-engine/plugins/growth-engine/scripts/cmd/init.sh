# init.sh: create and anchor the founder's working folder. Sourced by ge.sh.
#
# WHY IT EXISTS: everything the toolkit writes goes in one folder, and the
#                folder has to exist and know where it is before any skill runs.
#                The anchor is what lets every later command tell "you are in
#                the wrong folder" apart from "you have not started yet", which
#                are the two states founders confuse most often.
# CALLED BY:     ge init, the setup skill, and every skill that finds no folder
# READS:         growth-engine/.state/HOME   WRITES: growth-engine/ and everything seeded in it
# POSTURE:       fail-closed on the anchor. If the anchor cannot be written the
#                folder is not usable and saying so now beats failing later.
#                Fail-closed on a second folder too: ge init will not make one
#                while another already exists, because that is the state in
#                which every other verb refuses and none of them can be fixed
#                from inside
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHAT "→ run:" PROMISES HERE
#
# Everything after "→ run: " is the command, to the end of the line. A founder
# selects the whole line and pastes it, so nothing else may ride on it: no
# comma, no "then ge init again", no "and carry on there". Every one of those
# used to, and pasted whole they hand the shell a command it does not have.
# What the founder needs to know goes on its own line above, and the step that
# used to be described in English is joined on with && instead, so one paste
# leaves the folder made. Two states have no command ge can stand behind, both
# marked where they are written: they get "→ " and an instruction, with no
# "run:", so the pasteable form means pasteable every time.
#
# WHY IT RE-ANCHORS, AND WHEN IT WILL NOT
#
# ge init is the command the doctor names when the anchor and the folder
# disagree, so it has to be able to settle that disagreement. It could not: it
# kept any anchor file that already existed, so a founder who dragged their
# folder from Downloads to the Desktop was told to run ge init, ran it, was told
# it worked, and got the same red line for ever. Moving a folder is the most
# ordinary thing anybody does with one, and on Windows the machine does it for
# them when OneDrive backs up the Desktop.
#
# The anchor cannot tell a folder that MOVED from a folder that was COPIED. Both
# look the same from inside. What tells them apart is the place the anchor names:
#
#   it is gone                 the folder moved. Re-anchor. Nothing else exists,
#                              so there is nothing to lose and one command fixes it.
#   it is the same folder      one folder, two names, which is what an alias, a
#   under another name         mapped drive, or a Mac reaching /tmp as
#                              /private/tmp gives you. Re-anchor to the name the
#                              founder actually used today.
#   it still holds a folder    this one is a copy. Two folders now hold work.
#                              Re-anchoring would quietly make the copy the real
#                              one, so ge stops and names both instead.
#
# HOW A FOUNDER DELIBERATELY MOVES THEIR FOLDER
#
# Move it, then run ge init from where it is now. That is the whole procedure,
# it is two steps, and every refusal here that needs it prints it.
#
# WHAT IT DOES INSIDE A growth-engine FOLDER
#
# It works on that folder. It used to make growth-engine/growth-engine, silently,
# and every later command then wrote into the empty new one while the founder's
# real work sat one level up. init's own closing line tells founders to always
# open this same folder, which is exactly what puts them inside it.

# What the anchor line will say, worked out before anything is written so a
# refusal happens before the folder is touched.
GE_INIT_ACT=create                      # create, keep or update
GE_INIT_WHY=''                          # gone, or renamed, when the act is update
GE_INIT_WAS=''                          # the path the anchor used to name

# ge_init_no_write <the file that would not be written>: one recovery line for
# every file ge init writes, and a command to paste wherever ge can name what
# refused. The folders are made by mkdir further down, which has its own answer.
#
# WHY: the lines this replaced described an action instead of naming one.
# "check the folder is not read only" left the founder to work out which folder
# and which command, and "ge init from a folder you can write to" was worse than
# that, because by the time a seed file fails the folder here is already made and
# already anchored, so running ge init somewhere else meets the refusal about a
# second folder instead of a way out.
#
# The file is asked about before the folder, because a sync client locks the one
# file it is holding and leaves the folder around it alone. When neither is the
# thing in the way ge cannot name it, and a chmod on something already writable
# helps nobody, so what is handed over is the command that looks at the disk.
#
# The chmod used to be followed by ", then ge init again", which is the two
# steps written out for somebody who is reading rather than pasting. Pasted, the
# shell reads chmod's arguments as a list of files and one of them is the word
# "then". So the second step is joined on with && and the line does both.
ge_init_no_write() {                    # <the file that would not be written>
  gi_nw_d=${1%/*}
  [ "$gi_nw_d" = "$1" ] && gi_nw_d=.
  # Asked first, and until now asked nowhere at all. The three tests below read
  # a file and a folder, and both of them answer normally when something that is
  # not a file has the name: the redirection fails the way a full disk fails, so
  # the founder was handed df, df showed them plenty of room, and the only other
  # command that touches this file called it missing and sent them back here.
  # Neither message named the thing in the way, so there was no way out of it.
  # It is asked before the folder as well, because where this is true a chmod on
  # the folder clears nothing and the same refusal comes back.
  #
  # -e and -h both, because a shortcut pointing at something that is gone
  # answers to neither on its own.
  if { [ -e "$1" ] || [ -h "$1" ]; } && [ ! -f "$1" ]; then
    # lib/paths.sh is what examines it and works out the move, so ge says the
    # same thing about this state here as every writer in the toolkit does. The
    # pair of questions asked above is the pair it answers notfile to, so the
    # fields read below are always the notfile ones. Where the folder around it
    # is shut as well, the chmod that opens it is already on the front of that
    # command.
    ge_may_replace "$1"
    printf '      Something else has that name: a folder, or a shortcut pointing at\n' >&2
    printf '      something that is gone. Nothing is deleted by moving it aside, so you\n' >&2
    printf '      can put the name back.\n' >&2
    if [ -n "$GE_REPLACE_FIX" ]; then
      printf '      This moves it aside and runs ge init again.\n' >&2
      printf '      → run: %s && ge init\n' "$GE_REPLACE_FIX" >&2
    else
      # DELIBERATE: guidance, not a command, and the arrow carries no "run:" to
      # say so. Beside it the -old name is taken too, and ge will not invent a
      # third name for the founder to keep track of. It opens on Give for the
      # reason the other two guidance lines in this file do: it is neither a
      # program nor a shell word, so a paste of it moves nothing.
      printf '      Beside it the -old name is taken too, so ge has no move to offer.\n' >&2
      printf '      → Give that any other name, then run ge init again.\n' >&2
    fi
  elif [ -f "$1" ] && [ ! -w "$1" ]; then
    printf '      This makes that file writable and runs ge init again.\n' >&2
    printf '      → run: chmod u+w %s && ge init\n' "$(ge_quote "$1")" >&2
  elif [ -d "$gi_nw_d" ] && [ ! -w "$gi_nw_d" ]; then
    printf '      This makes that folder writable and runs ge init again.\n' >&2
    printf '      → run: chmod u+w %s && ge init\n' "$(ge_quote "$gi_nw_d")" >&2
  else
    # Nothing curative to offer: the file is writable, or absent, and the folder
    # around it takes writes. ge will not guess at a cause it did not examine,
    # so what it hands over is the one thing that reads the likeliest one back.
    printf '      ge cannot say what refused. The usual answer is a full disk, and this\n' >&2
    printf '      prints how much room is left on that one.\n' >&2
    printf '      → run: df -h %s\n' "$(ge_quote "$gi_nw_d")" >&2
  fi
}

ge_init_seed_file() {
  # Seeds a file only when it is absent. Never clobbers, so a re-run is safe.
  # The path is printed relative to the folder, not the bare file name: two
  # folders can hold a README.md, and a founder cannot check a line that does
  # not say which one appeared.
  ge_seed_rel=${1#"$ge_target"/}
  [ -f "$1" ] && { printf '  kept     %s\n' "$ge_seed_rel"; return 0; }
  # Said out loud, not swallowed. A seed that failed silently left ge init
  # ending on "Your folder is" over a folder missing a file every later skill
  # expects to find. The group carries the redirection of the error, because a
  # failing > is reported by the shell before the command's own redirections.
  if ! { printf '%s' "$2" > "$1"; } 2>/dev/null; then
    printf 'FAIL  could not create %s.\n' "$1" >&2
    ge_init_no_write "$1"
    return 1
  fi
  printf '  created  %s\n' "$ge_seed_rel"
}

ge_init_memory() {
  # The six managed blocks, present and empty. Seeding them here means no skill
  # ever has to create the file, which removes a whole class of first-write failure.
  [ -f "$1" ] && { printf '  kept     memory.md\n'; return 0; }
  # Two groups, not one. The redirection that can fail has to sit inside a group
  # that already has its error thrown away, because a failing > is reported by
  # the shell before the redirections written after it are applied. Written the
  # other way round it printed this file's own name and a line number at a
  # founder, which is the one thing every file here promises never to do.
  if ! {
      {
        printf '# Memory\n\n'
        printf 'Curated. What matters, not everything. The full record is in ops-log.md.\n'
        printf 'Written by: ge remember. Do not hand-edit inside the marked blocks.\n\n'
        for ge_pair in 'Decisions:DECISIONS' 'What worked:WORKED' 'What did not:DIDNOT' \
                       'Voice notes:VOICE' 'Angles used:ANGLES' 'Open threads:THREADS'; do
          ge_h=${ge_pair%%:*}; ge_k=${ge_pair#*:}
          printf '## %s\n' "$ge_h"
          block_start "$ge_k"; printf '\n'
          block_end "$ge_k"; printf '\n\n'
        done
        printf '## Notes\n'
        printf 'Anything below this heading is yours. ge never writes here.\n'
      } > "$1"
    } 2>/dev/null; then
    printf 'FAIL  could not create %s.\n' "$1" >&2
    ge_init_no_write "$1"
    return 1
  fi
  printf '  created  memory.md\n'
}

# ge_init_target: the folder this run works on.
#
# Standing inside a folder called growth-engine, ge init means this one. A
# founder gets there by following init's own advice to always open the same
# folder, and by following any recovery line in the toolkit that says to run
# ge init. Making another one inside it is never what they meant.
ge_init_target() {
  # THE PIN WINS, AND IT WINS HERE TOO. Every other verb refuses when it cannot
  # find a folder. ge init is the one that makes one, so it is the one verb that
  # can put a folder somewhere, and a pin that the twelve readers honour and the
  # one writer does not is not a boundary at all: run from anywhere with a pin
  # set, ge init would build a second folder outside it and every later verb
  # would refuse to see the folder the founder just watched it make.
  [ -z "$GE_PIN" ] || { printf '%s\n' "$GE_PIN"; return 0; }
  # A failure here is a refusal, never a default. pwd failing used to leave this
  # empty, and "$empty/growth-engine" is "/growth-engine", so ge init announced
  # it could not create a folder at the root of the disk and offered chmod on /.
  gi_pwd=$(ge_here) || return 1
  [ "$gi_pwd" = / ] && { printf '/growth-engine\n'; return 0; }
  case ${gi_pwd##*/} in
    growth-engine) printf '%s\n' "$gi_pwd" ;;
    *)             printf '%s\n' "$gi_pwd/growth-engine" ;;
  esac
}

# ge_init_guard <target>: refuses to add a second folder to a founder who
# already has one. This is the state in which thirteen other verbs refuse and
# nothing a founder types from inside it clears, so the place to stop it is
# before it exists.
ge_init_guard() {
  gi_out=$(ge_find_home)
  gi_rc=$?

  if [ "$gi_rc" -eq 2 ]; then
    ge_scatter_refusal "$gi_out" 'Nothing was made here.' >&2
    return 1
  fi

  [ "$gi_rc" -eq 0 ] || return 0        # nothing anywhere, so this is the first one

  gi_have=$(printf '%s\n' "$gi_out" | sed -n '1p')
  ge_same_dir "$gi_have" "$1" && return 0

  printf 'FAIL  you already have a Launchhouse folder, and it is not here:\n' >&2
  printf '        %s\n' "$gi_have" >&2
  printf '      A second one would split your work in two, so nothing was made here.\n' >&2
  printf '      Work in the one you have, or move it here and carry on in this folder.\n' >&2
  # The move is offered only while the name it lands on is free. A folder called
  # growth-engine that is already here and holds nothing ge anchored is an
  # ordinary thing to find: a founder made one by hand, or a sync client left the
  # shell of one behind. mv onto it puts the founder's real folder inside it on a
  # Mac, and refuses outright the moment it holds a single file, so the line they
  # were handed becomes the second problem. Where it cannot be offered, the folder
  # they already have is named instead, which is the other half of the sentence
  # above and a command they can paste. -h as well as -e, because a shortcut
  # pointing at something that is gone answers to neither on its own, and mv onto
  # one of those quietly writes over the shortcut.
  if [ ! -e "$1" ] && [ ! -h "$1" ]; then
    printf '      This brings it here, with everything in it, and carries on in this folder.\n' >&2
    printf '      → run: mv %s %s && ge init\n' \
      "$(ge_quote "$gi_have")" "$(ge_quote "$(dirname -- "$1")")" >&2
  else
    # No move to offer, so the founder is taken to the folder they have instead.
    # cd and nothing else: ge init there would report success and change nothing,
    # which reads as though something had been fixed. What is in the way is named
    # on its own line, the way every other path in this file is printed, because
    # a founder path is long enough to run a sentence off the side of a window.
    printf '      ge has no move to offer, because something is already at:\n' >&2
    printf '        %s\n' "$1" >&2
    printf '      This takes you to the folder you have.\n' >&2
    printf '      → run: cd %s\n' "$(ge_quote "$gi_have")" >&2
  fi
  return 1
}

# ge_init_plan_anchor <target>: reads the anchor and decides what to do with it.
# Writes nothing. See the table at the top of this file for why each branch is
# what it is.
ge_init_plan_anchor() {
  gi_t=$1

  if [ ! -f "$gi_t/.state/HOME" ]; then
    GE_INIT_ACT=create
    return 0
  fi

  gi_said=$(ge_anchor "$gi_t")

  # Empty, or nothing but a mark an editor left behind. The doctor tells the
  # founder ge init writes it again, so it does.
  if [ -z "$gi_said" ]; then
    GE_INIT_ACT=update
    GE_INIT_WHY=''
    return 0
  fi

  if [ "$gi_said" = "$gi_t" ]; then
    GE_INIT_ACT=keep
    return 0
  fi

  if ge_same_dir "$gi_said" "$gi_t"; then
    GE_INIT_ACT=update
    GE_INIT_WHY=renamed
    GE_INIT_WAS=$gi_said
    return 0
  fi

  if [ -f "$gi_said/.state/HOME" ]; then
    printf 'FAIL  this folder was made somewhere else, and that folder is still there:\n' >&2
    printf '        the one you are in:     %s\n' "$gi_t" >&2
    printf '        the one it was made in: %s\n' "$gi_said" >&2
    printf '      So one of them is a copy, and ge will not choose between two copies of your work.\n' >&2
    printf '      Open both and keep the one your work is in. Add -old to the name of the other.\n' >&2
    # Same guard as the one on the second folder above, for the same reason: a
    # founder who has been here once already has a growth-engine-old, and mv onto
    # it either buries the folder inside it or refuses. ge will not invent a
    # second name to get around that, because the name it picked would be one
    # more thing the founder has to keep track of, so it says which folder to
    # rename and leaves the name to them.
    if [ ! -e "$gi_said-old" ] && [ ! -h "$gi_said-old" ]; then
      printf '      This renames the one it was made in. Nothing in either folder is\n' >&2
      printf '      deleted, and ge then works from this one.\n' >&2
      printf '      → run: mv %s %s && ge init\n' \
        "$(ge_quote "$gi_said")" "$(ge_quote "$gi_said-old")" >&2
    else
      # DELIBERATE: guidance, not a command, and the arrow carries no "run:" to
      # say so. rename is not a command a founder has: BSD has none of that name
      # and the Linux one takes a pattern, so in the pasteable slot it was a line
      # that could only fail.
      printf '      Beside that folder the -old name is taken too, so ge has no rename to\n' >&2
      printf '      offer. Nothing is deleted by renaming it, so you can put the name back.\n' >&2
      printf '      → Give that folder any other name, then run ge init again.\n' >&2
    fi
    return 1
  fi

  GE_INIT_ACT=update
  GE_INIT_WHY=gone
  GE_INIT_WAS=$gi_said
}

ge_init_anchor() {                      # <target>
  case $GE_INIT_ACT in
    keep) printf '  kept     .state/HOME\n'; return 0 ;;
  esac
  # The group carries the failing redirection, for the reason set out in
  # ge_init_memory: written any other way the shell prints this file's own path
  # and a line number at the founder before the message below is reached.
  if ! { printf '%s\n' "$1" > "$1/.state/HOME"; } 2>/dev/null; then
    printf 'FAIL  could not write the anchor at %s/.state/HOME.\n' "$1" >&2
    ge_init_no_write "$1/.state/HOME"
    return 1
  fi
  case $GE_INIT_ACT in
    create) printf '  created  .state/HOME\n' ;;
    *)      printf '  updated  .state/HOME\n' ;;
  esac
}

# ge_init_index <target>: builds the derived table the doctor asks for.
#
# Without it the founder's first two commands were ge init and then a doctor
# that opened with a failure, on a folder where they had done nothing wrong. It
# is built by the real ge index, in a child process, so there is only ever one
# writer of that file and the two cannot drift. Best effort: a folder is usable
# without it, and the doctor names ge index if it is missing.
ge_init_index() {
  [ -f "$GE_HOME_DIR/scripts/cmd/index.sh" ] || return 0
  ( CDPATH= cd -- "$1" && sh "$GE_HOME_DIR/scripts/ge.sh" index ) > /dev/null 2>&1 || return 0
  [ -f "$1/.state/index.md" ] || return 0
  printf '  built    .state/index.md\n'
}

ge_init_main() {
  ge_target=$(ge_init_target)

  if [ -e "$ge_target" ] && [ ! -d "$ge_target" ]; then
    printf 'FAIL  %s exists and is not a folder.\n' "$ge_target" >&2
    # The rename, written out, rather than the word "rename". -old is the name
    # this file already hands out for a thing that has to move aside, so the
    # founder meets one convention and not two. Offered only while that name is
    # free: mv onto something that is already there is a second problem, not a
    # way out, and then saying which file to rename is all ge can honestly do.
    if [ ! -e "$ge_target-old" ] && [ ! -h "$ge_target-old" ]; then
      printf '      This moves that file aside and makes the folder. Nothing is deleted,\n' >&2
      printf '      so you can put the name back.\n' >&2
      printf '      → run: mv %s %s && ge init\n' \
        "$(ge_quote "$ge_target")" "$(ge_quote "$ge_target-old")" >&2
    else
      # DELIBERATE: guidance, not a command, and the arrow carries no "run:" to
      # say so. Both names are taken and ge will not invent a third for the
      # founder to keep track of.
      printf '      Beside it the -old name is taken too, so ge has no rename to offer.\n' >&2
      printf '      → Give that file any other name, then run ge init again.\n' >&2
    fi
    return 1
  fi

  # Both of these read only, and both can refuse. Nothing below them touches the
  # disk until they have passed.
  ge_init_guard "$ge_target" || return 1
  ge_init_plan_anchor "$ge_target" || return 1

  # mkdir's own complaint is thrown away and said again below in words a founder
  # can act on. Left in, a locked folder printed the same permission line twice
  # and then the message that was written for them.
  mkdir -p "$ge_target/.state/snapshots" "$ge_target/people" 2>/dev/null || {
    printf 'FAIL  could not create %s.\n' "$ge_target" >&2
    # Not ge_init_no_write: nothing has been made yet, so moving to a folder that
    # does work is still a true answer here, and it is the only one left when the
    # folder that refused is one ge cannot name. Where ge can name it, the chmod
    # is one command and keeps the founder in the folder they meant to work in.
    ge_parent=$(dirname -- "$ge_target")
    if [ -d "$ge_target" ] && [ ! -w "$ge_target" ]; then
      printf '      This makes that folder writable and runs ge init again.\n' >&2
      printf '      → run: chmod u+w %s && ge init\n' "$(ge_quote "$ge_target")" >&2
    elif [ -d "$ge_parent" ] && [ ! -w "$ge_parent" ]; then
      printf '      This makes the folder it goes in writable and runs ge init again.\n' >&2
      printf '      → run: chmod u+w %s && ge init\n' "$(ge_quote "$ge_parent")" >&2
    else
      # ge cannot name the folder to move to, so the gap is left visible and in
      # brackets rather than filled with a guess. It used to read "ge init from a
      # folder you can write to, for example your Desktop", which is a sentence
      # sitting where a command belongs: pasted, ge is handed a verb called
      # "init" and six words after it, and answers about the six words.
      printf '      ge cannot say what refused, so it cannot name the folder to use. Put a\n' >&2
      printf '      folder you can write to, your Desktop for example, in place of the\n' >&2
      printf '      words in brackets.\n' >&2
      printf '      → run: cd <a folder you can write to> && ge init\n' >&2
    fi
    return 1
  }

  printf 'Your Launchhouse folder\n\n'

  # The anchor. One line, absolute. Fail-closed: without it nothing later can
  # tell a moved folder from a missing one.
  ge_init_anchor "$ge_target" || return 1

  # Keeps the founder's own people and machine state out of any repository they
  # fork, and out of a sync client that treats a git folder specially.
  # Every seed is fail-closed. The next one would fail for the same reason, and
  # a folder that is missing one of these is a folder a later skill refuses to
  # work in, which is a much harder thing for a founder to read than this.
  ge_init_seed_file "$ge_target/.gitignore" \
'# Your own business data. Never commit or share these.
people/
.state/
' || return 1

  ge_init_seed_file "$ge_target/people/README.md" \
'# people

One file per person you are selling to, written by `ge person`.

These files hold real people'"'"'s names, companies and contact details.
Keep this folder off cloud sync and out of any repository you share.
' || return 1

  ge_init_memory "$ge_target/memory.md" || return 1

  ge_init_seed_file "$ge_target/ops-log.md" \
'# Ops log

Append only, written by `ge log`. Every day gets its own heading.
' || return 1
  ge_init_seed_file "$ge_target/ledger.md" \
'# Ledger

One writer: `ge ledger`. Do not hand-edit. Format: schemas/ledger.md
' || return 1

  ge_init_index "$ge_target"

  # Said out loud, because the folder moving is the thing the anchor exists to
  # catch and a founder who is not told will not know it was noticed.
  case $GE_INIT_WHY in
    gone)
      printf '\nThis folder has moved. It used to be at:\n\n  %s\n\n' "$GE_INIT_WAS"
      printf 'That folder is not there any more, so ge now works from where this one is.\n'
      printf 'Nothing you have written was changed.\n' ;;
    renamed)
      printf '\nYou reached this folder by a different name today:\n\n  %s\n\n' "$GE_INIT_WAS"
      printf 'It is the same folder, so ge wrote down the name you used.\n' ;;
  esac

  printf '\nYour folder is:\n\n  %s\n\n' "$ge_target"
  printf 'Always open this same folder when you work on Launchhouse.\n'
  printf 'If you open a different one, your work will be scattered and hard to find later.\n\n'
  printf 'Next: build your Founder Brain.\n'
  printf 'Saying "build my founder brain" is how you start it.\n'
}

ge_init_main "$@"
