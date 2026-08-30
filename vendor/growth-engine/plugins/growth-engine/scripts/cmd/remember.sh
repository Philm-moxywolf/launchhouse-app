# remember.sh: the curated memory layer. Sourced by ge.sh.
#
# WHY IT EXISTS: the ops log keeps everything and the index keeps no history, so
#                what the toolkit learns about a founder has nowhere to live. A
#                toolkit without this starts fresh every Monday: an angle gets
#                reused on a refill, a voice correction has to be made twice,
#                and a founder who comes back in December has only the Brain.
# CALLED BY:     ge remember, the content engine on refill, and any skill about
#                to answer a question about a past decision
# READS:         growth-engine/memory.md
# WRITES:        growth-engine/memory.md, only between its own markers.
#                Working files go in .state, never beside the founder's own.
# POSTURE:       fail-closed. No snapshot, no write. A half marked block is
#                refused rather than guessed at, and an amend that cannot say
#                what the entry reads now changes nothing and says so. Every
#                write path asks whether it can write BEFORE it tries, because
#                the shell's own answer to a locked folder names this file, a
#                line number in it and a working file no founder has heard of.
#                One write at a time: two windows on one folder used to be told
#                twice that an entry was saved and keep one of them.
#                A damaged block is described and repaired by lib/blocks.sh, and
#                more than one growth-engine folder by lib/paths.sh, so this file
#                names no block shape and no folder fix of its own. Both were
#                written here once and both were wrong for most of the cases
#                they answered.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Strips \r before matching.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").

# The six kinds, in the order memory.md lists them.
GE_REM_TYPES='decision worked didnot voice angle thread'

# A literal newline, held in a variable. $(printf '\n') is empty by the time the
# shell has finished with it, so a pattern built that way matches everything.
GE_REM_NL='
'

# The detail clause, one string, so the writer and the reader can never disagree
# about the spacing between them.
GE_REM_DETAIL=' (detail → '

# The working files and the claim, named before anything can set them, so the
# handler below can run at any moment without tripping over an unset variable.
GE_REM_SRC=''
GE_REM_BODY=''
GE_REM_STATE=''
GE_REM_LOCK=''

# How long to wait for another ge command to finish, and how old a claim has to
# be before it counts as abandoned. A write to memory.md takes a fraction of a
# second, so five is generous and thirty is well past anything real. A claim
# nobody could ever clear would wedge the most-used command in the toolkit,
# which is worse than the problem it guards against.
GE_REM_WAIT=5
GE_REM_STALE=30

ge_rem_usage() {
  cat <<'USAGE'
ge remember, your curated memory. It lives in growth-engine/memory.md.

  ge remember <kind> "<what you learned>" [--detail <where the detail is>]
  ge remember list [<kind>]
  ge remember forget <kind> <number>
  ge remember --amend <kind> <number> "<new text>" --expect "<what it reads now>" [--detail <pointer>]

The six kinds:
  decision   what you chose, and why
  worked     what got a result
  didnot     what did not
  voice      how you write, and the words you do not use
  angle      a content angle you have now used
  thread     something still open

Keep each one to a line. Long detail belongs in the ops log, and the entry
points at it. Everything under the Notes heading in that file is yours.

An amend always needs --expect, holding the words the entry reads now. That is
what stops it writing over a line you have reworded yourself. Run
ge remember list to see the words to give it.
USAGE
}

ge_rem_block() {
  case "$1" in
    decision) printf 'DECISIONS' ;;
    worked)   printf 'WORKED' ;;
    didnot)   printf 'DIDNOT' ;;
    voice)    printf 'VOICE' ;;
    angle)    printf 'ANGLES' ;;
    thread)   printf 'THREADS' ;;
    *)        return 1 ;;
  esac
}

# The heading the block sits under. block_ensure needs it when a founder has
# deleted a whole section, so ge can put it back rather than write into prose.
ge_rem_heading() {
  case "$1" in
    decision) printf 'Decisions' ;;
    worked)   printf 'What worked' ;;
    didnot)   printf 'What did not' ;;
    voice)    printf 'Voice notes' ;;
    angle)    printf 'Angles used' ;;
    thread)   printf 'Open threads' ;;
    *)        return 1 ;;
  esac
}

ge_rem_check_type() {
  if ge_rem_block "$1" >/dev/null 2>&1; then return 0; fi
  printf 'FAIL  "%s" is not one of the kinds of memory ge keeps.\n' "$1" >&2
  printf '      The six kinds are: %s\n' "$GE_REM_TYPES" >&2
  printf '      → run: ge remember decision "what you decided, and why"\n' >&2
  return 1
}

ge_rem_number_ok() {
  case "$1" in
    ''|*[!0-9]*) ;;
    *) [ "$1" -ge 1 ] && return 0 ;;
  esac
  printf 'FAIL  "%s" is not an entry number.\n' "$1" >&2
  printf '      Entry numbers are the ones ge remember list prints, counting from 1.\n' >&2
  printf '      → run: ge remember list\n' >&2
  return 1
}

