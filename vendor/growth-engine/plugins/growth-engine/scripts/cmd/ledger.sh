# ledger.sh: the content ledger, one row per piece, one writer. Sourced by ge.sh.
#
# WHY IT EXISTS: thirty pieces move from written, to approved, to posted over
#                three weeks, and with no file holding that state the founder
#                re-reads thirty drafts to work out what is left. It is also the
#                only thing that records approval, and the publish flow posts
#                approved rows only, so a piece that never comes through here
#                can never be scheduled and the founder never learns why.
# CALLED BY:     ge ledger, the content skill, the publish flow, ge lint
# READS:         growth-engine/ledger.md, and growth-engine/content-30.md, which
#                approve checks is there before it records anything
# WRITES:        growth-engine/ledger.md, growth-engine/.state/approved-at
# POSTURE:       fail-closed. No backup, no write, and no replacing a ledger the
#                founder has set read only: that is asked through the shared
#                guard in lib/paths.sh before the backup is taken, and their own
#                permissions go across onto the file that lands. A row it cannot
#                read is copied through byte for byte and reported, never
#                rewritten, and a row it cannot read is still named by its id
#                rather than answered as an id nobody used. A ledger it cannot
#                open at all is refused once, by every verb, and never read as
#                an empty one.
#                ge ledger approve is the only way a piece becomes approved, and
#                a piece has to be approved before it can be scheduled or posted
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").

# The controlled lists, written once so the validator and the error message that
# names the allowed values can never drift apart.
GE_LEDGER_STATUSES='draft approved scheduled posted failed archived'
GE_LEDGER_LANES='text media'
GE_LEDGER_FIELDS='pillar format lane status ghl_post_id scheduled_for'

# The five shapes a piece can be. One per line of the content skill's own format
# mix: twenty short posts and six longer ones on the business track, fifteen
# short video scripts, eight carousels and seven single-image captions on the
# consumer track. The last three are the ones that need an asset, which is what
# puts a piece in the media lane.
#
# This was open text until now, so "blogpost" and "text-post" were both taken and
# so was a bare dash. Two founders then had the same piece under two names, the
# lane and the format could disagree with nobody noticing, and there was nothing
# for the publish flow or a later count to group on. It is a list rather than a
# shape test so that the refusal can name what does work, which is the only part
# a founder can act on.
GE_LEDGER_FORMATS='short-post long-post reel-script carousel image-caption'

# A trailing carriage return, held as a value so lines can be trimmed without
# spawning tr once per row. A founder who opens ledger.md in Notepad saves one
# onto every line, and an untrimmed one lands inside the last field.
GE_LEDGER_CR=$(printf '\r')

GE_LEDGER_HOME=''
GE_LEDGER_FILE=''

# The row being read, and the row approve was asked for. Declared here because
# ge.sh runs under set -u, and a file with no rows at all must give a refusal
# rather than an unset variable.
GE_LEDGER_F1=''; GE_LEDGER_F2=''; GE_LEDGER_F3=''; GE_LEDGER_F4=''
GE_LEDGER_F5=''; GE_LEDGER_F6=''; GE_LEDGER_F7=''; GE_LEDGER_F8=''
GE_LEDGER_TARGET=''

# Set by ge_ledger_find when the id it was asked for is on a row it could not
# read. Declared here for the same reason as the fields above: ge.sh runs under
# set -u, and the callers read it whether or not a search has happened yet.
GE_LEDGER_BROKEN=no
GE_LEDGER_ROWID=''

# What the founder actually typed, so the value checks can hand back a command
# rather than a shape. The checks are shared by add-content and set-content, so
# a fixed recovery line inside them names the wrong verb for one of the two, and
# a founder who pastes it gets a second refusal instead of a way forward.
# FIXCMD is the whole command written out again, FIXID is the id on its own.
GE_LEDGER_FIXCMD=''
GE_LEDGER_FIXID=''

# One layout for the heading and for every row of ge ledger list, held once so a
# column that moves moves in both. printf reads it as the format, so no value in
# a row can ever be read as an option.
GE_LEDGER_ROWFMT='%-10s %-6s %-14s %-6s %-10s %-18s %s\n'

# ge_ledger_die <what failed> <the command> [one line about the command]
#
# The third argument is where any English about the command goes, and it is
# printed above the arrow, never on it. A founder selects the whole recovery
# line and pastes it, so "ge ledger list C, to see the ids you have" reaches ge
# as a verb called "list" with four more words after it. Callers that have
# nothing to add leave it out.
# The fourth argument is a second line, for the one refusal that has two things
# to say: what the founder typed, and what the command on the arrow is for. Both
# sit ABOVE the arrow, the one explaining the arrow last, because a founder
# selects the last line and pastes it and anything below the arrow is either
# never read or pasted with it.
ge_ledger_die() {                       # <first line> <command> [line] [line]
  printf 'FAIL  %s\n' "$1" >&2
  [ -n "${3:-}" ] && printf '      %s\n' "$3" >&2
  [ -n "${4:-}" ] && printf '      %s\n' "$4" >&2
  printf '      → run: %s\n' "$2" >&2
  return 1
}

# ge_ledger_tell <what failed> <the one thing to do> [one line] [one line]
#
# The same refusal, ending on a bare arrow instead of an arrow with "run:" on it.
#
# WHY BOTH EXIST. "→ run: " is a promise that the rest of the line pastes and
# runs. These lines used to end on a slash command naming the content engine,
# which is a Claude Code command and not a program: pasted into a shell it is a
# "not found", and in the app it is a button with nothing behind it. The step is
# real and the founder does have to take it, so what changed is the shape and not
# the advice. ge names the step in words and names no surface, because it runs on
# two of them and can only ever be right about one at a time.
ge_ledger_tell() {                      # <first line> <the one thing to do> [line] [line]
  printf 'FAIL  %s\n' "$1" >&2
  [ -n "${3:-}" ] && printf '      %s\n' "$3" >&2
  [ -n "${4:-}" ] && printf '      %s\n' "$4" >&2
  printf '      → %s\n' "$2" >&2
  return 1
}

