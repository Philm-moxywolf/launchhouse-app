# receipt.sh: the setup receipt. The one writer of .state/receipt.md. Sourced by ge.sh.
#
# WHY IT EXISTS: ge context raises the 80 day token age warning by reading one
#                line of this file. Without a single writer that line is prose,
#                written differently by every skill, and the warning either never
#                fires or fires at a founder whose token is fine. Either way the
#                first they hear of a dead token is a post that will not send
#                during the event weekend, which is the one time nobody is free
#                to debug it.
# CALLED BY:     ge receipt, the setup and connect skills, ge check
# READS:         growth-engine/.state/receipt.md
#                WRITES: the same file, through a temp file and a snapshot
# POSTURE:       fail-closed. No snapshot, no write, and no replacing a receipt
#                the founder has set read only: that is asked through the shared
#                guard in lib/paths.sh before the snapshot is taken, and their
#                own permissions go across onto the file that lands. A token
#                shaped value is refused outright, because a secret written into
#                a file is then in a snapshot, a backup, and the next support
#                screenshot
# PORTABILITY:   POSIX sh. No bash/python/node/jq. BSD+GNU date via lib/date_compat.sh.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
# Every write here is claimed, then guarded, so a folder a sync client is holding
# read only answers with one sentence of ours and never with the shell's own line
# naming this file, the line number inside it and the working file beside theirs.

ge_rcpt_usage() {
  cat <<'USAGE'
ge receipt, the record of what your setup checks found.

  ge receipt set <check> <PASS|FAIL|SKIP> "<what you saw>"
  ge receipt set pit-created <YYYY-MM-DD>
  ge receipt show

Setting a check that is already there replaces that one line. Nothing else moves.
The receipt records that a token exists and the day it was made. It never records the token.
USAGE
}

ge_rcpt_home() {
  ge_rcpt_found=$(ge_find_home)
  ge_rcpt_rc=$?
  # The shared refusal in lib/paths.sh, not one written here. "from here" told a
  # founder nothing about how far ge had looked, and a bare ge init was the only
  # way out offered, so somebody who already had a folder on the Desktop made a
  # second one. No extra sentence, because show and set both come through here
  # and a line about nothing being written reads oddly to somebody who only
  # asked to look.
  if [ "$ge_rcpt_rc" -eq 1 ]; then
    ge_nofolder_refusal fail >&2
    return 1
  fi
  if [ "$ge_rcpt_rc" -eq 2 ]; then
    # The shared refusal in lib/paths.sh, not one written here. The line this
    # replaced said "cd into the folder you want to keep", which cannot clear
    # it: the search takes in the home folder, the Desktop, Documents and
    # Downloads whatever folder the founder is standing in, so the same refusal
    # came back from inside the folder it had just named. Renaming one does
    # clear it, and the shared refusal prints that as a command they can paste.
    # No extra sentence, because show and set both come through here and a line
    # about nothing being written reads oddly to somebody who only asked to look.
    ge_scatter_refusal "$ge_rcpt_found" >&2
    return 1
  fi
  printf '%s\n' "$ge_rcpt_found"
}

# ge_rcpt_no_write: the one message for a receipt that could not be rewritten.
# The reason is asked for rather than guessed at, because a founder sent to
# check a disk that is fine never gets to the permission that is stopping them.
# Called from every place a write can fail, so one problem says one thing once.
ge_rcpt_no_write() {
  printf 'FAIL  the receipt could not be written. It is exactly as it was.\n' >&2
  # What to do after the command sits above it, never on the line itself. A
  # founder selects the whole line and pastes it, so "chmod u+w path, then run
  # this command again" reaches chmod as four arguments and changes nothing.
  if [ -f "$ge_rcpt_path" ] && [ ! -r "$ge_rcpt_path" ]; then
    printf '      The file %s cannot be read.\n' "$ge_rcpt_path" >&2
    printf '      Run this, then run the command you typed again.\n' >&2
    printf '      → run: chmod u+rw %s\n' "$(ge_quote "$ge_rcpt_path")" >&2
  elif [ ! -w "$ge_rcpt_dir/.state" ]; then
    printf '      The folder %s/.state cannot be written to.\n' "$ge_rcpt_dir" >&2
    printf '      Run this, then run the command you typed again.\n' >&2
    printf '      → run: chmod u+w %s\n' "$(ge_quote "$ge_rcpt_dir/.state")" >&2
  else
    printf '      There is no room left to write in %s/.state.\n' "$ge_rcpt_dir" >&2
    printf '      This shows how much space is left.\n' >&2
    printf '      → run: df -h %s\n' "$(ge_quote "$ge_rcpt_dir")" >&2
  fi
}