# A value that carries a line break or a marker would break the file it is
# stored in, so it is refused at the door rather than repaired afterwards.
ge_rem_value_ok() {
  case "$1" in
    *"$GE_REM_NL"*)
      printf 'FAIL  the %s cannot contain a line break.\n' "$2" >&2
      # A bare arrow, because only the founder holds the text that was meant and
      # ge has no command that could retype it for them. It opened on "the", and
      # a founder who pasted that line was answered about a command called the.
      # It opens on Put, which is not a program and not a shell reserved word, so
      # pasting it now gets one "not found" and nothing else happens.
      printf '      → Put the text on one line, then run the same command again.\n' >&2
      return 1 ;;
  esac
  case "$1" in
    *'<!-- GE:'*)
      printf 'FAIL  the %s cannot contain "<!-- GE:". That is how ge marks the parts of the file it owns.\n' "$2" >&2
      # Same shape, same reason. The marker goes through ge_quote even here: a
      # founder who pastes the line anyway must not have the < read as a
      # redirection, which is what turns one refusal into a second one.
      printf '      → Take %s out of the text, then run the same command again.\n' \
        "$(ge_quote '<!-- GE:')" >&2
      return 1 ;;
  esac
  return 0
}

# ge_rem_not_file <the growth-engine folder>: the refusal for something that has
# the name memory.md and is not an ordinary file. Two machines that both write
# memory.md leave a sync client holding two versions of one name, and what it
# makes of that is a folder called memory.md with both copies inside it.
#
# WHAT IT EXAMINES: nothing of its own. ge_may_replace in lib/paths.sh is asked,
# so this state reads the same here as it does from every writer in the toolkit,
# and the move it names is the one that file already worked out. The caller has
# already established that something is there and that it is not an ordinary
# file, which is the same pair of questions ge_may_replace answers notfile to,
# so the fields read below are always the notfile ones.
#
# WHY THE WAY OUT IS LONGER THAN THE SHARED ONE: the shared refusal hands over
# the move by itself, and after the move memory.md is absent, so ge remember
# would refuse a second time and ask for ge init. A way out that ends in another
# refusal is not one. So ge init is joined on, and the cd in front of it is
# there because ge init works on the folder you are standing in, and a founder
# whose folder was found further up is standing somewhere else.
ge_rem_not_file() {                     # <the growth-engine folder>
  ge_may_replace "$GE_REM_FILE"
  # The folder that holds growth-engine, which is where ge init has to be run
  # from. Worked out once, because both branches below print it.
  gr_nf_parent=$(dirname -- "$1")
  printf 'FAIL  %s is not an ordinary file.\n' "$GE_REM_FILE" >&2
  printf '      Something else has that name: a folder, or a shortcut pointing at\n' >&2
  printf '      something that is gone. ge did not open it and changed nothing.\n' >&2
  printf '      Nothing is deleted by moving it aside, so you can put the name back.\n' >&2
  if [ -n "$GE_REPLACE_FIX" ]; then
    # Every path in it went through ge_quote before it reached here, and the one
    # added on this line goes through it too. Half the folders in this programme
    # are named after a business, so they carry a space.
    printf '      This moves it aside and writes memory.md again.\n' >&2
    printf '      → run: %s && cd %s && ge init\n' \
      "$GE_REPLACE_FIX" "$(ge_quote "$gr_nf_parent")" >&2
  else
    # DELIBERATE: guidance, not a command, and the arrow carries no "run:" to
    # say so. The -old name beside it is taken as well, ge will not invent a
    # third name for the founder to keep track of, and the only commands left
    # either delete something or write over something.
    #
    # It opens on Give, which is neither a program nor a shell word, so a
    # founder who pastes it anyway is answered about a command that does not
    # exist rather than having something renamed.
    printf '      Beside it the -old name is taken too, so ge has no move to offer.\n' >&2
    printf '      ge init then writes memory.md again. Run it from:\n' >&2
    printf '        %s\n' "$gr_nf_parent" >&2
    printf '      → Give it any other name, then run ge init there.\n' >&2
  fi
  return 1
}

