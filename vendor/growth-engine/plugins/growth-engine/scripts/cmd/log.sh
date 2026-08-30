# log.sh: append one dated line to the ops log, and move the byte watermark. Sourced by ge.sh.
#
# WHY IT EXISTS: the ops log is the only complete record of what a founder did,
#                and a record that can be rewritten is not a record. Every write
#                here is an append. No line that already exists is ever reopened,
#                so no bug in this file can cost a founder a day of work. The
#                watermark is what lets ge check prove that afterwards: a log
#                that got shorter is a log that lost something, and without a
#                number to compare against nobody would ever notice.
# CALLED BY:     ge log, every skill that finishes a step, and founders directly
# READS:         growth-engine/ops-log.md, .state/log.bytes
# WRITES:        growth-engine/ops-log.md and .state/log.bytes. It is the one writer of both.
#                .state/log.bytes holds the size of ops-log.md with carriage
#                returns left out of the count, so that carrying the folder
#                between a Windows machine and a Mac cannot read as a log that
#                lost entries. Anything comparing against it has to leave them
#                out too, or it is comparing two different numbers
# POSTURE:       fail-closed on the append. A founder who is told the decision
#                was recorded will not record it a second time, so a silent
#                failure here is the same as deleting the entry
# PORTABILITY:   POSIX sh. No bash/python/node/jq. lib/date_compat.sh is loaded by
#                ge.sh, and the single date call here uses a plain +format string
#                that BSD and GNU read the same way.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# THE SHARED WRITE GUARD, AND WHAT IT MEANS FOR THE ONE FILE GE ADDS TO RATHER
# THAN REPLACES.
#
# Every other writer in this toolkit builds a new file beside the founder's and
# renames it over the top, and ge_may_replace in lib/paths.sh is the question all
# of them ask first: may ge put a new file where this one is. ge log never does
# that, so it was the one writer that never asked, and this is what that cost. A
# sync client that finds two machines holding one name makes a FOLDER called
# ops-log.md out of the two copies. Nothing can be added to a folder, so every
# entry was refused, and the line handed over was a chmod on the growth-engine
# folder, which was writable already: it ran, it exited 0, it changed nothing,
# and the next entry printed the same refusal word for word. ge check diagnosed
# that same folder correctly in the same session, and offered the move that ends
# it. One verb was asking nothing and answering anyway.
#
# The guard is the right question here even though this verb appends, because
# what it settles is whether ge can put an entry at that name at all, and the
# three states it names are the same three:
#
#   readonly  the file will not take a write. For a verb that adds to the file
#             this is the exact question and not a courtesy: an append asks the
#             FILE for permission, and the folder around it has no say in it.
#   notfile   something wearing that name is not an ordinary file. This one
#             matters MORE to an append than to a replace. Adding to a folder
#             fails outright, and adding through a shortcut pointing somewhere
#             else puts the founder's entry in that somewhere else, where
#             nothing will ever read it back.
#   folder    the growth-engine folder will not take a new file. ge builds each
#             entry in a new file there before adding it on, and it creates
#             ops-log.md itself on a founder's first entry.
#
# An absent log is a yes, and it has to stay one: that is a founder's first
# entry, and the branch below creates the file by adding to it.
#
# WHAT THE GUARD DOES NOT CHANGE: not one line already in the log is reopened.
# The guard settles whether the entry can be written. Every write below is still
# an append, and the promise on the help page holds exactly as it did.

ge_log_usage() {
  cat <<'USAGE'
ge log <type> "<text>"    add one line to your ops log

  decision   a choice you made, and the reason for it
  result     something that happened, with the number if you have one
  blocker    what is stopping you
  note       anything else worth keeping

For example:

  ge log decision "picked the b2b track, my buyers are agencies"
  ge log result "sent 25 emails, 3 replied"

Every entry is dated and kept. Nothing you log is ever rewritten.
USAGE
}