# ge_ledger_dashdash <args...>: true when the first word is "--", which says the
# next word is an id and not an option.
#
# add-content refuses a new id that starts with a dash, because approve reads
# one as an option and could never reach the row. Rows written before that
# refusal existed are already in founders' ledgers, and this marker is the only
# way they can still name one. Every verb that takes an id honours it, so the
# founder never has to remember which one needs it.
ge_ledger_dashdash() {
  [ $# -ge 1 ] && [ "$1" = "--" ]
}

# ge_ledger_no_sep <value> <fieldname>: the two refusals a ledger row needs.
#
# Both are the library's now. This used to test the delimiter here and only hand
# the value to no_sep once it already knew the answer, because no_sep's line
# break test was built from a command substitution, which strips the newline it
# was looking for, so the guard refused every value it was ever given. That is
# repaired in scripts/lib/table.sh, so there is one guard again rather than two.
ge_ledger_no_sep() {
  no_sep "$1" "$2"
}

# ge_ledger_id_ok <id> <the command to hand back> [one line about it]: the two
# things an id can never be, wherever it is typed.
#
# The third argument is passed straight through to ge_ledger_die, so the English
# about the command stays off the line a founder pastes.
#
# add-content refused an empty id and an id carrying the separator, and the other
# two verbs did not. So the same value got a reason from one verb and "there is
# no content piece with the id a|b" from the others, which is true only because
# add-content would never have written it, and which sends the founder to a list
# the piece could not possibly be in. One test, three verbs, one answer.
#
# The leading dash is deliberately not here. add-content refuses one because a
# new row named that way could never be approved afterwards, and approve refuses
# one because approve also takes --all-text and cannot tell an option from an id.
# set-content takes no options at all, so it can still reach a row named that way
# and repair it, and that is the only road back for a row written before the rule
# existed.
ge_ledger_id_ok() {
  ge_ledger_no_sep "$1" "id" || return 1
  [ -n "$1" ] || {
    ge_ledger_die "the id cannot be empty." "$2" "${3:-}"
    return 1
  }
}

# ge_ledger_word <value>: the value written the way it has to be typed back. A
# value carrying a space has to come back in quotes, or a recovery line built
# from it names five things where the command takes four.
ge_ledger_word() {
  case "$1" in
    ''|*[[:space:]]*) printf '"%s"' "$1" ;;
    *) printf '%s' "$1" ;;
  esac
}

# ge_ledger_approve_cmd <id>: the approve command that actually reaches this id.
# An id written before add-content refused a leading dash needs the "--" in
# front of it, and a recovery line that leaves that out is a second refusal.
#
# The id goes through ge_ledger_word for the same reason: an id with a space in
# it, and "week one" is a name a founder gives a piece, splits into two arguments
# and approve then says it needs one thing. Quoted here rather than at each of
# the three call sites, so no caller can forget.
ge_ledger_approve_cmd() {
  case "$1" in
    -*) printf 'ge ledger approve -- %s' "$(ge_ledger_word "$1")" ;;
    *)  printf 'ge ledger approve %s' "$(ge_ledger_word "$1")" ;;
  esac
}

# ge_ledger_words_there: is there anything in content-30.md to approve?
#
# Silent, and it answers nothing else. ge_ledger_words below refuses on the same
# two tests and needs them apart, because a file that is missing and a file that
# is empty are different things to tell somebody. A refusal that only has to
# pick a way out needs them together, so they are asked in one place and the
# answer approve acts on and the answer a refusal is built from cannot drift.
ge_ledger_words_there() {
  [ -f "$GE_LEDGER_HOME/content-30.md" ] && [ -s "$GE_LEDGER_HOME/content-30.md" ]
}

# ge_ledger_die_approve <first line> <id> <one line about the approve>: refuse,
# and hand over the way out that actually moves THIS founder on.
#
# WHY IT ASKS FIRST. Both callers used to hand over ge ledger approve <id> flat.
# approve reads content-30.md and refuses outright when that file is not there,
# and between session 1 and session 2 it is not there: that is the ordinary
# state at that point in the programme, not an edge case. So a founder who typed
# ge ledger set-content 1 status scheduled was refused, pasted the line they were
# given, and was refused a second time about a file nobody had told them to
# write. The gate has two locks on it in that state, and the line has to name
# the one that is actually shut. Where the words are written, approve is the
# lock, and where they are not, writing them is.
ge_ledger_die_approve() {               # <first line> <id> <about the approve>
  if ge_ledger_words_there; then
    ge_ledger_die "$1" "$(ge_ledger_approve_cmd "$2")" "$3"
  else
    ge_ledger_tell "$1" "take the content engine step first, which writes your thirty pieces" \
      "Approving reads the words in content-30.md, and there are none yet."
  fi
  return 1
}

ge_ledger_usage() {
  cat >&2 <<'USAGE'
ge ledger, your content pieces. Content only. People live in growth-engine/people/

  ge ledger add-content <id> <pillar> <format> <lane>
  ge ledger set-content <id> <field> <value>
  ge ledger approve <id>
  ge ledger approve --all-text
  ge ledger list C [--status <status>]

  format    short-post, long-post, reel-script, carousel, image-caption
  lane      text or media
  field     pillar, format, lane, status, ghl_post_id, scheduled_for
  status    draft, approved, scheduled, posted, failed, archived

  approve is the only way a piece becomes approved, and a piece has to be
  approved before it can be marked scheduled or posted.
USAGE
  printf '      This lists the pieces you have so far.\n' >&2
  printf '      → run: ge ledger list C\n' >&2
  return 1
}

# ge_ledger_locate: the folder and the file, or a refusal that says which of the
# two states the founder is in. Missing folder and wrong folder are the two they
# confuse, so they get different messages.
ge_ledger_locate() {
  gl_homes=$(ge_find_home)
  gl_rc=$?
  # The shared refusal in lib/paths.sh, not ge_ledger_die with a sentence of its
  # own. The search does not stop at the folder above this one: it goes on to
  # the home folder, the Desktop, Documents and Downloads, and saying otherwise
  # sends a founder who already has a folder off to make a second one.
  #
  # No extra sentence, for the same reason the scatter refusal below carries
  # none: ge ledger list reaches this too, and "nothing was changed" is an odd
  # thing to say to somebody who only asked to see their pieces.
  if [ "$gl_rc" -eq 1 ]; then
    ge_nofolder_refusal fail >&2
    return 1
  fi
  if [ "$gl_rc" -eq 2 ]; then
    # The shared refusal in lib/paths.sh, not one written here. This used to say
    # to run ge ledger again from inside the one you want to keep, which cannot
    # clear it: the search reads the folder you are standing in, every folder
    # above it, and then the home folder, the Desktop, Documents and Downloads,
    # so standing inside one of the two still finds both and answers the same
    # way. Moving one aside does clear it, and the shared refusal hands that
    # over as a command with both names already in it.
    #
    # No extra sentence, because this one refusal is reached by list as well as
    # by the three verbs that write, and "nothing was changed" reads as an odd
    # thing to say to somebody who only asked to see their pieces.
    ge_scatter_refusal "$gl_homes" >&2
    return 1
  fi
  GE_LEDGER_HOME=$gl_homes
  GE_LEDGER_FILE="$GE_LEDGER_HOME/ledger.md"
  if [ ! -f "$GE_LEDGER_FILE" ]; then
    ge_ledger_die "$GE_LEDGER_FILE is not there, so there is nothing to read or change." \
                  "ge init" \
                  "This puts the ledger back and leaves everything else alone."
    return 1
  fi
  # There, and open. Every verb below reads this file with a plain redirection on
  # a while loop, and a redirection that fails prints the shell's own line: this
  # file's name and the line number it was reading on, which a founder reads as a
  # fault inside their own folder. Worse, a read that failed looks exactly like an
  # empty file, so one locked ledger gave four different answers and not one of
  # them was true. list said "You have no content pieces yet" and exited zero.
  # approve said there were no text pieces yet and offered to write thirty more.
  # set-content and approve said there was no piece with that id and sent the
  # founder to the list that had just told them they had none. Asked once, here,
  # so the answer is one sentence and the same sentence for every verb.
  if [ ! -r "$GE_LEDGER_FILE" ]; then
    # u+rw and not u+r. A file at 000 handed u+r comes back at 400, and every
    # ledger verb that reads it then writes it, so the founder read a second
    # refusal for one condition.
    ge_ledger_die "$GE_LEDGER_FILE is there, and ge could not open it to read." \
                  "chmod u+rw $(ge_quote "$GE_LEDGER_FILE")" \
                  "Run this, then the command you typed again."
    return 1
  fi
}