# Resolves the folder once, so every verb below can assume the file is there.
ge_rem_open() {
  gr_home=$(ge_find_home)
  gr_rc=$?
  # The shared refusal in lib/paths.sh, not one written here. "from here" said
  # nothing about how wide the search actually is, so a founder with a folder on
  # the Desktop could not tell whether ge had looked at it. No extra sentence,
  # because ge remember list comes through here too and a line about nothing
  # being written reads oddly to somebody who only asked to look.
  if [ "$gr_rc" -eq 1 ]; then
    ge_nofolder_refusal fail >&2
    return 1
  fi
  if [ "$gr_rc" -eq 2 ]; then
    # The one refusal, from lib/paths.sh, so every verb says the same thing. The
    # line here used to read "cd into the one you want to use", which a founder
    # standing in that very folder was handed, and which clears nothing at all
    # when one of the two folders sits inside the other. paths.sh hands over the
    # mv to paste instead, and says in as many words that nothing is deleted.
    ge_scatter_refusal "$gr_home" >&2
    return 1
  fi
  GE_REM_FILE="$gr_home/memory.md"
  if [ ! -f "$GE_REM_FILE" ]; then
    # Two states, not one. This used to ask [ ! -f ] and nothing else, and then
    # say the file does not exist, which is a claim about a thing it had never
    # examined: a folder of that name answers no to -f while being very much
    # there. That is what two machines writing memory.md at once leaves behind,
    # and the founder was sent to ge init, which could not write over it either,
    # and came straight back here. Nothing in either message named what was
    # actually in the way, so there was no way out of it.
    #
    # -e and -h both, because a shortcut pointing at something that is gone
    # answers to neither on its own.
    if [ -e "$GE_REM_FILE" ] || [ -h "$GE_REM_FILE" ]; then
      ge_rem_not_file "$gr_home"
      return 1
    fi
    printf 'FAIL  %s does not exist yet.\n' "$GE_REM_FILE" >&2
    printf '      ge init seeds that file and is safe to run again.\n' >&2
    # The cd in front of it, and not ge init on its own. ge init works on the
    # folder you are standing in, and a founder whose folder was found further
    # up is standing somewhere else: bare ge init met the refusal about a second
    # folder there, and the way out of that one moves their whole growth-engine
    # folder into whichever folder they happened to be in. Where they are
    # already in the right one the cd changes nothing.
    printf '      → run: cd %s && ge init\n' \
      "$(ge_quote "$(dirname -- "$gr_home")")" >&2
    return 1
  fi
  # Asked once, here, rather than six times over inside the list. A file nobody
  # can open is one problem with one fix, and ge remember list walks all six
  # sections, so it answered a chmod with six copies of the same warning.
  if [ ! -r "$GE_REM_FILE" ]; then
    printf 'FAIL  memory.md is there, and ge could not open it to read.\n' >&2
    printf '      Nothing was changed.\n' >&2
    # The retry sits ABOVE the arrow and points down at it. Everything after
    # "→ run: " is the command a founder selects and pastes, so ", then the same
    # command again" was handed to chmod as five more file names and the founder
    # read a second refusal about files that do not exist.
    printf '      Do this, then run the same command again.\n' >&2
    # u+rw and not u+r. A file at 000 handed u+r comes back at 400, and the very
    # next thing ge does with memory.md is write to it, so the founder read a
    # second refusal for one condition. Naming both bits costs a founder who only
    # wanted to list nothing they did not already own, and saves the common path
    # a wasted round trip.
    printf '      → run: chmod u+rw %s\n' "$(ge_quote "$GE_REM_FILE")" >&2
    return 1
  fi
  # Working files live in .state, so a half finished run never leaves a stray
  # file in the folder the founder actually looks at.
  GE_REM_STATE="$gr_home/.state"
  GE_REM_SRC="$GE_REM_STATE/remember.src.$$"
  GE_REM_BODY="$GE_REM_STATE/remember.body.$$"
  return 0
}

ge_rem_cleanup() {
  [ -z "$GE_REM_SRC" ]  || rm -f "$GE_REM_SRC" 2>/dev/null
  [ -z "$GE_REM_BODY" ] || rm -f "$GE_REM_BODY" 2>/dev/null
  return 0
}

# One founder-facing sentence for a folder that will not take a working file.
# Without it the founder's most-used command answered with a path inside the
# plugin, a line number in someone else's code and a file name they have never
# seen, and no way forward at all. The recovery line names the folder that is
# actually stuck, because ge check reports this folder as fine.
ge_rem_no_state() {
  printf 'FAIL  ge keeps its working files in %s, and that folder would not take one.\n' "$GE_REM_STATE" >&2
  printf '      Nothing was changed.\n' >&2
  # The retry sits above the arrow for the same reason as the read one above:
  # what follows "→ run: " is pasted whole, and a clause on the end of it
  # reaches chmod as more file names.
  printf '      Do this, then run the same command again.\n' >&2
  # Quoted by lib/paths.sh rather than by a pair of double quotes written here.
  # Half the folders in this programme are named after a business, so they carry
  # a space, and one that carries a quote mark or a dollar sign broke the line
  # the founder was told to paste.
  printf '      → run: chmod u+w %s\n' "$(ge_quote "$GE_REM_STATE")" >&2
  return 1
}

# One founder-facing sentence for a write that stopped part way. Said in one
# place so the four paths that can reach it cannot drift apart, and so that a
# disk that fills between the probe and the write is answered in a sentence
# rather than in the shell's own words, which name this file, a line number in
# it, and a working file the founder has never heard of. It reads on memory.md
# rather than on the working file, because memory.md is the thing they asked to
# change and nothing about it changed.
ge_rem_no_write() {
  printf 'FAIL  memory.md could not be written, so nothing was changed.\n' >&2
  printf '      ge check shows why the folder cannot be written to.\n' >&2
  printf '      → run: ge check\n' >&2
  return 1
}

# Two windows open on one folder is a founder with two Claude Code sessions, and
# a skill that fans out several ge calls does the same on its own. Without a
# claim both read the block, both write it back, both print "Remembered", and
# one entry is gone with no copy anywhere, not even in the backups.
#
# mkdir is the one claim POSIX guarantees is atomic, so the folder itself is the
# claim and no lock file format has to be invented.
ge_rem_claim() {                        # <home>
  GE_REM_LOCK=''
  grc_lock="$1/.state/memory.lock"
  grc_start=$(now_epoch 2>/dev/null)
  while :; do
    if mkdir "$grc_lock" 2>/dev/null; then
      GE_REM_LOCK=$grc_lock
      grc_now=$(now_epoch 2>/dev/null)
      # The stderr redirect comes before the one that writes, so a folder that
      # goes away underneath this is not answered in the shell's own words.
      printf '%s\n' "$grc_now" 2>/dev/null > "$grc_lock/since"
      return 0
    fi
    # Nothing is holding it and it still could not be made, so the folder itself
    # will not take one. Carry on unclaimed: the write that follows refuses with
    # the true reason, and inventing a busy message here would be a wrong one.
    [ -d "$grc_lock" ] || return 0
    grc_waited=no
    ge_rem_waited_out "$grc_start" && grc_waited=yes
    if ge_rem_claim_stale "$grc_lock" "$grc_waited"; then
      rm -f "$grc_lock/since" 2>/dev/null
      # Only go straight round again if the abandoned claim really did come
      # away. Retrying on a folder that will not be removed would spin here for
      # as long as the founder let it.
      rmdir "$grc_lock" 2>/dev/null && continue
    fi
    [ "$grc_waited" = no ] || break
    ge_rem_nap
  done
  printf 'FAIL  another ge command is writing to memory.md right now, so nothing was changed.\n' >&2
  # A bare arrow: waiting is not a command, and there is nothing for ge to hand
  # over here. It opened on "the", which a founder pasted and was answered about
  # a command called the. Give is not a program and not a shell reserved word.
  printf '      → Give it a moment, then run the same command again.\n' >&2
  return 1
}

