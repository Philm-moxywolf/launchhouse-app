#!/bin/sh
# blocks.sh: managed blocks, the parts of a file ge owns inside a file a founder edits.
#
# WHY IT EXISTS: one writer per file and founders editing their own files are
#                both true, and without markers only one of them can be. ge
#                writes only between a marker pair. Everything outside belongs
#                to the founder and is never touched, moved or reflowed. That
#                includes the line endings their editor gave those lines and a
#                last line they left without one.
# CALLED BY:     ge remember, ge person, and any skill writing into a shared file
# READS:         the target file    WRITES: only between its own markers
# POSTURE:       fail-closed. Anything other than one start line above one end
#                line is a damaged file, and guessing where the block ends is how
#                a founder loses a paragraph. A write that cannot read the body
#                it was handed refuses as well, because an empty block reported
#                as a success is the worst outcome of the lot. A file the founder
#                marked read only refuses too: a rename asks the folder and never
#                the file, so that one used to go through and take their read
#                only bit with it. Both halves of that are lib/paths.sh's now.
#                ge_may_replace decides, in the same words every other verb uses,
#                and ge_keep_mode carries the founder's own permissions onto the
#                file that lands. A write ge agreed to never changes who can read
#                the names and addresses in their file.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Markers matched after \r strip.
#                Every value awk needs goes through the environment and ENVIRON,
#                never through -v: -v reads a backslash in the value as an escape
#                and hands awk a different string than the one it was given.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE.
#                Two shapes end on "→ run: " and a command that pastes into a
#                terminal and runs. The five damaged ones end on a bare "→ " and
#                one named thing the founder does in their own editor, because
#                only they know where their own section stops. So the arrow-run
#                form always means pasteable, and guidance looks different on the
#                screen as well as to anything reading the output. block_fix
#                gives the text, block_fix_kind says which of the two it is, and
#                block_fix_line prints the whole line, arrow and all, either way.
#                CALLERS OUTSIDE THIS FILE MUST USE block_fix_line. Printing
#                block_fix after a hard coded "→ run: " puts an instruction in
#                the slot a command belongs in, which is the fault this shape
#                exists to end.
set -u

# The marker pair, byte exact. A near miss is a missing block, not a fuzzy match.
block_start() { printf '<!-- GE:%s:START -->' "$1"; }
block_end()   { printf '<!-- GE:%s:END -->' "$1"; }

# block_scan <file> <name>: prints "<shape> <starts> <ends>" and returns what
# block_check returns. One pass over the file, so the counts a founder is shown
# are the counts the refusal was decided on.
#
# The shapes, and why each one is told apart from the others: the repair differs
# for every one of them, and a single message covering them all sent a founder
# with two of each line off to add a third end line.
#
#   ok          one start line above one end line
#   none        neither line is in the file
#   missing     the file is not there
#   unreadable  the file is there and could not be read
#   lone-start  one start line, no end line
#   lone-end    one end line, no start line
#   reversed    one of each, with the end line above the start line
#   repeated    more than one of either line
#
# A marker counts only as a WHOLE line, after a carriage return is taken off the
# end. This used to count it as a substring of any line, while block_write has
# always matched the whole line, so the two disagreed: a founder note quoting a
# marker made this report the file sound, and the write that followed then found
# no marker to write between and dropped the entry with nothing said. Every
# function here now uses the one definition.
block_scan() {
  bk_f=$1; bk_n=$2
  if [ ! -f "$bk_f" ]; then printf 'missing 0 0\n'; return 1; fi
  if [ ! -r "$bk_f" ]; then printf 'unreadable 0 0\n'; return 2; fi
  GE_BLOCK_S=$(block_start "$bk_n") \
  GE_BLOCK_E=$(block_end "$bk_n") \
  awk '
    BEGIN {
      s = ENVIRON["GE_BLOCK_S"]
      e = ENVIRON["GE_BLOCK_E"]
    }
    { line = $0; sub(/\r$/, "", line) }
    line == s { starts = starts + 1; if (first == "") first = "s" }
    line == e { ends = ends + 1;     if (first == "") first = "e" }
    END {
      starts = starts + 0
      ends = ends + 0
      rc = 2
      if (starts == 0 && ends == 0)    { shape = "none";       rc = 1 }
      else if (starts > 1 || ends > 1) { shape = "repeated" }
      else if (ends == 0)              { shape = "lone-start" }
      else if (starts == 0)            { shape = "lone-end" }
      else if (first == "e")           { shape = "reversed" }
      else                             { shape = "ok";         rc = 0 }
      printf "%s %d %d\n", shape, starts, ends
      exit rc
    }
  ' "$bk_f" 2>/dev/null
}