# ge_log_bytes <file>: the size as a bare integer, with carriage returns left
# out of the count. BSD wc pads the number with spaces and GNU wc does not, and
# the watermark has to compare as a number.
#
# Carriage returns are not counted on purpose. Carrying the folder between a
# Windows machine and a Mac, or a repository with core.autocrlf set, rewrites
# every line ending and changes the raw size of the file without losing a single
# word. Counted raw, that reads as a log that got shorter, and the founder is
# told their only full record was cut when nothing was lost at all.
#
# A file ge cannot read is reported, not answered with a number. The redirection
# used to be unguarded, so an ops log a sync client or a Windows permission had
# closed for a moment made the shell print this file's own name and the line it
# was on, twice, above everything ge said. Worse, the failed read measured as
# zero bytes, and zero is smaller than the last recorded size, so the founder was
# then told that something outside ge had shortened their only full record and
# sent to look for the entries that were missing. Nothing was missing. The read
# had failed. Returning 1 is what lets the caller tell an empty log, which is a
# real answer, from a log it could not open, which is not.
# A count that came back as something other than digits is not a count either,
# and it used to be handed straight back as one. Everything that reads this
# compares it as a number, and the shell answers a comparison against something
# that is not one by printing its own complaint, with this file's name and a line
# number on it, above whatever ge was saying. Worse, that count is what gets
# written into the mark, and the doctor then reports the mark as unreadable for
# ever after. So it is failure, the same as a file that could not be opened, and
# every caller already has a branch for that.
ge_log_bytes() {
  [ -r "$1" ] || return 1
  ge_lb_n=$( { tr -d '\r' < "$1" | wc -c | tr -d ' \t\r\n'; } 2>/dev/null )
  case ${ge_lb_n:-x} in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$ge_lb_n"
}

# ge_log_no_write <what did not happen> <one sentence> [<a second>]: the one
# refusal for a write ge had already agreed to and the machine did not do.
# Reads ge_log_file and ge_log_home, which ge_log_main sets before any write.
#
# WHY THERE IS ONE OF THESE RATHER THAN FOUR. Four writes below can fail, and
# each of them named its own cause. Every one of them named the same cause: a
# chmod on the growth-engine folder. On a folder that was writable already that
# line ran, exited 0, changed nothing, and the next entry printed the same
# refusal word for word. One of the four reached that message for a folder
# wearing the log's name, which no chmod anywhere can clear.
#
# WHAT IT EXAMINES: the shared guard, asked again, here. Not remembered from the
# top of the run. A sync client holds a folder for a moment and lets go of it, so
# the state when the entry started is not evidence about the state now, and a
# message is only as true as the moment it is printed in. What ge can see, it
# names. What it cannot see, it says it cannot see, and hands over the command
# that reads back the usual answer, which is a disk with no room left on it.
# There is no command ge can give a founder that frees a disk, so this is the one
# place in the file where the line shows something rather than fixing it.
#
# The commands come from lib/paths.sh and not from here, so a folder ge refuses
# about is answered in the same words and with the same chmod wherever a founder
# meets it. Every path in them has already been through ge_quote.
ge_log_no_write() {                     # <what did not happen> <one sentence> [<a second>]
  printf 'FAIL  %s\n' "$1" >&2
  printf '      %s\n' "$2" >&2
  [ -n "${3:-}" ] && printf '      %s\n' "$3" >&2
  ge_may_replace "$ge_log_file"
  case $GE_REPLACE_WHY in
    folder)
      printf '      The folder %s will not take a new file.\n' "$GE_REPLACE_PATH" >&2 ;;
    readonly)
      # The file, and not the folder. An entry goes on the end of the log, so
      # this is the one verb where the file's own permission is the whole
      # question and a folder that takes writes says nothing about it.
      printf '      %s will not take a write, and an entry goes on the end of it.\n' \
        "$ge_log_file" >&2 ;;
    notfile)
      printf '      Something that is not an ordinary file has the name %s.\n' "$ge_log_file" >&2
      printf '      Nothing is deleted by moving it aside, so you can put the name back.\n' >&2 ;;
  esac
  if [ -n "$GE_REPLACE_FIX" ]; then
    printf '      Run this, then log the entry again.\n' >&2
    printf '      → run: %s\n' "$GE_REPLACE_FIX" >&2
  elif [ -n "$GE_REPLACE_DO" ]; then
    # DELIBERATE: guidance, not a command, and the arrow says so by carrying no
    # "run:". The -old name beside it is taken as well, ge will not invent a
    # third name for the founder to keep track of, and the only commands left
    # either delete something or write over something. The sentence is the shared
    # one, so this state reads the same here as it does from every other verb.
    printf '      ge has no move to offer: the -old name beside it is taken.\n' >&2
    printf '      → %s\n' "$GE_REPLACE_DO" >&2
  else
    # Nothing ge can see is in the way, so nothing is named. A founder sent to a
    # chmod on a folder that is already writable has been handed a line that
    # cannot recover anything.
    printf '      ge cannot say what refused. The usual answer is a disk with no room\n' >&2
    printf '      left on it, and this prints how much is left on that one.\n' >&2
    printf '      → run: df -h %s\n' "$(ge_quote "$ge_log_home")" >&2
  fi
}