# A GoHighLevel Private Integration Token is recognisable by its own prefix, so
# a value carrying that shape is stopped at the door rather than at review time.
# Lowercased first, because a founder pasting from a password manager may paste
# it in any case.
#
# DELIBERATE: a bare arrow, and no "run:" on it. Only the founder knows what
# they meant to write where the token went, so there is no one command ge can
# stand behind. Written after "→ run: " this line was selected and pasted, and
# the shell answered about a command called "the". Guidance is what it is, so
# the arrow says so by not carrying the word run.
#
# It opens on Put, which is neither a shell reserved word nor the name of a
# program, so a founder who pastes it out of habit is answered about a command
# that does not exist rather than with a syntax error they cannot read.
#
# It says "your own words" rather than "a description", because this guards the
# check name as well as the evidence and a check name is not a description.
ge_rcpt_no_token() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    *pit-*)
      printf 'FAIL  that %s looks like a GoHighLevel token.\n' "$2" >&2
      printf '      The receipt records that a token exists and the day it was made, never the token itself.\n' >&2
      printf '      → Put your own words there in place of the token, then type the command again.\n' >&2
      return 1 ;;
  esac
  return 0
}

# The backup that has to succeed before any overwrite. ge snapshot owns the ring
# and it alone, so this calls it rather than copying: a second copier would keep
# its own count and quietly push a founder's oldest backup out of the ring.
# A target that is not there yet is ge snapshot's own no-op, so a first write is
# never blocked. It is run from inside the folder so the relative path it is
# handed can only mean one file.
ge_rcpt_backup() {
  ( CDPATH= cd -- "$2" && sh "$GE_HOME_DIR/scripts/ge.sh" snapshot "${1#"$2"/}" ) >/dev/null
}

ge_rcpt_header() {
  printf '# Setup receipt\n\n'
  printf 'One line per check: the name, then PASS or FAIL or SKIP, then what was seen.\n'
  printf 'Written by ge receipt. Do not hand edit.\n'
  printf 'It holds the day your token was made. It never holds the token.\n\n'
}