# block_check <file> <name>: 0 one start above one end, 1 neither line, 2 a shape
# that must never be repaired by guessing. The three codes are what they have
# always been, so nothing that calls this changes.
#
# What has changed is which files land on 2. An end line sitting ABOVE a start
# line used to pass as sound, and the write that followed then dropped every
# line from the start marker to the bottom of the file, the founder's own
# paragraphs included, and said it had saved.
block_check() {
  block_scan "$1" "$2" > /dev/null
}

# block_tally <count> <line>: "no X lines", "one X line", "3 X lines".
block_tally() {
  case $1 in
    0) printf 'no %s lines' "$2" ;;
    1) printf 'one %s line' "$2" ;;
    *) printf '%s %s lines' "$1" "$2" ;;
  esac
}

# block_problem <file> <name>: one plain sentence naming what is actually in the
# file, counts and all. The caller puts the file name in front of it, because
# some of them say memory.md and some say people/sam-acme-com.md.
#
# It is here rather than in each command so that every refusal describes the
# same file the same way, and so no command has to guess the shape from a return
# code that cannot carry it.
block_problem() {
  bp_out=$(block_scan "$1" "$2")
  bp_shape=${bp_out%% *}
  bp_rest=${bp_out#* }
  bp_starts=${bp_rest%% *}
  bp_ends=${bp_rest##* }
  case $bp_shape in
    missing)
      printf 'is not there.\n' ;;
    reversed)
      printf 'holds the %s line below the %s line, which is the wrong way round.\n' \
        "$(block_start "$2")" "$(block_end "$2")" ;;
    none|lone-start|lone-end|repeated|ok)
      printf 'holds %s and %s.\n' \
        "$(block_tally "$bp_starts" "$(block_start "$2")")" \
        "$(block_tally "$bp_ends" "$(block_end "$2")")" ;;
    *)
      printf 'could not be read.\n' ;;
  esac
}