ge_log_main() {
  # No arguments is a founder asking what this expects, not an error.
  if [ $# -eq 0 ]; then
    ge_log_usage
    return 0
  fi

  ge_log_type=$1
  shift

  # Asking for the page is not a mistake. ge ledger, ge remember and ge person
  # all answer help with their own page and exit 0, and ge log answered it with a
  # FAIL banner saying "help" is not a kind of log entry. The top-level ge help
  # tells founders to run a verb on its own to see what it expects, so the word
  # they try next is the one word this refused.
  case "$ge_log_type" in
    help|-h|--help)
      ge_log_usage
      return 0 ;;
  esac

  if ! enum_ok "$ge_log_type" decision result blocker note; then
    printf 'FAIL  "%s" is not a kind of log entry.\n' "$ge_log_type" >&2
    printf '      The four kinds are: decision, result, blocker, note.\n' >&2
    printf '      → run: ge log note "what happened, in one line"\n' >&2
    return 1
  fi

  # Unquoted text arrives as many arguments. Joining them keeps the entry the
  # founder meant rather than the first word of it. Line breaks and carriage
  # returns become spaces, because one entry is one line and a stray newline
  # in the text would look like a new entry to everything that reads this file.
  ge_log_text=$(printf '%s' "$*" | tr '\r\n' '  ')

  case "$ge_log_text" in
    *[![:space:]]*) : ;;
    *)
      printf 'FAIL  that log entry has no text, so there is nothing to record.\n' >&2
      printf '      → run: ge log %s "what happened, in one line"\n' "$ge_log_type" >&2
      return 1 ;;
  esac

  ge_log_home=$(ge_find_home)
  ge_log_rc=$?

  # The shared refusal in lib/paths.sh, not one written here. What this said
  # before named a search that stops above the founder's head, and ge_find_home
  # also reads the home folder, the Desktop, Documents and Downloads. A founder
  # whose folder is on the Desktop was told ge had never looked there. The
  # sentence about nothing being logged stays, because it is this verb's own and
  # it is true.
  if [ "$ge_log_rc" -eq 1 ]; then
    ge_nofolder_refusal fail 'Nothing was logged.' >&2
    return 1
  fi

  if [ "$ge_log_rc" -ne 0 ]; then
    # The shared refusal in lib/paths.sh, not one written here. This used to say
    # to rename the folders you are not using, which describes an action rather
    # than handing over a command: it named neither folder, so the founder had to
    # work out which one to rename and type the path themselves, and every other
    # verb told them something different. The shared one is the same sentence
    # everywhere and ends on a mv with both names already in it.
    ge_scatter_refusal "$ge_log_home" 'Nothing was logged.' >&2
    return 1
  fi

  ge_log_file="$ge_log_home/ops-log.md"
  ge_log_state="$ge_log_home/.state"
  ge_log_mark="$ge_log_state/log.bytes"

  # The shared guard, asked before anything here is read or written, so a refusal
  # leaves the folder exactly as it was found. The reasoning for asking it in a
  # verb that appends is at the top of this file.
  #
  # THE LOCKED FOLDER FALLS THROUGH ON PURPOSE, the way ge person and lib/blocks
  # leave it. Every write below ends on ge_log_no_write, which names that same
  # folder and the same chmod. Refusing here as well would answer one state in
  # two sets of words, and a founder reading two different refusals for one
  # locked folder reasonably concludes there are two things wrong with it.
  ge_may_replace "$ge_log_file"
  case $? in
    1|3) ge_replace_refusal "$ge_log_file" 'Nothing was logged.' >&2; return 1 ;;
  esac

  # One reading of the clock, not two. today_iso plus a separate call for the
  # time can straddle midnight, and an entry filed under the wrong day stays
  # wrong for ever in an append-only file. It reads the founder's own timezone,
  # taken from TZ in the environment, which is why now_local lives in
  # lib/date_compat.sh with the rest of the clock rather than being written out
  # here: this is the reading a container running UTC gets wrong, and the file
  # that owns the decision is the file it should be asked from.
  ge_log_now=$(now_local)
  ge_log_day=${ge_log_now% *}
  ge_log_time=${ge_log_now#* }

  # Read before writing. The comparison below is the only chance to notice that
  # something outside ge shortened the log, and after the append it is gone.
  ge_log_was=0
  ge_log_read=yes
  if [ -f "$ge_log_file" ]; then
    ge_log_was=$(ge_log_bytes "$ge_log_file") || { ge_log_was=0; ge_log_read=no; }
  fi
  ge_log_prev=''
  if [ -f "$ge_log_mark" ] && [ -r "$ge_log_mark" ]; then
    ge_log_prev=$( { tr -d '\r' < "$ge_log_mark" | sed -n '1p'; } 2>/dev/null )
  fi

  # Every write below runs inside ( ) with stderr already redirected, because a
  # shell prints its own "Permission denied" for a failed redirection and the
  # founder should read one plain sentence, not that line and then this one.
  if [ ! -f "$ge_log_file" ]; then
    # Created by appending, exactly like every other write in this file, so a
    # log that already exists can never be replaced by this branch.
    ( {
      printf '# Ops log\n\n'
      printf 'Append only, written by `ge log`. Every day gets its own heading.\n'
    } >> "$ge_log_file" ) 2>/dev/null || {
      # THIS IS THE BRANCH THE FOLDER SHAPE USED TO REACH. A folder called
      # ops-log.md is not an ordinary file, so the test above sent it here, and
      # this said the log could not be created and handed over a chmod on the
      # growth-engine folder. That folder was writable, the chmod exited 0 and
      # changed nothing, and the next entry printed the same words again. The
      # guard at the top now answers that shape before this line is reached, and
      # what is left here is a create ge agreed to that did not happen, which
      # ge_log_no_write examines rather than guesses at.
      ge_log_no_write "could not create $ge_log_file." 'Nothing was logged.'
      return 1
    }
  fi

  # A file whose last byte is not a newline would swallow the new entry onto the
  # end of the previous line. $(...) drops trailing newlines, so an empty result
  # here means the file already ends cleanly.
  #
  # AND AN EMPTY ANSWER FROM A FILE GE COULD NOT OPEN IS NOT THAT ANSWER. A log
  # that takes a write and refuses a read gives this test the same silence a log
  # ending in a newline gives it, and the two were read as one thing: the newline
  # was skipped and the entry went on the end of somebody else's line, in the one
  # file that is never rewritten. So where ge could not read the file it adds the
  # newline instead of assuming. That is the safe way to be wrong: at worst it
  # leaves one blank line, and the other way round joins two entries into a line
  # a founder cannot separate again.
  if [ -s "$ge_log_file" ] &&
     { [ "$ge_log_read" = no ] || [ -n "$(tail -c 1 "$ge_log_file" 2>/dev/null)" ]; }; then
    ( printf '\n' >> "$ge_log_file" ) 2>/dev/null || {
      ge_log_no_write "could not write to $ge_log_file." 'Nothing was logged.'
      return 1
    }
  fi

  # The last day heading, not any day heading. Reusing one further up the file
  # would file today's entry under a day the founder has already scrolled past.
  # Read only when the file can be read: an unguarded read here was the second
  # of the two raw shell lines a closed log printed above ge's own answer. With
  # no heading found the entry gets a fresh one, which is the safe way to be
  # wrong, because it can only ever add a heading and never move an entry.
  ge_log_last=''
  if [ "$ge_log_read" = yes ]; then
    ge_log_last=$( { tr -d '\r' < "$ge_log_file" | grep '^## ' | sed -n '$p'; } 2>/dev/null )
  fi

  # Built whole in a temp file first, so a disk with no room left usually shows
  # up before the founder's log is touched rather than as half a line inside it.
  # Usually, and not always: the last bytes can fit here and not there, which is
  # why the append below reads the size on both sides rather than promising.
  ge_log_tmp="$ge_log_file.ge-tmp.$$"
  ( {
    if [ "$ge_log_last" != "## $ge_log_day" ]; then
      printf '\n## %s\n\n' "$ge_log_day"
    fi
    # The leading dash goes through %s so that no printf can read it as an option.
    printf '%s %s %s: %s\n' '-' "$ge_log_time" "$ge_log_type" "$ge_log_text"
  } > "$ge_log_tmp" ) 2>/dev/null || {
    rm -f "$ge_log_tmp" 2>/dev/null
    # The entry is built in a new file inside the folder, so this fails for more
    # than one reason and only one of them is disk space. What this said before
    # was that there was no room left whenever the folder took a write, which is
    # a claim about a disk ge had never looked at: a full disk and a file the
    # machine would not make for some other reason are the same silence here.
    # ge_log_no_write names what it can see and says so when it can see nothing.
    ge_log_no_write 'could not prepare the log entry.' 'Nothing was logged.'
    return 1
  }

  # The size the log stands at with the heading and the newline above already
  # done, read here so that a failure below can be answered with what happened
  # rather than with a hope. An append that runs out of room part way through has
  # put part of the entry on the end of the file, and "Nothing was logged" is
  # then false in the one file nobody can go back and correct. Empty when ge
  # cannot read the log, which is not a size and is not treated as one.
  ge_log_pre=$(ge_log_bytes "$ge_log_file") || ge_log_pre=''

  ( cat "$ge_log_tmp" >> "$ge_log_file" ) 2>/dev/null || {
    rm -f "$ge_log_tmp" 2>/dev/null
    ge_log_post=$(ge_log_bytes "$ge_log_file") || ge_log_post=''
    # Proved, both times, or not claimed. Two sizes ge actually read and found
    # the same are proof the file did not grow. Anything else, a log ge cannot
    # read included, leaves ge unable to say, and what it says instead is what
    # the founder has to do about it.
    if [ -n "$ge_log_pre" ] && [ "$ge_log_pre" = "$ge_log_post" ]; then
      ge_log_no_write "could not add the entry to $ge_log_file." 'Nothing was logged.'
    else
      ge_log_no_write "could not add the entry to $ge_log_file." \
        'Your entry did not go in whole.' \
        'Read the end of the log before you write it again: part of the line may be on it.'
    fi
    return 1
  }
  rm -f "$ge_log_tmp" 2>/dev/null

  printf 'Logged  %s %s %s: %s\n' "$ge_log_day" "$ge_log_time" "$ge_log_type" "$ge_log_text"

  # From here the entry is safe on disk. Everything below reports, and none of
  # it may return failure, because a founder told this failed would log twice.

  # A log ge could not read is said once, here, and then nothing else is said
  # about it. The two reports below both rest on a size ge does not have, so
  # running them anyway is how one problem became three messages, one of them
  # telling the founder their record had lost entries when it had not.
  # WARN, a recovery line, and exit 0. All three are deliberate, and this is the
  # one place in the file where they sit together, so the reason is written here
  # rather than left to be worked out.
  #
  # The entry is on disk. This is not a refusal, and it must never be given the
  # exit code of one: a founder told that ge log failed writes the same entry a
  # second time, and an append only file cannot take the duplicate back out. So
  # the exit code reports what happened to the entry, which is that it was saved.
  #
  # The recovery line stays, because a log ge cannot read is a real fault, the
  # founder is the only person who can clear it, and it costs them one command.
  # A warning with nowhere to go is a warning people learn to scroll past.
  if [ "$ge_log_read" = no ]; then
    printf 'WARN  your entry was saved, but ge could not open %s to read it back.\n' "$ge_log_file" >&2
    # "Nothing was lost" is what this said, in the same breath as saying the
    # check for a shortened log was not made. ge cannot have it both ways: it
    # could not read the file, so it cannot speak for what is in it. What it can
    # stand behind is that this writer only ever appends, which is the part a
    # founder is actually worried about, and it is said as the reason rather
    # than as a promise.
    printf '      It was added to the end. This file is only ever added to, so nothing already in it moved.\n' >&2
    printf '      The size record was left alone, and the check for a shortened log was not made.\n' >&2
    printf '      Run this. Then ge check reads the log and says whether it is sound.\n' >&2
    printf '      → run: chmod u+r %s\n' "$(ge_quote "$ge_log_file")" >&2
    return 0
  fi

  ge_log_now_bytes=$(ge_log_bytes "$ge_log_file") || ge_log_now_bytes=''
  mkdir -p "$ge_log_state" 2>/dev/null
  ge_log_mtmp="$ge_log_mark.ge-tmp.$$"
  # The size has to be a number ge actually read. Writing an empty watermark
  # would make the doctor compare the log against nothing for ever after.
  #
  # THE ONE PLACE THIS VERB PUTS A FILE IN PLACE OF ANOTHER, so it is the one
  # place the shared guard is asked about something other than the log. A rename
  # does not fail on the shape that matters: with a folder called log.bytes,
  # which is what the same sync client conflict makes of this file, mv moves the
  # new file INSIDE it and hands back 0. ge then said the size record was updated
  # while nothing had landed, and the check that reads it back is off for good,
  # because the doctor finds no record and promises the next entry will write
  # one, run after run.
  #
  # ge_keep_mode goes immediately before the mv and never after it, because after
  # it there is nothing left to read the founder's own permissions from. It never
  # fails and never says anything.
  if [ -n "$ge_log_now_bytes" ] &&
     ge_may_replace "$ge_log_mark" &&
     ( printf '%s\n' "$ge_log_now_bytes" > "$ge_log_mtmp" ) 2>/dev/null &&
     { ge_keep_mode "$ge_log_mark" "$ge_log_mtmp"
       mv "$ge_log_mtmp" "$ge_log_mark" 2>/dev/null; }; then
    :
  else
    rm -f "$ge_log_mtmp" 2>/dev/null
    printf 'WARN  your entry was saved, but the size record at %s was not updated.\n' "$ge_log_mark" >&2
    # The way out is the guard's own, where the guard is what refused, so this
    # names the same move the doctor names for the same file. Where nothing was
    # found in the way there is nothing to name, and the doctor is what reads the
    # log itself. Every path in these lines has already been through ge_quote.
    if [ -n "$GE_REPLACE_FIX" ]; then
      printf '      Run this, then your next entry writes a fresh record.\n' >&2
      printf '      → run: %s\n' "$GE_REPLACE_FIX" >&2
    elif [ -n "$GE_REPLACE_DO" ]; then
      # DELIBERATE: guidance, not a command, and the arrow carries no "run:" to
      # say so. The -old name beside it is taken as well, and the sentence is the
      # shared one, so this state reads the same here as it does everywhere else.
      printf '      ge has no move to offer: the -old name beside it is taken.\n' >&2
      printf '      → %s\n' "$GE_REPLACE_DO" >&2
    else
      printf '      This says whether the log itself is sound.\n' >&2
      printf '      → run: ge check\n' >&2
    fi
  fi

  # A log shorter than the last recorded size means something outside ge cut it.
  # Said once, here, at the moment it can still be traced.
  case "$ge_log_prev" in
    ''|*[!0-9]*) : ;;
    *)
      if [ "$ge_log_was" -lt "$ge_log_prev" ]; then
        printf 'WARN  your ops log was %s bytes last time and %s bytes before this entry.\n' \
          "$ge_log_prev" "$ge_log_was" >&2
        printf '      Something other than ge made it shorter. Your new entry is saved.\n' >&2
        # Said out loud, because the obvious next thought is to reach for a
        # backup, and reaching for one here would replace the entries that are
        # still in the file with an older copy that has fewer of them.
        printf '      The log is only ever added to, so ge keeps no backup of it to put back.\n' >&2
        printf '      This prints the log. Read it, and log anything missing again.\n' >&2
        printf '      → run: cat %s\n' "$(ge_quote "$ge_log_file")" >&2
      fi ;;
  esac

  return 0
}

ge_log_main "$@"