# ge_ledger_split <line>: the eight fields as GE_LEDGER_F1 to F8. Returns 1 when
# the row does not have eight, which the caller reports rather than skips.
# Done with parameter expansion, not cut, because Git Bash charges for every
# process and thirty rows would otherwise cost two hundred of them.
ge_ledger_split() {
  gl_r=${1%"$GE_LEDGER_CR"}
  gl_seps=0
  gl_scan=$gl_r
  while [ "${gl_scan#*"$GE_SEP"}" != "$gl_scan" ]; do
    gl_scan=${gl_scan#*"$GE_SEP"}
    gl_seps=$((gl_seps + 1))
  done
  [ "$gl_seps" -eq 7 ] || return 1
  GE_LEDGER_F1=${gl_r%%"$GE_SEP"*}; gl_r=${gl_r#*"$GE_SEP"}
  GE_LEDGER_F2=${gl_r%%"$GE_SEP"*}; gl_r=${gl_r#*"$GE_SEP"}
  GE_LEDGER_F3=${gl_r%%"$GE_SEP"*}; gl_r=${gl_r#*"$GE_SEP"}
  GE_LEDGER_F4=${gl_r%%"$GE_SEP"*}; gl_r=${gl_r#*"$GE_SEP"}
  GE_LEDGER_F5=${gl_r%%"$GE_SEP"*}; gl_r=${gl_r#*"$GE_SEP"}
  GE_LEDGER_F6=${gl_r%%"$GE_SEP"*}; gl_r=${gl_r#*"$GE_SEP"}
  GE_LEDGER_F7=${gl_r%%"$GE_SEP"*}
  GE_LEDGER_F8=${gl_r#*"$GE_SEP"}
  return 0
}

ge_ledger_bad_row() {
  printf 'WARN  %s: a content row has the wrong number of fields, so it was left exactly as it is.\n' "$1" >&2
  printf '      ge lint names the line. Then fix that one line by hand.\n' >&2
  printf '      → run: ge lint\n' >&2
}

# ge_ledger_snapshot: the backup, taken by ge itself so there is one ring and
# one restore path. A target that does not exist yet is a success and a no-op,
# so a first write is never blocked.
#
# ge snapshot writes a complete refusal of its own, naming the file, the folder
# and the way out. It is passed through rather than wrapped, because two FAIL
# blocks for one failure read as two problems. The message here is the fallback
# for a snapshot that fails without saying anything, which would otherwise stop
# the write in silence.
#
# What ge snapshot said is held in a variable, not in a scratch file. It used to
# be captured into a file under the temporary folder, and on a machine whose
# temporary folder cannot be written to, which is a locked down work laptop, the
# shell answered that redirection with this file's own name and the line number
# it was on, and printed it above the refusal. So the founder read a fault in
# ge's source code, then a sentence about their snapshot folder, for one problem
# that was neither. A variable needs no folder, so there is nothing left to fail
# and nothing left to tidy up afterwards.
#
# 2>&1 comes before >/dev/null on purpose: what is being kept is the refusal,
# which ge snapshot writes to standard error, and the order the other way round
# would keep the part that is thrown away.
ge_ledger_snapshot() {
  gl_err=$(sh "$GE_HOME_DIR/scripts/ge.sh" snapshot ledger.md 2>&1 >/dev/null)
  gl_snap_rc=$?
  [ "$gl_snap_rc" -eq 0 ] && return 0
  if [ -n "$gl_err" ]; then
    printf '%s\n' "$gl_err" >&2
    return 1
  fi
  # The backup folder is what refused, and ge is holding its path, so it names the
  # chmod itself rather than handing the founder to the doctor to be told the same
  # thing one step later. ge_backup_refusal falls back to ge check when the folder
  # is fine and the write failed anyway, which is the one case ge cannot name.
  printf 'FAIL  ledger.md could not be backed up, so nothing was changed.\n' >&2
  ge_backup_refusal "$GE_LEDGER_HOME/.state/snapshots" >&2
  return 1
}

# ge_ledger_may_write: is there anything ge can see standing in the way of
# putting a new ledger in place of this one.
#
# WHY IT IS ASKED AT ALL. Every write in this file builds a new ledger beside the
# founder's and renames it over the top, and a rename asks the FOLDER for
# permission, never the file. So a ledger.md a founder had set to read only was
# replaced anyway, ge said "Added piece c2." and exited 0, and the read only bit
# was gone afterwards, because the file that landed carries the working file's
# permissions and not theirs. Nothing said a word. The guard lives in
# lib/paths.sh so ge ledger, ge person, ge receipt and ge index all answer the
# same way about the same file, and ge check can never call a file read only in
# the same second ge wrote into it.
#
# Asked BEFORE the snapshot, never after, so a refusal here means what it says:
# no backup was taken, no working file was made, and the ledger is untouched.
ge_ledger_may_write() {
  ge_may_replace "$GE_LEDGER_FILE" && return 0
  ge_replace_refusal "$GE_LEDGER_FILE" >&2
  return 1
}

# ge_ledger_replace <newfile>: the temp file becomes the ledger in one move, so
# a failure halfway through never leaves the founder half a ledger.
#
# The founder's own permissions go across first. The file that lands is one ge
# built, so without this it arrives carrying whatever the umask gave it, and a
# ledger somebody had set to owner only came back readable by everybody while ge
# reported success.
#
# mv is silenced because its own line names the scratch file ge was building in
# and the line number it was building it on, and a founder handed that reads it
# as a fault in their own folder. The refusal below says the same thing in words
# they can act on.
ge_ledger_replace() {
  ge_keep_mode "$GE_LEDGER_FILE" "$1"
  mv "$1" "$GE_LEDGER_FILE" 2>/dev/null || {
    rm -f "$1" 2>/dev/null
    ge_ledger_die "the ledger could not be written." "ge check" \
                  "This says whether the folder can be written to yet."
    return 1
  }
}

# ge_ledger_enum_fail <value> <what it was meant to be> <the list>: the refusal
# for a value that is not on one of this file's controlled lists.
#
# DELIBERATE: a bare arrow, and no "run:" on it. ge knows the command that was
# typed and it knows the list the value had to come from, and it cannot know
# which of those the founder meant. Written after "→ run: " this line was a line
# somebody selected and pasted, and their shell answered about a command called
# "the". Guidance is what this is, so the arrow says so by not carrying the word
# run, and the pasteable form goes on meaning pasteable everywhere else.
#
# It opens on Pick, which is neither a shell reserved word nor the name of a
# program, so a founder who pastes it out of habit is answered about a command
# that does not exist rather than with a syntax error they cannot read.
ge_ledger_enum_fail() {
  printf 'FAIL  "%s" is not a %s.\n' "$1" "$2" >&2
  printf '      The ones that work are: %s\n' "$3" >&2
  printf '      → Pick one of those, then type the same command again with it.\n' >&2
  return 1
}

# ge_ledger_check_value <field> <value>: one gate per field, so a value that
# cannot work downstream is refused here rather than in GoHighLevel three weeks
# later with nothing to explain it.
#
# Callers set GE_LEDGER_FIXCMD to the command they were asked to run, written
# out with a whole number in place of the bad pillar, so the way out belongs to
# the verb the founder was actually using.
ge_ledger_check_value() {
  gl_f=$1; gl_v=$2
  ge_ledger_no_sep "$gl_v" "$gl_f" || return 1
  case "$gl_f" in
    pillar)
      case "$gl_v" in
        ''|*[!0-9]*)
          gl_fix=$GE_LEDGER_FIXCMD
          [ -n "$gl_fix" ] || gl_fix='ge ledger add-content 1 1 short-post text'
          ge_ledger_die "the pillar has to be a whole number, and \"$gl_v\" is not." "$gl_fix"
          return 1 ;;
      esac ;;
    lane)
      enum_ok "$gl_v" $GE_LEDGER_LANES || {
        ge_ledger_enum_fail "$gl_v" "lane" "$GE_LEDGER_LANES"
        return 1
      } ;;
    status)
      enum_ok "$gl_v" $GE_LEDGER_STATUSES || {
        ge_ledger_enum_fail "$gl_v" "status" "$GE_LEDGER_STATUSES"
        return 1
      }
      # Approval is the one transition with a gate in front of it, and the
      # publish flow trusts that gate. Letting set-content write it would mean
      # a piece could reach GoHighLevel without ever being read again.
      if [ "$gl_v" = approved ]; then
        gl_fix=$GE_LEDGER_FIXID
        [ -n "$gl_fix" ] || gl_fix=1
        # Same two locks as the draft gate below, so the same helper picks.
        ge_ledger_die_approve "set-content does not approve a piece." "$gl_fix" \
          "This approves that one piece. Every text piece at once is ge ledger approve --all-text."
        return 1
      fi ;;
    scheduled_for)
      [ "$gl_v" = '-' ] && return 0
      # Shape checked here rather than by date, because GNU date accepts words
      # like "tomorrow" and BSD date does not, and the two founders comparing
      # notes would both be right.
      case "$gl_v" in
        [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) return 0 ;;
        [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]) return 0 ;;
        [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]) return 0 ;;
      esac
      gl_fix=$GE_LEDGER_FIXID
      [ -n "$gl_fix" ] || gl_fix=1
      ge_ledger_die "\"$gl_v\" is not a date the toolkit can read." \
                    "ge ledger set-content $(ge_ledger_word "$gl_fix") scheduled_for 2026-09-25T09:00" \
                    "Write the day, or the day and the time. A dash means no date yet."
      return 1 ;;
    format)
      # Held to the list, and the empty format falls out of the same test rather
      # than getting a message of its own. An empty value is not a format either,
      # and the old separate sentence offered a dash to leave it unset, which is
      # true of a post id and of a date and was never true here: every piece has
      # a shape, and a row carrying a dash where the shape goes tells the founder
      # nothing when they read it back three weeks later.
      enum_ok "$gl_v" $GE_LEDGER_FORMATS || {
        ge_ledger_enum_fail "$gl_v" "format" "$GE_LEDGER_FORMATS"
        return 1
      } ;;
    ghl_post_id)
      # A dash is what this field holds until the piece has actually gone out,
      # so the way to empty it is to write the dash rather than to write nothing.
      # The line used to say that instead of handing it over, and a founder who
      # had just been refused for typing nothing had to work out what to type.
      [ -n "$gl_v" ] || {
        gl_fix=$GE_LEDGER_FIXID
        [ -n "$gl_fix" ] || gl_fix=1
        ge_ledger_die "the post id cannot be empty. A dash is how a piece that has not gone out yet is written." \
                      "ge ledger set-content $(ge_ledger_word "$gl_fix") ghl_post_id -"
        return 1
      } ;;
  esac
  return 0
}