# block_fix <file> <name>: the recovery for the shape that is actually there.
# Every branch has been walked through on a real file: following it leaves the
# file in a state ge can write to.
#
# WHAT COMES BACK IS ONE OF TWO THINGS, and block_fix_kind says which.
#
#   a command   pastes into a terminal and runs, and NOTHING else is in it. No
#               comma, no "then this", no "which does that". A founder selects
#               the whole line and pastes the whole line, so a clause riding
#               after the command is pasted too: "ge init, if this is the folder"
#               reaches ge as a command called "init," and ge answers that it has
#               no such thing. Anything worth saying alongside goes on a line of
#               its own, which block_refuse and ge lint both have room for.
#   an action   one named thing the founder does in their own editor. NOT a
#               command, never printed after "→ run: ", and worded so it cannot
#               be mistaken for one: it opens on a word that is not a program and
#               not a shell keyword, so a founder who pastes it anyway gets one
#               "not found" and nothing is opened, redirected or expanded.
#
#               THE FIRST WORD IS PART OF THE CONTRACT. Two of them have already
#               been wrong here. "open" is a program on every Mac in the room, so
#               that line ran. "in" is a reserved word, so a line beginning with
#               it is a syntax error under sh and under dash, which is the same
#               dead end in different clothes. Checked with command -v under a
#               real sh and a real dash, never under the zsh a terminal opens
#               with: zsh answers no for "in" and both of the others answer yes.
#               put, delete, keep, take and give are the ones in use here.
#
# TWO of the seven are a command. FIVE are an action, and that is a decision
# rather than an omission, so it is written down here. There is no verb in ge
# that repairs a marker pair, and there is no shell line that could stand in for
# one: putting a marker back is one edit, and only the founder knows where their
# own section stops. Every place ge could put it by itself is worse than asking:
#
#   at the bottom of the file  the block then runs down over every section below
#                              it, and the next write replaces the lot
#   under the start line       the block is sound and empty, and everything they
#                              had written in it is left outside it, where ge
#                              context, ge lint and the skills no longer see it
#   above the next marker      their own heading, and any writing above it, come
#                              inside the block and the next write replaces them
#
# So those five say the one thing to do, in words, and they are printed after a
# bare arrow rather than after "→ run: ". The line this replaced was printed
# after "→ run: " and was not a command at all: it opened on the word open, which
# IS a program, and carried a bare marker, so a founder who pasted it had the
# marker read as a redirection under sh and a syntax error under dash. Every path
# and every marker goes through ge_quote either way, so nothing here is ever
# broken into pieces by a space, an apostrophe or a backslash in a folder name.
block_fix() {
  bx_out=$(block_scan "$1" "$2")
  bx_shape=${bx_out%% *}
  case $bx_shape in
    missing)
      printf 'ge init\n' ;;
    unreadable)
      # The file is there and will not open, so the folder around it is fine and
      # the doctor would only repeat what this already knows. Named here with the
      # chmod that clears it, the way ge receipt answers the same condition.
      printf 'chmod u+r %s\n' "$(ge_quote "$1")" ;;
    none)
      printf 'put %s above that section in %s, and %s below it\n' \
        "$(ge_quote "$(block_start "$2")")" "$(ge_quote "$1")" \
        "$(ge_quote "$(block_end "$2")")" ;;
    lone-start)
      printf 'put %s back on its own line in %s, where that section stops\n' \
        "$(ge_quote "$(block_end "$2")")" "$(ge_quote "$1")" ;;
    lone-end)
      printf 'delete that %s line from %s, or put %s back above the section it closes\n' \
        "$(ge_quote "$(block_end "$2")")" "$(ge_quote "$1")" \
        "$(ge_quote "$(block_start "$2")")" ;;
    reversed)
      printf 'put %s back above that section in %s, and %s back below it\n' \
        "$(ge_quote "$(block_start "$2")")" "$(ge_quote "$1")" \
        "$(ge_quote "$(block_end "$2")")" ;;
    repeated)
      printf 'keep one %s line above that section in %s and one %s line below it, and delete the rest\n' \
        "$(ge_quote "$(block_start "$2")")" "$(ge_quote "$1")" \
        "$(ge_quote "$(block_end "$2")")" ;;
    *)
      # Only reachable when block_scan itself could not answer, so ge cannot name
      # what is in the way and the doctor is the honest next step.
      printf 'ge check\n' ;;
  esac
}

# block_fix_kind <file> <name>: "command" when block_fix came back with something
# a founder can paste and run, "action" when it came back with the one thing they
# have to do in their editor. Here so that a caller printing a report, rather than
# a single refusal, can put an action on a line of its own instead of in the slot
# a command belongs in. Anything printing a single refusal wants block_fix_line
# below, which asks this and prints the right arrow for the answer.
block_fix_kind() {
  bfk_out=$(block_scan "$1" "$2")
  # The five are listed rather than the two, because a shape this does not know
  # falls through to the branch of block_fix that names ge check, and calling
  # that an action would be the wrong way round.
  case ${bfk_out%% *} in
    none|lone-start|lone-end|reversed|repeated) printf 'action\n' ;;
    *)                                          printf 'command\n' ;;
  esac
}

# block_fix_line <file> <name> <the spaces in front>: the whole recovery line,
# arrow and all, in the one shape that cannot be misread.
#
# THE ONLY SUPPORTED WAY TO PRINT block_fix. A caller that writes its own
# "→ run: " in front of it has to decide the kind for itself, and every caller
# that ever did got it wrong: an instruction was printed in the slot a command
# belongs in, a founder pasted it, and the shell answered about punctuation.
# Here the two are told apart once and printed differently, so "→ run: " on the
# screen always means a line that pastes and runs, and a bare "→ " always means
# something to do by hand.
#
# The spaces in front are passed in rather than fixed, because a refusal indents
# its recovery line by six and ge lint indents its own by two.
block_fix_line() {                      # <file> <name> <the spaces in front>
  bfl_f=$1; bfl_n=$2; bfl_pad=$3
  if [ "$(block_fix_kind "$bfl_f" "$bfl_n")" = command ]; then
    printf '%s→ run: %s\n' "$bfl_pad" "$(block_fix "$bfl_f" "$bfl_n")"
  else
    printf '%s→ %s\n' "$bfl_pad" "$(block_fix "$bfl_f" "$bfl_n")"
  fi
}