# ge_rcpt_is_row <line> <key>: is this the line the key already owns?
# The second field has to read as a status, so a sentence in the file header
# that happens to open with the same word is never mistaken for a check.
ge_rcpt_is_row() {
  ge_rcpt_first=${1%% *}
  [ "$ge_rcpt_first" = "$2" ] || return 1
  [ "$2" = pit_created ] && return 0
  ge_rcpt_rest=${1#* }
  enum_ok "${ge_rcpt_rest%% *}" PASS FAIL SKIP
}

# ge_rcpt_put <key> <line>: replace the key's line, or add it at the end.
ge_rcpt_put() {
  # WHY THE GUARD IS THE FIRST THING HERE. This builds a new receipt beside the
  # founder's and renames it over the top, and a rename asks the FOLDER for
  # permission, never the file. So a receipt.md set to read only was replaced
  # anyway, ge said "Recorded: ..." and exited 0, and the read only bit was gone
  # afterwards, because the file that landed carries the working file's
  # permissions and not theirs. The guard lives in lib/paths.sh so ge receipt,
  # ge ledger, ge person and ge index all answer the same way about the same
  # file, and ge check can never call a file read only in the same second ge
  # wrote into it.
  #
  # Asked before the backup, never after, so a refusal here means what it says:
  # no snapshot was taken, no working file was made, and the receipt is untouched.
  # A receipt that is not there yet is a yes, so a founder's first write is never
  # stopped by this.
  ge_may_replace "$ge_rcpt_path" || {
    ge_replace_refusal "$ge_rcpt_path" >&2
    return 1
  }
  # ge snapshot has already said what went wrong and where, so this adds the one
  # thing it cannot know: what did not happen as a result. A second FAIL banner
  # here would read as a second, separate problem.
  ge_rcpt_backup "$ge_rcpt_path" "$ge_rcpt_dir" || {
    printf '      Your receipt was not changed. It is exactly as it was.\n' >&2
    printf '      This says whether that folder can be written to yet.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  }
  mkdir -p "$ge_rcpt_dir/.state" 2>/dev/null || {
    printf 'FAIL  could not create %s/.state.\n' "$ge_rcpt_dir" >&2
    printf '      → run: ge init\n' >&2
    return 1
  }

  ge_rcpt_tmp="$ge_rcpt_path.ge-tmp.$$"
  # Claimed with touch before a single line is read, and never with a redirect
  # onto a special built-in, where a failure ends the whole shell under dash.
  # Claiming it here is what turns a folder held read only for a minute by a
  # sync client into one sentence a founder can act on. Left to the redirect
  # below, the shell answered first, in its own words, naming this file, the
  # source line inside it and the working file, and nothing else was printed.
  if ! touch "$ge_rcpt_tmp" 2>/dev/null; then
    ge_rcpt_no_write
    return 1
  fi

  ge_rcpt_seen=0
  if [ -f "$ge_rcpt_path" ]; then
    # ge_rcpt_cur, not ge_rcpt_line: sh has no local variables, so reusing the
    # caller's name here would hand it back the last line of the file.
    while IFS= read -r ge_rcpt_cur || [ -n "$ge_rcpt_cur" ]; do
      ge_rcpt_cur=$(printf '%s' "$ge_rcpt_cur" | tr -d '\r')
      if ge_rcpt_is_row "$ge_rcpt_cur" "$1"; then
        printf '%s\n' "$2"
        ge_rcpt_seen=1
      else
        printf '%s\n' "$ge_rcpt_cur"
      fi
    # The 2>/dev/null goes first, before either of the other two. Redirections
    # are set up left to right, so one written after the input or the output
    # would arrive too late to catch the shell's complaint about them.
    done 2>/dev/null < "$ge_rcpt_path" > "$ge_rcpt_tmp" || {
      rm -f "$ge_rcpt_tmp" 2>/dev/null
      ge_rcpt_no_write
      return 1
    }
  else
    ge_rcpt_header 2>/dev/null > "$ge_rcpt_tmp" || {
      rm -f "$ge_rcpt_tmp" 2>/dev/null
      ge_rcpt_no_write
      return 1
    }
  fi
  if [ "$ge_rcpt_seen" -ne 1 ]; then
    printf '%s\n' "$2" 2>/dev/null >> "$ge_rcpt_tmp" || {
      rm -f "$ge_rcpt_tmp" 2>/dev/null
      ge_rcpt_no_write
      return 1
    }
  fi

  # The founder's own permissions go across first. The file that lands is one ge
  # built, so without this it arrives carrying whatever the umask gave it, and a
  # receipt somebody had set to owner only came back readable by everybody while
  # ge reported success.
  ge_keep_mode "$ge_rcpt_path" "$ge_rcpt_tmp"
  # 2>/dev/null and a tidy up, because a target file a founder has locked, or a
  # folder that went read only between the claim above and here, otherwise
  # answers with a raw rename line naming the working file, and then leaves that
  # file sitting in the folder they open every day.
  mv "$ge_rcpt_tmp" "$ge_rcpt_path" 2>/dev/null || {
    rm -f "$ge_rcpt_tmp" 2>/dev/null
    printf 'FAIL  the receipt could not be written. It is unchanged.\n' >&2
    printf '      This says whether the folder can be written to yet.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  }
}

# ge_rcpt_real_day <YYYY-MM-DD>: is that a day that exists?
#
# Counted here rather than handed to the date program, because the two date
# programs disagree about it. BSD date rolls 2026-02-30 forward to 2 March and
# accepts it, GNU date refuses it outright. A receipt written on a mentor's Mac
# would then read one way there and another way on a founder's Windows machine,
# and a mistyped day would be stored as a fact instead of being caught while it
# can still be corrected.
ge_rcpt_real_day() {
  ge_rcpt_y=${1%%-*}
  ge_rcpt_md=${1#*-}
  ge_rcpt_m=${ge_rcpt_md%%-*}
  ge_rcpt_d=${ge_rcpt_md#*-}
  # A leading zero would be read as an octal number by the shell's arithmetic,
  # so 08 and 09 would not be numbers at all.
  while :; do
    case $ge_rcpt_y in 0?*) ge_rcpt_y=${ge_rcpt_y#0} ;; *) break ;; esac
  done
  ge_rcpt_m=${ge_rcpt_m#0}
  ge_rcpt_d=${ge_rcpt_d#0}
  [ "$ge_rcpt_m" -ge 1 ] && [ "$ge_rcpt_m" -le 12 ] || return 1
  [ "$ge_rcpt_d" -ge 1 ] || return 1
  case $ge_rcpt_m in
    4|6|9|11) ge_rcpt_max=30 ;;
    2)
      ge_rcpt_max=28
      # The whole leap year rule, not the quarter of it everyone remembers. A
      # rule written half way is one nobody can check against a calendar.
      if [ $((ge_rcpt_y % 4)) -eq 0 ] &&
         { [ $((ge_rcpt_y % 100)) -ne 0 ] || [ $((ge_rcpt_y % 400)) -eq 0 ]; }; then
        ge_rcpt_max=29
      fi ;;
    *) ge_rcpt_max=31 ;;
  esac
  [ "$ge_rcpt_d" -le "$ge_rcpt_max" ]
}

# ge_rcpt_day_hint: the day a recovery line hands back, which is today.
#
# It used to be a fixed 2026-09-14 in two of the four refusals below. The
# sessions run on 7, 8, 14 and 15 September, so a founder pasting that line in
# the run up was answered with a second refusal: the day has not happened yet,
# so a token cannot have been made on it. A date written into the source is a
# date that goes wrong on its own, with nobody typing anything.
#
# Today is a real value a founder can paste, and the body above the line says to
# change the day if the token was made on another one. On a machine whose date
# program cannot answer at all, a marked gap goes in instead, because a line
# reading "ge receipt set pit-created" with nothing after it is the same second
# refusal in a different costume.
ge_rcpt_day_hint() {
  ge_rcpt_hint=$(today_iso 2>/dev/null)
  case ${ge_rcpt_hint:-x} in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) printf '%s' "$ge_rcpt_hint" ;;
    *) printf '<YYYY-MM-DD>' ;;
  esac
}

ge_rcpt_set_created() {
  ge_rcpt_date=${1:-}
  # Read once, at the top, because every refusal below hands this same day back.
  ge_rcpt_today=$(ge_rcpt_day_hint)
  if [ -z "$ge_rcpt_date" ]; then
    printf 'FAIL  the day the token was made is missing.\n' >&2
    printf '      Dates are written year, month, day.\n' >&2
    printf '      This records today. Change the day if it was made on another one.\n' >&2
    printf '      → run: ge receipt set pit-created %s\n' "$ge_rcpt_today" >&2
    return 1
  fi

  # The shape is checked before the date library sees it. GNU date happily reads
  # "last tuesday" and returns a real day, so a typed phrase would be stored as
  # a fact and the 80 day warning would then count from a day nobody chose.
  case "$ge_rcpt_date" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
    *)
      printf 'FAIL  "%s" is not a date this can read.\n' "$ge_rcpt_date" >&2
      printf '      Dates are written year, month, day.\n' >&2
      printf '      This records today. Change the day if it was made on another one.\n' >&2
      printf '      → run: ge receipt set pit-created %s\n' "$ge_rcpt_today" >&2
      return 1 ;;
  esac

  # Checked here so a shape that is not a real day, 2026-13-40 or 2026-02-30, is
  # refused now rather than by ge context, which would have to treat it as no
  # date at all and would then never warn about an ageing token. The date
  # program is asked afterwards, as a second opinion on a day this machine
  # cannot represent at all.
  if ! ge_rcpt_real_day "$ge_rcpt_date" || [ -z "$(iso_to_epoch "$ge_rcpt_date")" ]; then
    printf 'FAIL  "%s" is not a day on the calendar.\n' "$ge_rcpt_date" >&2
    printf '      This records today. Change the day if it was made on another one.\n' >&2
    printf '      → run: ge receipt set pit-created %s\n' "$ge_rcpt_today" >&2
    return 1
  fi

  # A day that has not happened yet is a mistyped year, and it is the one typo
  # this line cannot afford. ge check ages the token from it, so a date in 2027
  # turns the warning off until 2027, and the token stops working during the
  # event with nothing having said a word about it.
  # today_iso rather than the hint above, because this comparison needs the real
  # day or nothing at all. The marked gap the hint can return is not a date, and
  # iso_to_epoch hands back nothing for it, which the case below reads as a
  # machine that cannot say what day it is and skips the test rather than
  # guessing at it.
  ge_rcpt_now=$(iso_to_epoch "$(today_iso)")
  ge_rcpt_then=$(iso_to_epoch "$ge_rcpt_date")
  case ${ge_rcpt_now:-x}${ge_rcpt_then:-x} in
    *[!0-9]*) : ;;
    *)
      if [ "$ge_rcpt_then" -gt "$ge_rcpt_now" ]; then
        printf 'FAIL  %s has not happened yet, so a token cannot have been made on it.\n' "$ge_rcpt_date" >&2
        printf '      Today is %s. Check the year.\n' "$ge_rcpt_today" >&2
        printf '      This records today.\n' >&2
        printf '      → run: ge receipt set pit-created %s\n' "$ge_rcpt_today" >&2
        return 1
      fi ;;
  esac

  ge_rcpt_put pit_created "pit_created $ge_rcpt_date" || return 1
  printf 'Recorded: your token was made on %s.\n' "$ge_rcpt_date"
  printf 'The token itself is not stored anywhere by this command.\n'
}