# True once the whole wait has gone by. Read off the clock rather than counted in
# tries, because how long each try waits depends on the machine. A clock that
# cannot be read at all gives up rather than waiting for ever.
ge_rem_waited_out() {                   # <the second the wait started>
  gwo_now=$(now_epoch 2>/dev/null)
  case $1       in ''|*[!0-9]*) return 0 ;; esac
  case $gwo_now in ''|*[!0-9]*) return 0 ;; esac
  [ $((gwo_now - $1)) -ge "$GE_REM_WAIT" ]
}

# How long a try waits before the next one. A write to memory.md takes a fraction
# of a second, so waiting a whole one between tries would cap ge at one write a
# second and refuse everything else, which is exactly what a skill firing several
# ge calls at once would hit. A fraction is not in the standard, so the first
# wait finds out whether this machine takes one and every wait after it uses the
# answer. Nothing waits at all unless two commands really are writing at once.
GE_REM_NAP=''

ge_rem_nap() {
  if [ -z "$GE_REM_NAP" ]; then
    if sleep 0.2 2>/dev/null; then
      GE_REM_NAP=0.2
    else
      GE_REM_NAP=1
      sleep 1
    fi
    return 0
  fi
  sleep "$GE_REM_NAP" 2>/dev/null || sleep 1
}

# A machine put to sleep part way through, or a window closed. The stderr
# redirect comes before the one that reads the file, because the other way round
# the shell's own complaint about a file that is not there goes to the founder.
ge_rem_claim_stale() {                  # <the claim folder> <yes if the whole wait has gone by>
  gcs_since=''
  [ ! -f "$1/since" ] || gcs_since=$(tr -d '\r' 2>/dev/null < "$1/since" | sed -n '1p')
  case $gcs_since in
    ''|*[!0-9]*)
      # No time on it, or one that cannot be read as a time. That is also what a
      # live claim looks like in the instant between being made and being
      # stamped, and treating it as abandoned meant one run took the claim out
      # from under another that was already writing. So it only counts as
      # abandoned once the whole wait has gone by and still nothing has stamped it.
      [ "$2" = yes ] && return 0
      return 1 ;;
  esac
  gcs_now=$(now_epoch 2>/dev/null)
  case $gcs_now in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ $((gcs_now - gcs_since)) -ge "$GE_REM_STALE" ]
}

ge_rem_release() {
  [ -n "$GE_REM_LOCK" ] || return 0
  rm -f "$GE_REM_LOCK/since" 2>/dev/null
  rmdir "$GE_REM_LOCK" 2>/dev/null
  GE_REM_LOCK=''
  return 0
}

# ctrl-c during a write to a large memory.md otherwise left ge's working files
# sitting in the folder for ever, and left the claim standing, which would refuse
# the next ge remember for half a minute for no reason a founder could see.
#
# Interrupts only, never EXIT: ge.sh owns the exit trap, it is what answers a
# damaged install, and a second trap on the same signal replaces the first.
trap 'ge_rem_cleanup; ge_rem_release; exit 130' INT HUP TERM

# 0 the block is there, 2 it is absent, 1 it is half marked and already reported.
#
# The sentence and the recovery both come from lib/blocks.sh, which tells the
# eight shapes apart and has an answer for each. The text here used to say a
# START marker had no matching END, whatever was actually in the file, and hand
# out the one fix that suits only one of those shapes. A founder who had copied a
# whole section out to ask about it, or whose sync client had merged two copies,
# held two START lines and two END lines, was told to add a third END, did it,
# and got the same refusal back word for word. Following that line made the file
# harder to repair every time it was followed.
ge_rem_block_state() {
  block_check "$GE_REM_FILE" "$1"
  gr_bc=$?
  [ "$gr_bc" -eq 0 ] && return 0
  [ "$gr_bc" -eq 1 ] && return 2
  printf 'FAIL  memory.md %s\n' "$(block_problem "$GE_REM_FILE" "$1")" >&2
  printf '      Nothing was written. Guessing where that section starts and stops could delete your own writing.\n' >&2
  # block_fix_line, never a hard coded "→ run: " with block_fix behind it. Five
  # of the eight shapes have no command at all, and only blocks.sh knows which
  # shape this file is in. Printed the old way, "put the END marker back where
  # that section stops" arrived after "→ run: ", a founder pasted it, and the
  # marker was read as a redirection under sh and a syntax error under dash.
  printf '      Do this, then run the same command again.\n' >&2
  block_fix_line "$GE_REM_FILE" "$1" '      ' >&2
  return 1
}