# block_refuse <file> <name>: the four founder-facing lines, once, so that a
# refusal from here reads the same as a refusal from anywhere else.
#
# The middle line follows the SHAPE, not the return code. Both a damaged block
# and a file that will not open come back as 2, and a file that will not open
# answered with a sentence about guessing where a section stops reads as ge
# talking about something else entirely. The code the caller already has is no
# longer passed in for that reason: it cannot tell those two apart.
block_refuse() {
  bq_f=$1; bq_n=$2
  bq_out=$(block_scan "$bq_f" "$bq_n")
  printf 'FAIL  %s %s\n' "$bq_f" "$(block_problem "$bq_f" "$bq_n")" >&2
  case ${bq_out%% *} in
    lone-start|lone-end|reversed|repeated)
      printf '      Nothing was written. Guessing where that section starts and stops could delete your own writing.\n' >&2 ;;
    *)
      printf '      Nothing was written.\n' >&2 ;;
  esac
  # The retry is said here, pointing forward at the line below it, rather than
  # riding on the end of that line. The recovery line is what a founder selects
  # and pastes, so "then the same command again" on the end of it was pasted with
  # it every time and the shell answered about the words, not the file.
  printf '      Do this, then run the same command again.\n' >&2
  block_fix_line "$bq_f" "$bq_n" '      ' >&2
}

# block_read <file> <name>: the lines between the markers, exclusive, with any
# carriage return taken off the end of each one. Callers build the next version
# of the block out of what comes back, and block_write puts the file's own
# endings back on, so the strip here costs nothing and saves every caller from
# comparing against a byte they cannot see.
#
# awk with a whole-line test, not a sed range: a sed range ends at the first line
# CONTAINING the end marker, so a founder note quoting one cut the block short
# and the caller wrote the truncated body back. It also keeps the marker out of
# a sed script, so nothing in the file can be read as a pattern.
block_read() {
  br_f=$1; br_n=$2
  block_check "$br_f" "$br_n" || return $?
  GE_BLOCK_S=$(block_start "$br_n") \
  GE_BLOCK_E=$(block_end "$br_n") \
  awk '
    BEGIN {
      s = ENVIRON["GE_BLOCK_S"]
      e = ENVIRON["GE_BLOCK_E"]
    }
    { line = $0; sub(/\r$/, "", line) }
    line == e { inside = 0 }
    inside == 1 { print line }
    line == s { inside = 1 }
  ' "$br_f"
}