ge_rcpt_set() {
  ge_rcpt_check=${1:-}
  if [ -z "$ge_rcpt_check" ]; then
    printf 'FAIL  ge receipt set needs a check name.\n' >&2
    printf '      → run: ge receipt set plugin PASS "growth-engine 0.2.0"\n' >&2
    return 1
  fi

  case "$ge_rcpt_check" in
    pit-created|pit_created)
      ge_rcpt_set_created "${2:-}"
      return $? ;;
  esac

  # The check name is one word from a narrow set of characters, because it is
  # the key this file is searched by and a name with a space in it would split
  # into a different key every time it is read back.
  case "$ge_rcpt_check" in
    *[!A-Za-z0-9_.-]*)
      printf 'FAIL  "%s" is not a check name.\n' "$ge_rcpt_check" >&2
      printf '      A check name is one word: letters, numbers, dots, dashes or underscores.\n' >&2
      printf '      → run: ge receipt set plugin PASS "growth-engine 0.2.0"\n' >&2
      return 1 ;;
  esac

  ge_rcpt_status=${2:-}
  if [ -z "$ge_rcpt_status" ]; then
    printf 'FAIL  check "%s" has no result.\n' "$ge_rcpt_check" >&2
    printf '      → run: ge receipt set %s PASS "what you saw"\n' "$ge_rcpt_check" >&2
    return 1
  fi
  ge_rcpt_status=$(printf '%s' "$ge_rcpt_status" | tr '[:lower:]' '[:upper:]')
  if ! enum_ok "$ge_rcpt_status" PASS FAIL SKIP; then
    printf 'FAIL  "%s" is not a result this file can hold.\n' "$2" >&2
    printf '      The three it holds are PASS, FAIL and SKIP.\n' >&2
    printf '      → run: ge receipt set %s PASS "what you saw"\n' "$ge_rcpt_check" >&2
    return 1
  fi

  # Everything after the result is the evidence, joined back into one line. A
  # founder who forgets the quotes still gets their whole sentence recorded.
  shift 2
  ge_rcpt_ev=$*
  [ -n "$ge_rcpt_ev" ] || ge_rcpt_ev='-'
  # Counted, not pattern matched. A command substitution eats the newline it was
  # asked to produce, so a case pattern built from one silently matches anything
  # and every evidence string would be refused.
  if [ "$(printf '%s' "$ge_rcpt_ev" | wc -l | tr -d ' ')" -ne 0 ]; then
    printf 'FAIL  the evidence has to fit on one line.\n' >&2
    printf '      → run: ge receipt set %s %s "the same note written on one line"\n' "$ge_rcpt_check" "$ge_rcpt_status" >&2
    return 1
  fi

  ge_rcpt_no_token "$ge_rcpt_check" 'check name' || return 1
  ge_rcpt_no_token "$ge_rcpt_ev" 'evidence' || return 1

  ge_rcpt_line="$ge_rcpt_check $ge_rcpt_status $ge_rcpt_ev"
  ge_rcpt_put "$ge_rcpt_check" "$ge_rcpt_line" || return 1
  printf 'Recorded: %s\n' "$ge_rcpt_line"
}

ge_rcpt_show() {
  if [ ! -f "$ge_rcpt_path" ]; then
    printf 'FAIL  there is no setup receipt yet. Nothing has checked your setup.\n' >&2
    printf '      → take the setup step, which runs the checks and writes the receipt\n' >&2
    return 1
  fi
  tr -d '\r' < "$ge_rcpt_path"
}

ge_rcpt_main() {
  ge_rcpt_verb=${1:-}
  if [ -z "$ge_rcpt_verb" ]; then
    ge_rcpt_usage
    return 0
  fi
  shift

  case "$ge_rcpt_verb" in
    set|show)
      ge_rcpt_dir=$(ge_rcpt_home) || return 1
      ge_rcpt_path="$ge_rcpt_dir/.state/receipt.md" ;;
    *)
      printf 'FAIL  ge receipt has no verb called "%s".\n' "$ge_rcpt_verb" >&2
      printf '      The two it has are set and show.\n' >&2
      printf '      This prints them, with what each one takes.\n' >&2
      printf '      → run: ge receipt\n' >&2
      return 1 ;;
  esac

  case "$ge_rcpt_verb" in
    set)  ge_rcpt_set "$@" ;;
    show) ge_rcpt_show ;;
  esac
}

ge_rcpt_main "$@"