# Fail-closed, exactly as B-03 asks for. The snapshot of a file that does not
# exist is a success and a no-op, so a first write is never blocked.
#
# ge snapshot writes a refusal of its own on stderr. It is dropped rather than
# passed through, because two FAIL blocks for one failure read as two separate
# problems. The refusal below says the same thing in memory.md's own terms, and
# its recovery line hands the founder to ge check, which is where the snapshot
# folder and the reason it cannot be written to get printed.
ge_rem_snapshot() {
  sh "$GE_HOME_DIR/scripts/ge.sh" snapshot memory.md >/dev/null 2>/dev/null && return 0
  printf 'FAIL  memory.md could not be backed up, so nothing was changed.\n' >&2
  # The backup folder is what refused, and ge is holding its path, so it names
  # the chmod itself rather than sending the founder to the doctor to be told
  # the same thing one step later.
  ge_backup_refusal "${GE_REM_FILE%/*}/.state/snapshots" >&2
  return 1
}

# The block contents, oldest line first, which is the order they sit in the file.
#
# Asked before the redirect that matters. A folder locked mid sync is the common
# case, and the shell answers a failed redirect in its own words: the path to
# this file, the line number of the redirect and the working file name. Three
# things a founder must never be shown, and no sentence of ours at all. The
# group carries the stderr redirect so the second attempt cannot leak it either.
ge_rem_load() {
  true 2>/dev/null > "$GE_REM_SRC" || { ge_rem_no_state; return 1; }
  { block_read "$GE_REM_FILE" "$1" > "$GE_REM_SRC"; } 2>/dev/null && return 0
  # block_read is silent on both of the ways it fails, and every caller here used
  # to return 1 with it. A verb that stops with nothing at all on the screen
  # leaves the founder running the same command again, and each run of the two
  # that write spends another backup slot before it gets here.
  printf 'FAIL  memory.md could not be read, so nothing was changed.\n' >&2
  printf '      ge check shows whether the folder can be read.\n' >&2
  printf '      → run: ge check\n' >&2
  return 1
}

ge_rem_count() {
  awk 'END { print NR }' "$GE_REM_SRC"
}

# Builds one entry line. The date is the founder's own day, because that is the
# day they will look for when they come back to it.
ge_rem_entry() {
  gr_entry="- $1 $2"
  [ -n "$3" ] && gr_entry="$gr_entry$GE_REM_DETAIL$3)"
  printf '%s\n' "$gr_entry"
}

ge_rem_add() {
  gr_type=${1:-}
  if [ -z "$gr_type" ]; then
    ge_rem_usage >&2
    printf '      → run: ge remember decision "what you decided, and why"\n' >&2
    return 1
  fi
  ge_rem_check_type "$gr_type" || return 1
  shift
  gr_text=${1:-}
  [ $# -gt 0 ] && shift
  gr_detail=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --detail)
        shift
        if [ $# -eq 0 ]; then
          printf 'FAIL  --detail was given with nothing after it.\n' >&2
          printf '      → run: ge remember %s "your text" --detail "ops-log.md %s"\n' \
            "$gr_type" "$(today_iso)" >&2
          return 1
        fi
        gr_detail=$1
        shift ;;
      *)
        printf 'FAIL  ge remember does not understand "%s".\n' "$1" >&2
        printf '      → run: ge remember %s "your text" --detail "ops-log.md %s"\n' \
          "$gr_type" "$(today_iso)" >&2
        return 1 ;;
    esac
  done

  if [ -z "$gr_text" ]; then
    printf 'FAIL  there is nothing to remember. The text was empty.\n' >&2
    printf '      → run: ge remember %s "what you want to keep"\n' "$gr_type" >&2
    return 1
  fi
  ge_rem_value_ok "$gr_text" 'text' || return 1
  ge_rem_value_ok "$gr_detail" 'detail pointer' || return 1

  gr_b=$(ge_rem_block "$gr_type")
  ge_rem_block_state "$gr_b"
  gr_state=$?
  [ "$gr_state" -eq 1 ] && return 1

  ge_rem_snapshot || return 1

  if [ "$gr_state" -eq 2 ]; then
    block_ensure "$GE_REM_FILE" "$gr_b" "$(ge_rem_heading "$gr_type")" || return 1
  fi

  ge_rem_load "$gr_b" || { ge_rem_cleanup; return 1; }
  # The day is read once and used twice, so the line that goes into the file and
  # the line read back on the screen are the same string even for a founder
  # working through midnight. It is read outside the group below because that
  # group throws its standard error away.
  gr_today=$(today_iso)
  # Guarded, because a disk that fills between the probe in ge_rem_load and this
  # line is answered by the shell in its own words otherwise: this file, the line
  # number of the redirect, and the working file name.
  { ge_rem_entry "$gr_today" "$gr_text" "$gr_detail" >> "$GE_REM_SRC"; } 2>/dev/null || {
    ge_rem_no_write
    ge_rem_cleanup
    return 1
  }
  block_write "$GE_REM_FILE" "$gr_b" "$GE_REM_SRC" || { ge_rem_cleanup; return 1; }
  ge_rem_cleanup

  printf 'Remembered under %s:\n' "$(ge_rem_heading "$gr_type")"
  printf '  %s %s' "$gr_today" "$gr_text"
  [ -n "$gr_detail" ] && printf '%s%s)' "$GE_REM_DETAIL" "$gr_detail"
  printf '\n'
}