# ge_ledger_row_id <line>: sets GE_LEDGER_ROWID to the id a row carries, read
# without splitting it into eight fields, so a row that is short or long can
# still be named by its id.
#
# Parameter expansion rather than cut, for the reason ge_ledger_split gives: Git
# Bash charges for every process. Callers only reach this with a line that has
# already matched "C" plus the separator, so there is always a separator to cut
# the row letter off at.
ge_ledger_row_id() {
  gl_rid=${1%"$GE_LEDGER_CR"}
  gl_rid=${gl_rid#*"$GE_SEP"}
  GE_LEDGER_ROWID=${gl_rid%%"$GE_SEP"*}
}

# ge_ledger_find <id>: fills F1 to F8 from the row with that id, or returns 1.
# Sets GE_LEDGER_BROKEN when the id is on a row it could not read, so the caller
# can say which of the two happened.
#
# A row with the wrong number of fields used to be skipped here and nowhere
# else. ge ledger list prints it, ge ledger approve --all-text reports it, and
# this returned the same "not found" it returns for an id that was never used.
# So set-content and approve told the founder there was no piece with that id
# and sent them to a list the piece was sitting in, and add-content, which asks
# this to stop two rows sharing one key, was told the key was free and wrote a
# second row with it.
ge_ledger_find() {
  gl_want=$1
  gl_hit=1
  GE_LEDGER_BROKEN=no
  while IFS= read -r gl_line || [ -n "$gl_line" ]; do
    case "$gl_line" in
      "C$GE_SEP"*) ;;
      *) continue ;;
    esac
    if ! ge_ledger_split "$gl_line"; then
      ge_ledger_row_id "$gl_line"
      [ "$GE_LEDGER_ROWID" = "$gl_want" ] && GE_LEDGER_BROKEN=yes
      continue
    fi
    if [ "$GE_LEDGER_F2" = "$gl_want" ]; then
      gl_hit=0
      break
    fi
  done < "$GE_LEDGER_FILE"
  return $gl_hit
}

# ge_ledger_no_such_id <id>: the two reasons a search comes back empty, told
# apart. The row is the problem in one of them and the id is the problem in the
# other, and the way out is not the same command.
ge_ledger_no_such_id() {
  if [ "$GE_LEDGER_BROKEN" = yes ]; then
    ge_ledger_die "piece $1 is in your ledger, and its row has the wrong number of fields, so ge cannot change it." \
                  "ge lint" \
                  "ge lint names the line. Then fix that one line by hand."
    return 1
  fi
  ge_ledger_die "there is no content piece with the id $1." \
                "ge ledger list C" \
                "This lists the ids you have."
  return 1
}

