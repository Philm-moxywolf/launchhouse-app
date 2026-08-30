#!/bin/sh
# table.sh: reading and writing the line-oriented state files.
#
# WHY IT EXISTS: the founder floor is POSIX sh under Git Bash, so there is no
#                jq and state cannot be JSON. Every machine-read file is one
#                record per line with a fixed delimiter, and the parsing rules
#                live here once rather than in every subcommand.
# CALLED BY:     ge ledger, ge lint, ge accounts, ge log, ge receipt. Counted off
#                the sources, because this line used to name index and person,
#                which call nothing here, and left out four that do. The list is
#                how the next person judges what a change in here can reach.
# READS:         whatever it is handed  WRITES: nothing, callers own their files
# POSTURE:       fail-closed. A row with the wrong field count is reported, never
#                silently skipped, because a skipped row is a fact that vanished
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Strips \r on every read.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE, AND HERE IT IS ALWAYS THE BARE
#                SHAPE. "→ run: " promises a command: everything after that
#                marker to the end of the line is pasted and run. The only
#                messages this file prints are about a value the founder typed,
#                and the value they meant is the one thing that never reached ge,
#                so there is no command to put there. Both therefore use "→ "
#                and one named action, opening on a verb that is neither a shell
#                reserved word nor the name of a program, so a founder who pastes
#                it out of habit gets an answer rather than a syntax error.
set -u

# The delimiter. Pipe, because it cannot appear in an email, a handle, a status
# or an id, and because the founder can read the file without a tool.
GE_SEP='|'

# A literal line break, built with a quoted break rather than $(printf '\n').
# Command substitution strips trailing newlines, so the obvious spelling gave an
# empty string, the pattern below became *""* and no_sep refused every value it
# was ever handed. Three subcommands wrote private workarounds around that
# rather than the guard being fixed, so the fix lives here and they call it.
GE_NL='
'

# row_field <line> <n>: the nth field, 1 based, with \r already gone.
row_field() {
  printf '%s' "$1" | tr -d '\r' | cut -d"$GE_SEP" -f"$2"
}

# row_count <line>: how many fields the row actually has.
row_count() {
  printf '%s' "$1" | tr -d '\r' | awk -F"$GE_SEP" '{print NF}'
}

# rows_of_type <file> <letter>: every data row of one type, comments dropped.
#
# Three answers, not two, because "no rows of that type" and "this machine could
# not look" are different facts and handing back the same silent nothing for both
# is how a caller comes to tell a founder their ledger is empty when it is full.
# Nothing is printed here either way: the caller owns the message, the same way
# it owns the file.
#
#   0 and no rows   the file is not there. Ordinary, and not a fault: ge writes
#                   these files on first use, so a founder who has not reached
#                   that verb yet has no file and no rows.
#   0 and rows      it was read, and these are the rows of that type in it.
#   2               it is there and could not be read. A sync client holding it,
#                   or a folder that came back from a backup without its
#                   permissions, are the ordinary ways in.
rows_of_type() {
  [ -f "$1" ] || return 0
  # What the answer below is allowed to claim: a plain file this user can read.
  [ -r "$1" ] || return 2
  # The suppression goes BEFORE the input redirect, and that order is the whole
  # point. Written after it the shell has already printed "cannot open" with
  # this source file's own path and a line number in it, which is the one thing
  # a founder must never be handed. Proved under sh, dash and bash: with the
  # redirects the other way round the line still comes out.
  tr -d '\r' 2>/dev/null < "$1" | grep "^$2$GE_SEP" || true
}

# enum_ok <value> <allowed...>: 0 when the value is in the list.
# Callers print the allowed list on failure, which is what makes the error
# actionable rather than just a refusal.
enum_ok() {
  eo_v=$1; shift
  for eo_a in "$@"; do
    [ "$eo_v" = "$eo_a" ] && return 0
  done
  return 1
}

# no_sep <value> <fieldname>: refuses a value carrying the delimiter, because a
# row that gains a field silently shifts every field after it.
#
# Both ways out are bare arrows, and they used to be "→ run:" lines carrying no
# command at all: "the same command with that character removed" and "the same
# command on one line". A founder selects the whole line and pastes it, so what
# they got back was "the: not found". ge cannot write the command here, because
# the value the founder meant is the one thing it never received and the shell
# has already taken their quotes off. Handing back what did arrive would be
# handing them their own mistake to paste again. So each names the one change to
# make to what they typed, and the FAIL line above it has already named the
# character or the line break, which is what "that character" points at.
#
# The same two conditions are worded the same way in cmd/person.sh, so a founder
# who meets both reads one problem rather than two.
no_sep() {
  case "$1" in
    *"$GE_SEP"*)
      printf 'FAIL  the %s cannot contain the %s character, because it separates fields.\n' "$2" "$GE_SEP" >&2
      printf '      → Take that character out, then run the same command again.\n' >&2
      return 1 ;;
  esac
  case "$1" in
    *"$GE_NL"*)
      printf 'FAIL  the %s cannot contain a line break.\n' "$2" >&2
      printf '      → Put the value on one line, then run the same command again.\n' >&2
      return 1 ;;
  esac
  return 0
}