ge_rem_list() {
  gr_only=${1:-}
  if [ -n "$gr_only" ]; then
    ge_rem_check_type "$gr_only" || return 1
    gr_kinds=$gr_only
    gr_wide=no
  else
    gr_kinds=$GE_REM_TYPES
    gr_wide=yes
  fi
  gr_shown=0
  gr_skipped=0
  for gr_k in $gr_kinds; do
    gr_b=$(ge_rem_block "$gr_k")
    block_check "$GE_REM_FILE" "$gr_b"
    gr_bc=$?
    if [ "$gr_bc" -eq 2 ]; then
      # Counted, so the empty-state note below cannot follow this and tell the
      # founder their memory is empty while the entries sit in the file. That
      # pair read as two separate problems and neither of them was the real one.
      #
      # The sentence and the recovery come from lib/blocks.sh, which tells the
      # eight shapes apart. This used to call every one of them a start marker
      # with no END and send the founder off to add another END line.
      gr_skipped=$((gr_skipped + 1))
      printf 'WARN  memory.md %s\n' "$(block_problem "$GE_REM_FILE" "$gr_b")" >&2
      printf '      Your %s entries are still in the file.\n' "$(ge_rem_heading "$gr_k")" >&2
      printf '      They are left out of this list because ge cannot tell where that section starts and stops.\n' >&2
      # block_fix_line, so a shape with no command is shown as an action rather
      # than in the slot a founder pastes from. Nothing is being written here,
      # so there is no retry line above it: the sentence above already says why
      # the section is missing from the list.
      block_fix_line "$GE_REM_FILE" "$gr_b" '      ' >&2
      continue
    fi
    [ "$gr_bc" -eq 0 ] || continue
    # Held in a variable rather than a working file, because listing changes
    # nothing and had no business needing a folder it could write to. It used to,
    # and a folder gone read only while a sync client reconciled it answered the
    # one command every other error message points at with a raw shell error.
    #
    # The x is put on and taken off so that a trailing blank line inside the
    # block survives, which keeps these numbers the same as the ones forget and
    # amend count with. Entries cannot hold a line break, so this stays small.
    gr_body=$(block_read "$GE_REM_FILE" "$gr_b"; printf 'x')
    gr_body=${gr_body%x}
    gr_n=$(printf '%s' "$gr_body" | wc -l | tr -d ' ')
    [ "$gr_n" -gt 0 ] || continue
    gr_shown=$((gr_shown + gr_n))
    # Newest first, because the last thing learned is the thing being asked about.
    printf '%s' "$gr_body" |
      awk '{ a[NR] = $0 } END { for (i = NR; i > 0; i = i - 1) print a[i] }' |
      { gr_i=0
        while IFS= read -r gr_line; do
          gr_i=$((gr_i + 1))
          if [ "$gr_wide" = yes ]; then
            printf '%-8s %2d  %s\n' "$gr_k" "$gr_i" "${gr_line#- }"
          else
            printf '%2d  %s\n' "$gr_i" "${gr_line#- }"
          fi
        done; }
  done
  # The empty-state note goes to stderr so that stdout stays entries and only
  # entries, which is what a skill counting them is relying on.
  #
  # Not said at all when a section was skipped above. Nothing here reads a
  # section it could not find the end of, so an empty screen is not proof of an
  # empty memory, and saying it was empty was flatly untrue on a file that held
  # every entry the founder had written.
  if [ "$gr_shown" -eq 0 ] && [ "$gr_skipped" -eq 0 ]; then
    if [ "$gr_wide" = yes ]; then
      printf 'Nothing is remembered yet.\n' >&2
      printf '      → run: ge remember decision "what you decided, and why"\n' >&2
    else
      printf 'Nothing is remembered under %s yet.\n' "$(ge_rem_heading "$gr_only")" >&2
      printf '      → run: ge remember %s "what you want to keep"\n' "$gr_only" >&2
    fi
  fi
  return 0
}

# Puts the block in $GE_REM_SRC and works out which line in it entry <n> is,
# counting from the newest. list, forget and amend all number the same way
# because they all come through here.
ge_rem_locate() {
  gr_type=$1; gr_num=$2
  gr_b=$(ge_rem_block "$gr_type")
  ge_rem_block_state "$gr_b"
  gr_state=$?
  [ "$gr_state" -eq 1 ] && return 1
  if [ "$gr_state" -eq 2 ]; then
    # The heading, not the marker name. DECISIONS is ge's own word for it, and
    # the founder reading memory.md sees Decisions.
    #
    # The recovery comes from lib/blocks.sh. It used to name ge init, and ge init
    # keeps a memory.md that is already there rather than seeding it again, so a
    # founder who ran it was told "kept memory.md", found the section still
    # missing, and came straight back to this same refusal.
    printf 'FAIL  memory.md has no %s section, so there is no entry %s to change.\n' \
      "$(ge_rem_heading "$gr_type")" "$gr_num" >&2
    # block_fix_line for the same reason as the other two: this shape has no
    # command behind it, and putting the two marker lines back is one edit only
    # the founder can place, because only they know where the section stops.
    printf '      Do this, then run the same command again.\n' >&2
    block_fix_line "$GE_REM_FILE" "$gr_b" '      ' >&2
    return 1
  fi
  ge_rem_load "$gr_b" || { ge_rem_cleanup; return 1; }
  gr_total=$(ge_rem_count)
  if [ "$gr_total" -lt "$gr_num" ]; then
    if [ "$gr_total" -eq 0 ]; then
      printf 'FAIL  there are no %s entries yet, so there is no entry %s.\n' "$gr_type" "$gr_num" >&2
    else
      printf 'FAIL  there is no %s entry %s. There are %s.\n' "$gr_type" "$gr_num" "$gr_total" >&2
    fi
    printf '      → run: ge remember list %s\n' "$gr_type" >&2
    ge_rem_cleanup
    return 1
  fi
  gr_pos=$((gr_total - gr_num + 1))
  return 0
}