# ge_ledger_check_status_move <id> <status now> <status wanted>: the second half
# of the approval gate.
#
# Refusing the word "approved" on its own was never the gate. scheduled and
# posted are the two that put a piece in front of an audience, and a piece that
# reached either of them from draft went out without anyone reading it again.
# Both are allowed once the piece has been approved, because that is how the
# publish flow records what it did.
ge_ledger_check_status_move() {
  case "$3" in
    scheduled|posted) ;;
    *) return 0 ;;
  esac
  [ "$2" = draft ] || return 0
  ge_ledger_die_approve \
    "piece $1 is still a draft, so it cannot be marked $3 yet. A piece is read and approved first." \
    "$1" "Run this, then the command you typed again."
  return 1
}

ge_ledger_add_content() {
  if ge_ledger_dashdash "$@"; then shift; fi
  [ $# -eq 4 ] || {
    ge_ledger_die "add-content needs four things: an id, a pillar number, a format and a lane." \
                  "ge ledger add-content 1 1 short-post text"
    return 1
  }
  gl_id=$1; gl_pillar=$2; gl_format=$3; gl_lane=$4

  ge_ledger_id_ok "$gl_id" "ge ledger add-content 1 1 short-post text" || return 1
  # Refused here rather than in approve, because approve is the one verb that
  # makes a piece publishable and a row it cannot name is a piece the founder
  # can write and can never post. The suggestion is their own id with the
  # dashes taken off, so the fix is one keystroke.
  case "$gl_id" in
    -*)
      gl_try=$gl_id
      while [ "${gl_try#-}" != "$gl_try" ]; do
        gl_try=${gl_try#-}
      done
      [ -n "$gl_try" ] || gl_try=1
      # DELIBERATE: a bare arrow, and no "run:" on it. The id is the first of the
      # four things add-content takes, and the other three have not been read
      # yet, so any command written out here could carry a second wrong value and
      # refuse all over again. That is the whole reason the checks below run in
      # the order they do. What ge does know is the id that would work, so it
      # names that one thing and leaves the founder to type their own line back.
      #
      # It opens on Give, which is neither a shell reserved word nor the name of
      # a program, so a founder who pastes it out of habit is answered about a
      # command that does not exist rather than with a syntax error.
      #
      # The id goes through ge_ledger_word, so one carrying a space comes back in
      # quotes and the sentence still says which id is meant.
      printf 'FAIL  "%s" cannot be an id, because an id cannot start with a dash. approve would read it as an option and never find the piece.\n' \
        "$gl_id" >&2
      printf '      → Give the piece the id %s instead, then type the command again.\n' \
        "$(ge_ledger_word "$gl_try")" >&2
      return 1 ;;
  esac
  GE_LEDGER_FIXID=$gl_id
  # The format and the lane are checked before the pillar, and the command handed
  # back for a bad pillar is written out of them afterwards. Checked the other way
  # round, a founder who got two fields wrong was handed a command carrying the
  # second wrong one, so the line they pasted refused all over again. Their own
  # values go through ge_ledger_word, so an id or a format with a space in it
  # comes back quoted and the line runs as it reads.
  ge_ledger_check_value format "$gl_format" || return 1
  ge_ledger_check_value lane "$gl_lane" || return 1
  GE_LEDGER_FIXCMD="ge ledger add-content $(ge_ledger_word "$gl_id") 1 $(ge_ledger_word "$gl_format") $(ge_ledger_word "$gl_lane")"
  ge_ledger_check_value pillar "$gl_pillar" || return 1

  # An id twice would give two rows one key, and every later set-content would
  # change one of them at random.
  if ge_ledger_find "$gl_id"; then
    ge_ledger_die "there is already a content piece with the id $gl_id." \
                  "ge ledger set-content $(ge_ledger_word "$gl_id") format $(ge_ledger_word "$gl_format")" \
                  "This changes the piece you already have."
    return 1
  fi
  # The same key, on a row ge could not read. The search above has to answer no
  # to it, because the fields it would have filled are not there, and writing the
  # row anyway is exactly what the check above exists to stop. Pointed at ge lint
  # rather than at set-content, because set-content cannot reach that row either.
  if [ "$GE_LEDGER_BROKEN" = yes ]; then
    ge_ledger_die "there is already a row with the id $gl_id, and it has the wrong number of fields." \
                  "ge lint" \
                  "ge lint names the line. Then fix that one line by hand."
    return 1
  fi

  # Asked before the backup, so a ledger ge will not replace costs the founder
  # nothing: no snapshot, no working file, and their own setting still on.
  ge_ledger_may_write || return 1
  ge_ledger_snapshot || return 1

  gl_tmp="$GE_LEDGER_FILE.ge-tmp.$$"
  ( cat "$GE_LEDGER_FILE" > "$gl_tmp" ) 2>/dev/null || {
    rm -f "$gl_tmp" 2>/dev/null
    ge_ledger_die "the ledger could not be written." "ge check" \
                  "This says whether the folder can be written to yet."
    return 1
  }

  # A file whose last byte is not a line break takes the new row onto the end of
  # whatever is already there. The founder's own last sentence then has a row of
  # ge's data stuck to it, and the piece is in no list and cannot be approved,
  # while add-content says it worked. Any editor can save a file without that
  # last byte, and ledger.md is a file founders open.
  #
  # $(...) drops trailing line breaks, so an empty answer here means the file
  # already ends the way it should. A carriage return is not a line break, so a
  # file saved on Windows is closed off the way that file already reads.
  if [ -s "$gl_tmp" ] && [ -n "$(tail -c 1 "$gl_tmp" 2>/dev/null)" ]; then
    ( printf '\n' >> "$gl_tmp" ) 2>/dev/null || {
      rm -f "$gl_tmp" 2>/dev/null
      ge_ledger_die "the ledger could not be written." "ge check" \
                    "This says whether the folder can be written to yet."
      return 1
    }
  fi

  ( printf 'C%s%s%s%s%s%s%s%s%sdraft%s-%s-\n' \
      "$GE_SEP" "$gl_id" "$GE_SEP" "$gl_pillar" "$GE_SEP" "$gl_format" "$GE_SEP" "$gl_lane" \
      "$GE_SEP" "$GE_SEP" "$GE_SEP" >> "$gl_tmp" ) 2>/dev/null || {
    rm -f "$gl_tmp" 2>/dev/null
    ge_ledger_die "the ledger could not be written." "ge check" \
                  "This says whether the folder can be written to yet."
    return 1
  }
  ge_ledger_replace "$gl_tmp" || return 1

  printf 'Added piece %s. Pillar %s, %s, %s lane, status draft.\n' \
    "$gl_id" "$gl_pillar" "$gl_format" "$gl_lane"
}