# block_write_fix <the file ge could not write>: the way out of a write that was
# refused, as one command wherever ge can name what refused it.
#
# NOT block_fix. block_fix is about the marker lines inside the file. This is
# about the file itself refusing to be written, which is a different fault with a
# different answer.
#
# WHY: every write refusal in this file used to end on "ge check, which shows
# whether the folder can be written to". On a folder that is locked that does
# recover, but in two steps: the doctor's own answer is a chmod. On a file the
# founder or a sync client made read only it does not recover at all, because the
# folder IS writable, the doctor finds nothing wrong, and the founder is sent
# round a loop with no way out. ge already knows which file the write needed, so
# it says the chmod itself, which is what ge receipt and ge person now do for the
# same condition.
#
# The file is asked about before the folder around it, so that a read only
# memory.md is named rather than the folder it sits in, which is writable and not
# the problem. The doctor is still the answer when both are writable and the write
# failed anyway, because then ge cannot name what is in the way and a chmod on
# something already fine sends the founder down a dead end.
#
# WHAT IS LEFT FOR IT TO ANSWER, now that lib/paths.sh answers the founder's own
# file before either writer gets this far: the folder that will not take a new
# file. Both writers hand it the folder the temp file goes in, and block_ensure
# hands it their file only for a state that appeared in the moment after the
# guard had already looked. So the first branch is nearly always reading a
# folder, and chmod u+w is the whole answer for one that has kept its search
# bit, which is every folder a sync client has held for a moment.
#
# A folder that has lost its search bit as well is not answered here and does not
# need to be: ge cannot reach inside it to find .state/HOME either, so ge stops
# at the front door, and lib/paths.sh hands back all three permissions there.
#
# Never given the temp file ge writes beside theirs. That file is ours, and naming
# it breaks the promise the whole of this file is built on.
#
# WHAT COMES BACK IS A COMMAND AND NOTHING ELSE, in all three branches. It used
# to end on "then the same command again" and on "which shows whether the folder
# can be written to", and both of those were pasted along with the command they
# were sitting behind. Every caller here prints the retry on a line of its own,
# above the arrow, where it can be read and not selected.
block_write_fix() {                     # <the file ge could not write>
  bwf_d=${1%/*}
  [ "$bwf_d" = "$1" ] && bwf_d=.
  if [ -e "$1" ] && [ ! -w "$1" ]; then
    printf 'chmod u+w %s' "$(ge_quote "$1")"
  elif [ -d "$bwf_d" ] && [ ! -w "$bwf_d" ]; then
    printf 'chmod u+w %s' "$(ge_quote "$bwf_d")"
  else
    printf 'ge check'
  fi
}

# block_write <file> <name> <bodyfile>: replaces the block contents with the
# body file, byte for byte. Everything outside the markers is copied through
# untouched, which is the whole guarantee this file exists to make. Untouched
# means untouched: the carriage returns their editor put on those lines are
# still there afterwards, and a last line that had no newline still has none.
block_write() {
  bw_f=$1; bw_n=$2; bw_body=$3
  # THEIR FILE BEING READ ONLY IS A REFUSAL, and the shared guard is the one
  # that says so. It is asked FIRST, before the file is even read, because a
  # refusal that arrives before anything is built costs the founder nothing.
  #
  # WHY THE GUARD AND NOT THE THREE LINES THAT USED TO BE HERE. Those lines said
  # chmod u+w where lib/paths.sh says chmod u+rw. On a file whose owner has no
  # read either, u+w hands back half of it. The founder pastes it, runs the same
  # command, and reads a second refusal for the one state. A file with nothing
  # set on it at all was answered twice over: once by block_check for the read it
  # could not do, and once here for the write. So one file in one state told ge
  # remember one thing and ge person set another. One state, one answer, and the
  # answer lives in the file every writer already loads.
  #
  # THE LOCKED FOLDER FALLS THROUGH ON PURPOSE, the way ge person leaves it. The
  # temp file below is made inside that folder, so a folder that will not take a
  # new file is already answered further down, in words that name the folder and
  # the chmod that hands it back. Refusing here as well would give one locked
  # folder two different refusals, and a founder reading two reasonably concludes
  # there are two things wrong.
  ge_may_replace "$bw_f"
  bw_may=$?
  case $bw_may in
    1|3) ge_replace_refusal "$bw_f" >&2; return 1 ;;
  esac
  block_check "$bw_f" "$bw_n"
  bw_rc=$?
  if [ "$bw_rc" -ne 0 ]; then
    block_refuse "$bw_f" "$bw_n"
    return 1
  fi
  # Does the file end with a newline? Their last line is handed back the way it
  # arrived, with one or without one, so it has to be known before the rewrite.
  bw_tail=1
  if [ -n "$(tail -c 1 "$bw_f")" ]; then bw_tail=0; fi
  bw_tmp="$bw_f.ge-tmp.$$"
  # The folder the temp file goes in, worked out here so the refusals below can
  # name it. A file with no slash in its name sits in the folder ge was run from.
  bw_dir=${bw_f%/*}
  [ "$bw_dir" = "$bw_f" ] && bw_dir=.
  # Asked before the redirect that matters, because a folder locked mid sync is
  # the common case and the shell's own answer to it names our line number and a
  # temp file the founder has never heard of.
  #
  # true, not the colon, and stderr redirected before the file: a redirection
  # that fails on a special built-in ends the whole shell under dash, which is
  # /bin/sh on most Linux machines, and the founder would get the raw line only.
  true 2>/dev/null > "$bw_tmp" || {
    printf 'FAIL  %s could not be written, so nothing changed.\n' "$bw_f" >&2
    # The FOLDER, not their file. What just failed was making a new file in that
    # folder, and their own file being read only has nothing to do with it, so a
    # chmod on their file here would name a cause that is not the cause. The temp
    # file is never named either: it is ours.
    printf '      Do this, then run the same command again.\n' >&2
    printf '      → run: %s\n' "$(block_write_fix "$bw_dir")" >&2
    return 1
  }
  # The body is read from a file with getline, so a body containing / or & or \
  # cannot corrupt anything. The PATH to that body goes through the environment
  # and ENVIRON, never through awk -v: -v reads escape sequences in the value it
  # is given, so a folder named Q3\Q4 became Q3Q4, getline opened a path that was
  # not there, the loop ran no times, awk still exited 0, and the block went back
  # EMPTY with "Remembered" on the screen. A read that fails now refuses.
  GE_BLOCK_S=$(block_start "$bw_n") \
  GE_BLOCK_E=$(block_end "$bw_n") \
  GE_BLOCK_BODY=$bw_body \
  GE_BLOCK_TAIL=$bw_tail \
  awk '
    function emit(text) {
      # The newline goes in front of the next line rather than behind this one.
      # That way a file whose last line never had one does not gain one here.
      if (started == 1) printf "\n"
      started = 1
      printf "%s", text
    }
    BEGIN {
      s    = ENVIRON["GE_BLOCK_S"]
      e    = ENVIRON["GE_BLOCK_E"]
      bf   = ENVIRON["GE_BLOCK_BODY"]
      tail = ENVIRON["GE_BLOCK_TAIL"]
    }
    { line = $0; sub(/\r$/, "", line) }
    line == s {
      emit($0)
      # ge writes its own lines the way the file already reads. If the start
      # line came in with a carriage return, the lines under it get one too, so
      # a file saved on Windows stays a file saved on Windows all the way down.
      cr = ""
      if (line != $0) cr = "\r"
      while ((got = (getline body < bf)) > 0) {
        sub(/\r$/, "", body)
        emit(body cr)
      }
      if (got < 0) { unread = 1; exit 3 }
      close(bf)
      skip = 1
      next
    }
    line == e { skip = 0; emit($0); next }
    skip != 1 { emit($0) }
    END {
      if (unread == 1) exit 3
      if (started == 1 && (tail + 0) == 1) printf "\n"
    }
  ' "$bw_f" > "$bw_tmp" 2>/dev/null || {
    rm -f "$bw_tmp" 2>/dev/null
    printf 'FAIL  %s could not be rewritten, so nothing changed.\n' "$bw_f" >&2
    # Three ways this ends here and only two of them can be named. Their file
    # stopped being readable, the folder stopped taking writes, or ge could not
    # read back the lines it was handed, which is a file of ours and not
    # something a founder can act on. Each is asked about rather than assumed,
    # because a chmod on something already fine is a dead end.
    printf '      Do this, then run the same command again.\n' >&2
    if [ -f "$bw_f" ] && [ ! -r "$bw_f" ]; then
      printf '      → run: chmod u+r %s\n' "$(ge_quote "$bw_f")" >&2
    elif [ -d "$bw_dir" ] && [ ! -w "$bw_dir" ]; then
      printf '      → run: chmod u+w %s\n' "$(ge_quote "$bw_dir")" >&2
    else
      printf '      → run: ge check\n' >&2
    fi
    return 1
  }
  # THEIR PERMISSIONS GO ACROSS BEFORE THE NEW FILE LANDS. The file that lands
  # is one ge built a moment ago, so it carries whatever the umask gave it and
  # nothing of theirs. A founder who set memory.md, or a person file holding real
  # names and email addresses, to owner only got it back readable by everybody,
  # with "Remembered" on the screen and not a word about the setting. ge person
  # set kept that same file's setting, because it goes through the shared guard,
  # so the two halves of ge person disagreed about one file.
  #
  # Immediately before the mv, never after: after it there is nothing left to
  # read their mode from. It says nothing and always ends at 0, so a write ge has
  # already agreed to is never stopped by it.
  ge_keep_mode "$bw_f" "$bw_tmp"
  # 2>/dev/null and a tidy up, because a locked target file otherwise answers
  # with a raw rename line naming the temp file, and leaves it in the folder the
  # founder opens every day.
  mv "$bw_tmp" "$bw_f" 2>/dev/null || {
    rm -f "$bw_tmp" 2>/dev/null
    printf 'FAIL  %s could not be replaced, so nothing changed.\n' "$bw_f" >&2
    # Putting one file in place of another is a change to the FOLDER, so the
    # folder is what is asked about. Their file's own permissions do not come
    # into it, and offering a chmod on their file would send them nowhere.
    printf '      Do this, then run the same command again.\n' >&2
    printf '      → run: %s\n' "$(block_write_fix "$bw_dir")" >&2
    return 1
  }
}

# block_ensure <file> <name> <heading>: appends an empty block under a heading
# when the block is absent. Never inserts a bare entry into unmarked prose.
block_ensure() {
  be_f=$1; be_n=$2; be_h=$3
  block_check "$be_f" "$be_n"
  be_rc=$?
  [ "$be_rc" -eq 0 ] && return 0
  if [ "$be_rc" -eq 2 ]; then
    block_refuse "$be_f" "$be_n"
    return 1
  fi
  # The same guard block_write asks, in the same two answers, so one file in one
  # state cannot get one refusal from ge remember and a different one from
  # ge person set. Asked HERE and not at the top, because a file that already
  # holds the block is finished with above and nothing is written to it: a file
  # the founder set read only must not be refused by a step that was never going
  # to touch it.
  #
  # Two of the four are taken. The read only one, because appending to their file
  # is what comes next and a file set that way will not take it. And the one
  # where something that is not an ordinary file has that name, which nothing
  # here could see: a folder called memory.md reads to block_check as a file with
  # no block in it, so the append ran, failed, and the line printed for it named
  # the doctor, who then finds a folder that is perfectly writable. The locked
  # folder falls through to the line below, for the reason written in block_write.
  ge_may_replace "$be_f"
  be_may=$?
  case $be_may in
    1|3) ge_replace_refusal "$be_f" >&2; return 1 ;;
  esac
  # Asked before the append, for the same reason block_write asks: the shell's
  # own answer to a locked folder names a line number and nothing else.
  true 2>/dev/null >> "$be_f" || {
    printf 'FAIL  %s could not be added to, so nothing changed.\n' "$be_f" >&2
    # THEIR file, first, and then the folder around it. Appending to their file
    # is what just failed, so their file is what gets asked about before anything
    # else. The guard above has already turned away the read only file and the
    # name that is not a file at all, so what reaches here is a locked folder, or
    # a state that appeared in the moment between the two, or something ge cannot
    # see at all. The line that used to be here sent them to ge check for every
    # one of those, which then found nothing wrong and left them going round with
    # no way out.
    printf '      Do this, then run the same command again.\n' >&2
    printf '      → run: %s\n' "$(block_write_fix "$be_f")" >&2
    return 1
  }
  # A last line the founder left without a newline is closed first. Appending
  # straight onto it would glue the heading to the end of their sentence.
  be_ok=1
  if [ -s "$be_f" ] && [ -n "$(tail -c 1 "$be_f")" ]; then
    printf '\n' >> "$be_f" || be_ok=0
  fi
  # One write, so an interrupt here cannot leave a start line with no end line,
  # which is a file ge would then refuse to write to.
  if [ "$be_ok" -eq 1 ]; then
    printf '\n## %s\n%s\n%s\n' "$be_h" "$(block_start "$be_n")" "$(block_end "$be_n")" >> "$be_f" || be_ok=0
  fi
  [ "$be_ok" -eq 1 ] && return 0
  # A disk that filled, or permissions that changed, between the check above and
  # the write. Rare, and silence here would leave the founder retrying a command
  # that says nothing at all. Asked again rather than repeated from above,
  # because what changed is the whole reason this line is being printed.
  printf 'FAIL  %s could not be added to.\n' "$be_f" >&2
  printf '      Do this, then run the same command again.\n' >&2
  printf '      → run: %s\n' "$(block_write_fix "$be_f")" >&2
  return 1
}