ge_rem_forget() {
  gr_type=${1:-}; gr_num=${2:-}
  if [ -z "$gr_type" ] || [ -z "$gr_num" ] || [ $# -gt 2 ]; then
    printf 'FAIL  forget needs a kind and an entry number.\n' >&2
    printf '      → run: ge remember forget decision 1\n' >&2
    return 1
  fi
  ge_rem_check_type "$gr_type" || return 1
  ge_rem_number_ok "$gr_num" || return 1
  ge_rem_locate "$gr_type" "$gr_num" || return 1

  ge_rem_snapshot || { ge_rem_cleanup; return 1; }

  gr_i=0
  gr_gone=''
  # Not ": >": a failed redirect on a special built-in ends the whole shell under
  # dash, which is /bin/sh on most Linux, so the founder would get one raw line
  # and never see the refusal below. "true" is a regular built-in and returns 1.
  true 2>/dev/null > "$GE_REM_BODY" || { ge_rem_no_write; ge_rem_cleanup; return 1; }
  # The whole loop carries the stderr redirect, and a line that would not write
  # is remembered rather than reported on the spot. A disk that fills here used
  # to print one raw shell line per entry, so a founder with forty of them got
  # forty of those and no sentence of ours at all.
  gr_ok=1
  while IFS= read -r gr_line; do
    gr_i=$((gr_i + 1))
    if [ "$gr_i" -eq "$gr_pos" ]; then
      gr_gone=$gr_line
    else
      printf '%s\n' "$gr_line" >> "$GE_REM_BODY" || gr_ok=0
    fi
  done < "$GE_REM_SRC" 2>/dev/null
  [ "$gr_ok" -eq 1 ] || { ge_rem_no_write; ge_rem_cleanup; return 1; }

  block_write "$GE_REM_FILE" "$(ge_rem_block "$gr_type")" "$GE_REM_BODY" || { ge_rem_cleanup; return 1; }
  ge_rem_cleanup
  printf 'Forgotten from %s:\n' "$(ge_rem_heading "$gr_type")"
  printf '  %s\n' "${gr_gone#- }"
  printf 'If that was the wrong one, run: ge undo\n'
}

# The hold rule. An entry ge did not write is an entry a founder reworded, and
# writing over it would leave two lines that disagree and no way to tell which
# one is current. So it is held, and the founder is told what was expected.
ge_rem_hold() {
  printf 'FAIL  %s, so nothing was changed.\n' "$1" >&2
  printf '      looked for: %s\n' "$2" >&2
  printf '      found:      %s\n' "$3" >&2
  printf '      The list shows the line as it reads now. Edit it by hand, or use ge remember forget.\n' >&2
  printf '      → run: ge remember list %s\n' "$4" >&2
  return 1
}

ge_rem_amend() {
  gr_type=${1:-}; gr_num=${2:-}
  if [ -z "$gr_type" ] || [ -z "$gr_num" ] || [ $# -lt 3 ]; then
    printf 'FAIL  amend needs a kind, an entry number and the new text.\n' >&2
    printf '      → run: ge remember --amend decision 1 "what it should say now"\n' >&2
    return 1
  fi
  ge_rem_check_type "$gr_type" || return 1
  ge_rem_number_ok "$gr_num" || return 1
  shift 2
  gr_text=$1
  shift
  gr_detail=''
  gr_detail_given=no
  gr_expect=''
  gr_expect_given=no
  while [ $# -gt 0 ]; do
    case "$1" in
      --detail)
        shift
        [ $# -gt 0 ] || { printf 'FAIL  --detail was given with nothing after it.\n' >&2
                          printf '      → run: ge remember --amend %s %s "new text" --detail "ops-log.md %s"\n' \
                            "$gr_type" "$gr_num" "$(today_iso)" >&2
                          return 1; }
        gr_detail=$1; gr_detail_given=yes; shift ;;
      --expect)
        shift
        [ $# -gt 0 ] || { printf 'FAIL  --expect was given with nothing after it.\n' >&2
                          printf '      The words to give it are the entry text after the date.\n' >&2
                          printf '      → run: ge remember list %s\n' "$gr_type" >&2
                          return 1; }
        gr_expect=$1; gr_expect_given=yes; shift ;;
      *)
        printf 'FAIL  ge remember --amend does not understand "%s".\n' "$1" >&2
        printf '      → run: ge remember --amend %s %s "what it should say now"\n' "$gr_type" "$gr_num" >&2
        return 1 ;;
    esac
  done

  if [ -z "$gr_text" ]; then
    printf 'FAIL  the new text was empty, so nothing was changed.\n' >&2
    printf '      → run: ge remember --amend %s %s "what it should say now"\n' "$gr_type" "$gr_num" >&2
    return 1
  fi
  ge_rem_value_ok "$gr_text" 'text' || return 1
  ge_rem_value_ok "$gr_detail" 'detail pointer' || return 1

  ge_rem_locate "$gr_type" "$gr_num" || return 1

  gr_i=0
  gr_old=''
  while IFS= read -r gr_line; do
    gr_i=$((gr_i + 1))
    [ "$gr_i" -eq "$gr_pos" ] && gr_old=$gr_line
  done < "$GE_REM_SRC"

  # The anchor, matched byte for byte: "- ", a date, a space. A near miss is a
  # miss. This never falls back to appending.
  case "$gr_old" in
    '- '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' '*) ;;
    *)
      ge_rem_cleanup
      ge_rem_hold \
        "entry $gr_num under $(ge_rem_heading "$gr_type") is not in the shape ge wrote it" \
        '- YYYY-MM-DD <text>' "$gr_old" "$gr_type"
      return 1 ;;
  esac

  gr_rest=${gr_old#- }
  gr_date=${gr_rest%% *}
  gr_body_text=${gr_rest#* }
  # Only a clause ge itself wrote counts: the last marker on the line, closed by
  # the bracket that ends the entry. The marker is a string ge prints, so a
  # founder who pastes a listed entry back in is carrying it inside their own
  # prose. Reading that as structure rewrites their words and leaves a stray
  # bracket, so a marker with anything after its clause is just text.
  case "$gr_body_text" in
    *"$GE_REM_DETAIL"*')')
      gr_old_text=${gr_body_text%"$GE_REM_DETAIL"*}
      gr_old_ptr=${gr_body_text##*"$GE_REM_DETAIL"}
      gr_old_ptr=${gr_old_ptr%)} ;;
    *)
      gr_old_text=$gr_body_text
      gr_old_ptr='' ;;
  esac

  # The hold rule, and it is the rule rather than an option. Section 08 puts it
  # plainly: the text has to match byte for byte or nothing is written. Position
  # is not proof of anything. A founder rewords entry 1 by hand in the morning, a
  # skill amends "entry 1" in the afternoon, and without this their wording is
  # gone with nothing said and nothing pointing at the way back.
  #
  # The words are printed on a line of their own rather than pasted into the
  # command below, because an entry can hold a quote mark or a dollar sign and a
  # recovery line that does not run is worse than none.
  if [ "$gr_expect_given" != yes ]; then
    ge_rem_cleanup
    printf 'FAIL  an amend has to say what the entry reads now, so nothing was changed.\n' >&2
    printf '      it reads now: %s\n' "$gr_old_text" >&2
    printf '      The list prints the words to give --expect.\n' >&2
    printf '      → run: ge remember list %s\n' "$gr_type" >&2
    return 1
  fi

  # The same rule against text the caller states outright. A skill that read the
  # entry five minutes ago proves here that it is still the same one.
  if [ "$gr_expect" != "$gr_old_text" ]; then
    ge_rem_cleanup
    ge_rem_hold \
      "entry $gr_num under $(ge_rem_heading "$gr_type") does not say what you expected it to say" \
      "$gr_expect" "$gr_old_text" "$gr_type"
    return 1
  fi

  # The pointer is kept unless a new one is given, because rewording a line is
  # not a reason to lose where its detail lives.
  [ "$gr_detail_given" = yes ] || gr_detail=$gr_old_ptr

  ge_rem_snapshot || { ge_rem_cleanup; return 1; }

  gr_i=0
  # Not ": >": a failed redirect on a special built-in ends the whole shell under
  # dash, which is /bin/sh on most Linux, so the founder would get one raw line
  # and never see the refusal below. "true" is a regular built-in and returns 1.
  true 2>/dev/null > "$GE_REM_BODY" || { ge_rem_no_write; ge_rem_cleanup; return 1; }
  # The whole loop carries the stderr redirect, for the reason ge_rem_forget
  # carries one: a disk that fills here printed one raw shell line per entry,
  # naming this file, a line number in it and a working file, and not one
  # sentence a founder could act on.
  gr_ok=1
  while IFS= read -r gr_line; do
    gr_i=$((gr_i + 1))
    if [ "$gr_i" -eq "$gr_pos" ]; then
      ge_rem_entry "$gr_date" "$gr_text" "$gr_detail" >> "$GE_REM_BODY" || gr_ok=0
    else
      printf '%s\n' "$gr_line" >> "$GE_REM_BODY" || gr_ok=0
    fi
  done < "$GE_REM_SRC" 2>/dev/null
  [ "$gr_ok" -eq 1 ] || { ge_rem_no_write; ge_rem_cleanup; return 1; }

  block_write "$GE_REM_FILE" "$(ge_rem_block "$gr_type")" "$GE_REM_BODY" || { ge_rem_cleanup; return 1; }
  ge_rem_cleanup
  printf 'Amended entry %s under %s.\n' "$gr_num" "$(ge_rem_heading "$gr_type")"
  printf '  was: %s\n' "$gr_old_text"
  printf '  now: %s\n' "$gr_text"
}

# The three verbs that write, run one at a time. Every one of them reads the
# block, changes it and writes the whole block back, so two at once is one entry
# thrown away. list only reads, and a read is safe beside a write because the
# file is replaced whole, in one move.
ge_rem_write_verb() {                   # <function> <its arguments...>
  grw_fn=$1
  shift
  ge_rem_claim "$gr_home" || return 1
  "$grw_fn" "$@"
  grw_rc=$?
  ge_rem_release
  return $grw_rc
}

ge_remember_main() {
  case "${1:-}" in
    '')
      ge_rem_usage >&2
      printf '      → run: ge remember decision "what you decided, and why"\n' >&2
      return 1 ;;
    help|-h|--help)
      ge_rem_usage ;;
    list)
      shift; ge_rem_open || return 1; ge_rem_list "$@" ;;
    forget)
      shift; ge_rem_open || return 1; ge_rem_write_verb ge_rem_forget "$@" ;;
    --amend|amend)
      shift; ge_rem_open || return 1; ge_rem_write_verb ge_rem_amend "$@" ;;
    *)
      ge_rem_open || return 1; ge_rem_write_verb ge_rem_add "$@" ;;
  esac
}

ge_remember_main "$@"