ge_ledger_set_content() {
  if ge_ledger_dashdash "$@"; then shift; fi
  # The example is a format rather than a status. A draft cannot be marked
  # scheduled, so the old one refused for a second reason the moment anybody
  # pasted it, which is the whole failure this line exists to avoid.
  [ $# -eq 3 ] || {
    ge_ledger_die "set-content needs three things: an id, a field and a value." \
                  "ge ledger set-content 1 format short-post"
    return 1
  }
  gl_id=$1; gl_field=$2; gl_value=$3

  ge_ledger_id_ok "$gl_id" "ge ledger list C" "This lists the ids you have." || return 1
  enum_ok "$gl_field" $GE_LEDGER_FIELDS || {
    ge_ledger_enum_fail "$gl_field" "field on a content piece" "$GE_LEDGER_FIELDS"
    return 1
  }
  GE_LEDGER_FIXID=$gl_id
  GE_LEDGER_FIXCMD="ge ledger set-content $(ge_ledger_word "$gl_id") pillar 1"
  ge_ledger_check_value "$gl_field" "$gl_value" || return 1
  ge_ledger_find "$gl_id" || { ge_ledger_no_such_id "$gl_id"; return 1; }
  if [ "$gl_field" = status ]; then
    ge_ledger_check_status_move "$gl_id" "$GE_LEDGER_F6" "$gl_value" || return 1
  fi

  # Asked before the backup, for the reason set out on ge_ledger_may_write.
  ge_ledger_may_write || return 1
  ge_ledger_snapshot || return 1

  gl_tmp="$GE_LEDGER_FILE.ge-tmp.$$"
  gl_old=''
  # The scratch file is claimed on its own line first. A folder that cannot be
  # written to makes the shell print the name of that file and the line it was
  # opened on, and the block below has to keep its own error output so a row it
  # cannot read is still reported.
  true 2>/dev/null > "$gl_tmp" || {
    ge_ledger_die "the ledger could not be written." "ge check" \
                  "This says whether the folder can be written to yet."
    return 1
  }
  {
    while IFS= read -r gl_line || [ -n "$gl_line" ]; do
      case "$gl_line" in
        "C$GE_SEP"*) ;;
        *) printf '%s\n' "$gl_line"; continue ;;
      esac
      if ! ge_ledger_split "$gl_line"; then
        ge_ledger_bad_row "$GE_LEDGER_FILE"
        printf '%s\n' "$gl_line"
        continue
      fi
      if [ "$GE_LEDGER_F2" != "$gl_id" ]; then
        printf '%s\n' "$gl_line"
        continue
      fi
      case "$gl_field" in
        pillar)        gl_old=$GE_LEDGER_F3; GE_LEDGER_F3=$gl_value ;;
        format)        gl_old=$GE_LEDGER_F4; GE_LEDGER_F4=$gl_value ;;
        lane)          gl_old=$GE_LEDGER_F5; GE_LEDGER_F5=$gl_value ;;
        status)        gl_old=$GE_LEDGER_F6; GE_LEDGER_F6=$gl_value ;;
        ghl_post_id)   gl_old=$GE_LEDGER_F7; GE_LEDGER_F7=$gl_value ;;
        scheduled_for) gl_old=$GE_LEDGER_F8; GE_LEDGER_F8=$gl_value ;;
      esac
      printf '%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s\n' \
        "$GE_LEDGER_F1" "$GE_SEP" "$GE_LEDGER_F2" "$GE_SEP" "$GE_LEDGER_F3" "$GE_SEP" \
        "$GE_LEDGER_F4" "$GE_SEP" "$GE_LEDGER_F5" "$GE_SEP" "$GE_LEDGER_F6" "$GE_SEP" \
        "$GE_LEDGER_F7" "$GE_SEP" "$GE_LEDGER_F8"
    done < "$GE_LEDGER_FILE"
  } > "$gl_tmp" || {
    rm -f "$gl_tmp" 2>/dev/null
    ge_ledger_die "the ledger could not be written." "ge check" \
                  "This says whether the folder can be written to yet."
    return 1
  }
  ge_ledger_replace "$gl_tmp" || return 1

  printf 'Piece %s: %s was %s, and is now %s.\n' "$gl_id" "$gl_field" "$gl_old" "$gl_value"
}

# ge_ledger_stamp_approval: the time the approval happened, so ge lint can tell
# an approval of the text that is there now from an approval of the text the
# founder has since rewritten.
ge_ledger_stamp_approval() {
  gl_state="$GE_LEDGER_HOME/.state"
  mkdir -p "$gl_state" 2>/dev/null || {
    ge_ledger_die "the approval time could not be recorded in $gl_state." \
                  "ge check" \
                  "This says whether the folder can be written to yet. Then approve again."
    return 1
  }
  gl_tmp="$gl_state/approved-at.ge-tmp.$$"
  ( date +%Y-%m-%dT%H:%M:%S > "$gl_tmp" ) 2>/dev/null || {
    rm -f "$gl_tmp" 2>/dev/null
    ge_ledger_die "the approval time could not be recorded." "ge check" \
                  "This says whether the folder can be written to yet. Then approve again."
    return 1
  }
  mv "$gl_tmp" "$gl_state/approved-at" 2>/dev/null || {
    rm -f "$gl_tmp" 2>/dev/null
    ge_ledger_die "the approval time could not be recorded." "ge check" \
                  "This says whether the folder can be written to yet. Then approve again."
    return 1
  }
}

# ge_ledger_rewrite_approved: every row matching the mode goes to approved.
# Mode "one" is the single id in GE_LEDGER_TARGET, mode "all-text" is every text
# lane row that is a draft or is already approved, which is the same test the
# counting pass uses.
#
# Already approved rows are taken again on purpose. An approval is of the words
# as they read today, so a founder who edits content-30.md has to be able to say
# so, and ge lint tells them to. Refusing them left that instruction with no
# command behind it.
ge_ledger_rewrite_approved() {
  gl_mode=$1
  gl_tmp="$GE_LEDGER_FILE.ge-tmp.$$"
  # Claimed on its own line first, for the reason set out in set-content.
  true 2>/dev/null > "$gl_tmp" || {
    ge_ledger_die "the ledger could not be written." "ge check" \
                  "This says whether the folder can be written to yet."
    return 1
  }
  {
    while IFS= read -r gl_line || [ -n "$gl_line" ]; do
      case "$gl_line" in
        "C$GE_SEP"*) ;;
        *) printf '%s\n' "$gl_line"; continue ;;
      esac
      if ! ge_ledger_split "$gl_line"; then
        ge_ledger_bad_row "$GE_LEDGER_FILE"
        printf '%s\n' "$gl_line"
        continue
      fi
      gl_take=no
      if [ "$gl_mode" = one ]; then
        [ "$GE_LEDGER_F2" = "$GE_LEDGER_TARGET" ] && gl_take=yes
      elif [ "$GE_LEDGER_F5" = text ]; then
        case "$GE_LEDGER_F6" in
          draft|approved) gl_take=yes ;;
        esac
      fi
      if [ "$gl_take" = no ]; then
        printf '%s\n' "$gl_line"
        continue
      fi
      printf '%s%s%s%s%s%s%s%s%s%sapproved%s%s%s%s\n' \
        "$GE_LEDGER_F1" "$GE_SEP" "$GE_LEDGER_F2" "$GE_SEP" "$GE_LEDGER_F3" "$GE_SEP" \
        "$GE_LEDGER_F4" "$GE_SEP" "$GE_LEDGER_F5" "$GE_SEP" \
        "$GE_SEP" "$GE_LEDGER_F7" "$GE_SEP" "$GE_LEDGER_F8"
    done < "$GE_LEDGER_FILE"
  } > "$gl_tmp" || {
    rm -f "$gl_tmp" 2>/dev/null
    ge_ledger_die "the ledger could not be written." "ge check" \
                  "This says whether the folder can be written to yet."
    return 1
  }
  ge_ledger_replace "$gl_tmp" || return 1
}

# ge_ledger_words: there has to be something to approve.
#
# An approval is of one text. ge lint holds the time of the approval against the
# time content-30.md was last edited, and the publish flow sends what is in that
# file. With no file, approve was recording a decision about words nobody had
# written, and saying in as many words that it had read them.
ge_ledger_words() {
  gl_words="$GE_LEDGER_HOME/content-30.md"
  if [ ! -f "$gl_words" ]; then
    ge_ledger_tell "there are no words to approve yet. content-30.md is not in your growth-engine folder." \
                   "take the content engine step first, which writes your thirty pieces"
    return 1
  fi
  if [ ! -s "$gl_words" ]; then
    ge_ledger_tell "content-30.md has nothing in it, so there are no words to approve." \
                   "take the content engine step first, which writes your thirty pieces"
    return 1
  fi
  return 0
}

ge_ledger_approve_one() {
  ge_ledger_id_ok "$1" "ge ledger list C" "This lists the ids you have." || return 1
  ge_ledger_find "$1" || { ge_ledger_no_such_id "$1"; return 1; }
  gl_was=$GE_LEDGER_F6
  # A piece that is scheduled or posted has gone out, and failed and archived
  # are decisions somebody took. Writing approved over any of the four would
  # quietly undo that, so the way back is named instead of taken.
  case "$gl_was" in
    draft|approved) ;;
    *)
      # The id goes through ge_ledger_word, like every other id written into a
      # recovery line here. Bare, an id with a space in it, and "week one" is a
      # name a founder gives a piece, split into two arguments, so the line they
      # were handed answered "set-content needs three things" and the refusal had
      # no way out of it at all.
      ge_ledger_die "piece $1 is $gl_was, and approving it now would put it back to approved." \
                    "ge ledger set-content $(ge_ledger_word "$1") status draft" \
                    "Run this, then approve it again."
      return 1 ;;
  esac
  ge_ledger_words || return 1
  # Asked before the backup, for the reason set out on ge_ledger_may_write.
  ge_ledger_may_write || return 1
  ge_ledger_snapshot || return 1
  GE_LEDGER_TARGET=$1
  ge_ledger_rewrite_approved one || return 1
  ge_ledger_stamp_approval || return 1
  if [ "$gl_was" = approved ]; then
    printf 'Piece %s was already approved.\n' "$1"
  else
    printf 'Approved piece %s.\n' "$1"
  fi
  printf 'You approved the words that are in content-30.md right now. Edit them and approve again.\n'
}

ge_ledger_approve_all_text() {
  gl_new=0
  gl_again=0
  gl_held=''
  gl_firstheld=''
  gl_text=0
  while IFS= read -r gl_line || [ -n "$gl_line" ]; do
    case "$gl_line" in
      "C$GE_SEP"*) ;;
      *) continue ;;
    esac
    ge_ledger_split "$gl_line" || { ge_ledger_bad_row "$GE_LEDGER_FILE"; continue; }
    [ "$GE_LEDGER_F5" = text ] || continue
    gl_text=$((gl_text + 1))
    case "$GE_LEDGER_F6" in
      draft)    gl_new=$((gl_new + 1)) ;;
      approved) gl_again=$((gl_again + 1)) ;;
      *)
        [ -n "$gl_firstheld" ] || gl_firstheld=$GE_LEDGER_F2
        gl_held="$gl_held
  piece $GE_LEDGER_F2 is $GE_LEDGER_F6, so it was left alone" ;;
    esac
  done < "$GE_LEDGER_FILE"

  if [ "$gl_text" -eq 0 ]; then
    ge_ledger_tell "there are no text lane pieces in the ledger yet." \
                   "take the content engine step first, which writes your thirty pieces"
    return 1
  fi
  if [ "$((gl_new + gl_again))" -eq 0 ]; then
    printf 'FAIL  none of your %s text pieces can be approved.\n' "$gl_text" >&2
    printf '%s\n' "$gl_held" | sed '/^$/d; s/^  /      /' >&2
    # The id of the first one held back, so the way out is a command rather than
    # a shape. A hand-edited row can leave the id blank, and a line with a hole
    # where the id should be is no better than no line at all. Quoted through
    # ge_ledger_word for the same reason approve_one quotes it: an id with a
    # space in it splits into two arguments and set-content then refuses.
    if [ -n "$gl_firstheld" ]; then
      printf '      Run this, then approve it again.\n' >&2
      printf '      → run: ge ledger set-content %s status draft\n' \
        "$(ge_ledger_word "$gl_firstheld")" >&2
    else
      printf '      This shows where each piece has got to.\n' >&2
      printf '      → run: ge ledger list C\n' >&2
    fi
    return 1
  fi

  ge_ledger_words || return 1
  # Asked before the backup, for the reason set out on ge_ledger_may_write.
  ge_ledger_may_write || return 1
  ge_ledger_snapshot || return 1
  GE_LEDGER_TARGET=''
  ge_ledger_rewrite_approved all-text || return 1
  ge_ledger_stamp_approval || return 1

  if [ "$gl_new" -eq 1 ]; then
    printf 'Approved 1 text piece.\n'
  elif [ "$gl_new" -gt 1 ]; then
    printf 'Approved %s text pieces.\n' "$gl_new"
  fi
  if [ "$gl_again" -eq 1 ]; then
    printf '1 text piece was already approved, and its approval now covers the words as they read today.\n'
  elif [ "$gl_again" -gt 1 ]; then
    printf '%s text pieces were already approved, and their approval now covers the words as they read today.\n' "$gl_again"
  fi
  [ -n "$gl_held" ] && printf '%s\n' "$gl_held" | sed '/^$/d'
  printf 'Media pieces were not touched. Approve those one at a time once the asset exists.\n'
  printf 'You approved the words that are in content-30.md right now. Edit them and approve again.\n'
  return 0
}

ge_ledger_approve() {
  gl_literal=no
  if ge_ledger_dashdash "$@"; then
    gl_literal=yes
    shift
  fi
  # The way out is ge ledger approve --all-text only where that command can
  # actually run. In the folder a founder has between session 1 and session 2
  # there are rows in the ledger and no content-30.md, so approve refuses on the
  # missing words whatever is typed after it, and this line sent them from one
  # refusal straight into another. ge_ledger_words_there is the same pair of
  # tests approve itself refuses on.
  [ $# -eq 1 ] || {
    if ge_ledger_words_there; then
      ge_ledger_die "approve needs one thing: an id, or --all-text." \
                    "ge ledger approve --all-text"
    else
      ge_ledger_tell "approve needs one thing: an id, or --all-text." \
                     "take the content engine step first, which writes your thirty pieces" \
                     "Approving reads the words in content-30.md, and there are none yet."
    fi
    return 1
  }
  # Both tests are skipped after "--", including the one for --all-text, because
  # a founder who typed the marker is naming a row and a row may be called that.
  if [ "$gl_literal" = no ]; then
    if [ "$1" = --all-text ]; then
      ge_ledger_approve_all_text
      return $?
    fi
    case "$1" in
      -*)
        # Same two locks, and the same reason as the count above: --all-text is
        # only a way out where there is something for it to approve.
        if ge_ledger_words_there; then
          ge_ledger_die "approve does not have an option called \"$1\"." \
                        "ge ledger approve --all-text" \
                        "If that was an id, name it as ge ledger approve -- $(ge_ledger_word "$1")"
        else
          # The id hint is still true here and is kept, and the sentence that
          # explains the arrow goes under it, next to the arrow it explains.
          ge_ledger_tell "approve does not have an option called \"$1\"." \
                         "take the content engine step first, which writes your thirty pieces" \
                         "If that was an id, name it as ge ledger approve -- $(ge_ledger_word "$1")" \
                         "Approving reads the words in content-30.md, and there are none yet."
        fi
        return 1 ;;
    esac
  fi
  ge_ledger_approve_one "$1"
}

# ge_ledger_list: one piece per line, in columns with a heading over them.
#
# It used to print the row exactly as the file stores it, which is a letter, an
# id and six values run together with the character that separates them. That is
# the storage, not an answer, and there is nothing anywhere that tells a founder
# how to read it. It also said nothing at all when there was nothing to show, so
# a founder could not tell an empty ledger from a command that had broken.
#
# The heading and the empty answer go to standard error, the way ge person list
# and ge remember list put everything that is not a record there, so counting
# the lines this prints still counts pieces and nothing else.
ge_ledger_list() {
  [ $# -ge 1 ] || {
    ge_ledger_die "list needs to know what to list." \
                  "ge ledger list C" \
                  "C is your content pieces, and it is the one kind the ledger holds."
    return 1
  }
  gl_type=$1; shift
  case "$gl_type" in
    O)
      printf 'FAIL  ge ledger list O: the ledger holds content pieces only. People moved to growth-engine/people/\n' >&2
      printf '      → run: ge person list --kind prospect\n' >&2
      return 1 ;;
    D)
      printf 'FAIL  ge ledger list D: the ledger holds content pieces only. People moved to growth-engine/people/\n' >&2
      printf '      → run: ge person list --kind target\n' >&2
      return 1 ;;
    C) ;;
    *)
      ge_ledger_die "the ledger has one kind of row, and it is C." \
                    "ge ledger list C"
      return 1 ;;
  esac

  gl_filter=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --status)
        [ $# -ge 2 ] || {
          ge_ledger_die "--status needs a status after it." \
                        "ge ledger list C --status approved"
          return 1
        }
        gl_filter=$2
        enum_ok "$gl_filter" $GE_LEDGER_STATUSES || {
          ge_ledger_enum_fail "$gl_filter" "status" "$GE_LEDGER_STATUSES"
          return 1
        }
        shift 2 ;;
      *)
        ge_ledger_die "list does not understand \"$1\"." \
                      "ge ledger list C --status approved"
        return 1 ;;
    esac
  done

  # Counted first, so the heading only appears when there is something under it.
  # Two passes over thirty rows rather than a scratch file, because listing is a
  # read and it has to work in a folder that cannot be written to.
  gl_shown=0
  gl_total=0
  while IFS= read -r gl_line || [ -n "$gl_line" ]; do
    case "$gl_line" in
      "C$GE_SEP"*) ;;
      *) continue ;;
    esac
    gl_total=$((gl_total + 1))
    if ge_ledger_split "$gl_line"; then
      [ -z "$gl_filter" ] || [ "$GE_LEDGER_F6" = "$gl_filter" ] || continue
    fi
    gl_shown=$((gl_shown + 1))
  done < "$GE_LEDGER_FILE"

  if [ "$gl_shown" -eq 0 ]; then
    if [ "$gl_total" -eq 0 ]; then
      printf 'You have no content pieces yet.\n' >&2
      printf '      → take the content engine step first, which writes your thirty pieces\n' >&2
    elif [ "$gl_total" -eq 1 ]; then
      printf 'Your one content piece is not %s.\n' "$gl_filter" >&2
      printf '      This shows where each piece has got to.\n' >&2
      printf '      → run: ge ledger list C\n' >&2
    else
      printf 'None of your %s content pieces is %s.\n' "$gl_total" "$gl_filter" >&2
      printf '      This shows where each piece has got to.\n' >&2
      printf '      → run: ge ledger list C\n' >&2
    fi
    return 0
  fi

  printf "$GE_LEDGER_ROWFMT" id pillar format lane status 'goes out' 'post id' >&2

  while IFS= read -r gl_line || [ -n "$gl_line" ]; do
    case "$gl_line" in
      "C$GE_SEP"*) ;;
      *) continue ;;
    esac
    if ! ge_ledger_split "$gl_line"; then
      # Printed anyway, and printed as it stands, because a row with the wrong
      # number of fields cannot be laid out in columns and a row held back from
      # a count is a piece of work the founder thinks they have not done.
      ge_ledger_bad_row "$GE_LEDGER_FILE"
      printf '%s\n' "${gl_line%"$GE_LEDGER_CR"}"
      continue
    fi
    [ -z "$gl_filter" ] || [ "$GE_LEDGER_F6" = "$gl_filter" ] || continue
    printf "$GE_LEDGER_ROWFMT" \
      "$GE_LEDGER_F2" "$GE_LEDGER_F3" "$GE_LEDGER_F4" "$GE_LEDGER_F5" \
      "$GE_LEDGER_F6" "$GE_LEDGER_F8" "$GE_LEDGER_F7"
  done < "$GE_LEDGER_FILE"
  return 0
}

ge_ledger_main() {
  [ $# -ge 1 ] || { ge_ledger_usage; return 1; }
  gl_verb=$1; shift
  case "$gl_verb" in
    add-content|set-content|approve|list) ;;
    # Asking for the list is not a mistake. This used to answer an explicit
    # ge ledger help with a FAIL banner saying there was no verb called help,
    # and then print the list underneath it. ge person help already reads this
    # way, so a founder gets the same answer whichever one they try.
    help|-h|--help)
      ge_ledger_usage
      return 0 ;;
    add-outreach|set-outreach)
      ge_ledger_die "ge ledger $gl_verb is gone. The ledger holds content pieces only, and people live in growth-engine/people/" \
                    "ge person add prospect <email> \"<name>\""
      return 1 ;;
    add-dm|set-dm)
      ge_ledger_die "ge ledger $gl_verb is gone. The ledger holds content pieces only, and people live in growth-engine/people/" \
                    "ge person add target <platform> <handle> \"<name>\""
      return 1 ;;
    *)
      printf 'FAIL  ge ledger has no verb called "%s".\n' "$gl_verb" >&2
      ge_ledger_usage
      return 1 ;;
  esac

  ge_ledger_locate || return 1

  case "$gl_verb" in
    add-content) ge_ledger_add_content "$@" ;;
    set-content) ge_ledger_set_content "$@" ;;
    approve)     ge_ledger_approve "$@" ;;
    list)        ge_ledger_list "$@" ;;
  esac
}

ge_ledger_main "$@"
