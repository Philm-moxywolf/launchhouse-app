# accounts.sh: the cached list of connected social accounts. Sourced by ge.sh.
#
# FORMAT NOT CONFIRMED YET. The three field row written here is the documented
# shape. Spike S-03 pastes the real socialmediaposting_get-account response, and
# this file and schemas/ghl-accounts.md are corrected from it before the freeze.
#
# WHY IT EXISTS: publishing needs an account id, and asking GoHighLevel for one
#                on every post spends a call a founder may not have and stalls
#                when the connection is down. Without one writer this cache gets
#                hand edited by whichever skill needed it last, and a founder
#                ends up publishing to the wrong page under their own name.
# CALLED BY:     ge accounts, the connect skill, the publish skill
# READS:         standard input, growth-engine/.state/ghl-accounts.md
#                WRITES: the same file, through a temp file and a snapshot
# POSTURE:       fail-closed. A cache the founder has set read only is never
#                replaced: that is asked through the shared guard in lib/paths.sh
#                before a single line is read, and their own permissions go
#                across onto the file that lands. One bad row refuses the whole
#                write, because a cache that is half the accounts is worse than
#                yesterday's cache:
#                the missing page looks like a page that was never connected.
#                A row the machine could not write down refuses it the same way,
#                and is reported as the machine rather than as the founder's
#                typing, because the two need different things done about them
# PORTABILITY:   POSIX sh. No bash/python/node/jq. BSD+GNU date via lib/date_compat.sh.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
# Every write here is claimed, then guarded, so a folder a sync client is holding
# read only answers with one sentence of ours and never with the shell's own line
# naming this file, the line number inside it and the working file beside theirs.

ge_acc_usage() {
  cat <<'USAGE'
ge accounts, the list of social accounts your GoHighLevel location can post to.

  ge accounts set     replace the cache with the rows you send it
  ge accounts list    show the accounts that are cached now
  ge accounts clear   empty the cache, after backing it up

The rows are sent into set rather than typed after it. One row per account,
three parts with the | character between them: the account id, the platform,
the name. This is the whole command. The parts in angle brackets are yours to
fill in, and everything else is typed as it stands:

  printf "<account id>|<platform>|<name>\n" | ge accounts set

Setting replaces the whole cache, so send every account, not just the new one.
USAGE
}

ge_acc_home() {
  ge_acc_found=$(ge_find_home)
  ge_acc_rc=$?
  # The shared refusal in lib/paths.sh, not one written here. "from here" said
  # nothing about how wide the search is, and a bare ge init was the only way
  # out offered, which is how a founder with a folder on the Desktop ends up
  # with two. No extra sentence, because list, set and clear all come through
  # here and a line about nothing being written reads oddly to somebody who
  # only looked.
  if [ "$ge_acc_rc" -eq 1 ]; then
    ge_nofolder_refusal fail >&2
    return 1
  fi
  if [ "$ge_acc_rc" -eq 2 ]; then
    # The shared refusal in lib/paths.sh, not one written here. The line this
    # replaced said "cd into the folder you want to keep", which cannot clear
    # it: the search takes in the home folder, the Desktop, Documents and
    # Downloads whatever folder the founder is standing in, so the same refusal
    # came back from inside the folder it had just named. Renaming one does
    # clear it, and the shared refusal prints that as a command they can paste.
    # No extra sentence, because list, set and clear all come through here and a
    # line about nothing being written reads oddly to somebody who only looked.
    ge_scatter_refusal "$ge_acc_found" >&2
    return 1
  fi
  printf '%s\n' "$ge_acc_found"
}

# The shape of a row, written the one way it is ever written. Angle brackets and
# nothing that reads as real: the line here used to be acc_1|facebook|Lumen Skin,
# and Lumen Skin is this repository's own demo founder, so a founder following it
# literally cached a row for a business that is not theirs and ge accepted it.
GE_ACC_SHAPE='<account id>|<platform>|<name>'

# What was wrong with the rows, held rather than printed as they are found.
#
# ONE FAILURE, ONE MESSAGE. Every bad row used to print a FAIL banner and a way
# out of its own, so four bad rows in one paste made four banners and four
# arrows, and then a fifth banner and a fifth arrow underneath from the caller.
# Three of those arrows sat in the middle of the message, where nothing reads
# them: a founder reads the last line, and the two tests that read one read the
# last line too, so those three were never proved to say anything true. Worse,
# each arrow sat above the next row's explanation, which is the wrong way round.
# The rows are gathered here and the caller says the whole thing once, with the
# arrow last.
GE_ACC_NOTES=''
GE_ACC_SHOWN=0
GE_ACC_SHAPEBAD=0

# ge_acc_note <line number> <what is wrong> [the line as it came in]: one row
# recorded, and the count kept.
#
# The third argument is left off where showing the line would print back
# something a founder should not be shown twice. Only the first few are kept: a
# founder works down a list from the top, and a list longer than the screen
# scrolls the sentence saying what to do off the top of it. The count is of
# every one of them, so nothing is claimed that was not examined, and the caller
# says how many are not shown.
ge_acc_note() {                         # <line number> <what is wrong> [the line]
  ge_acc_bad=$((ge_acc_bad + 1))
  [ "$GE_ACC_SHOWN" -lt 4 ] || return 0
  GE_ACC_SHOWN=$((GE_ACC_SHOWN + 1))
  GE_ACC_NOTES="$GE_ACC_NOTES      line $1 $2
"
  [ -n "${3:-}" ] || return 0
  GE_ACC_NOTES="$GE_ACC_NOTES        $3
"
}

# The account list travels in the same response as the token that fetched it, so
# a paste can carry the token with it. It is refused before it reaches a file.
#
# The line itself is never printed back. It is the one row in this file whose
# text is the thing that must not be repeated, and a refusal that quotes a token
# onto the screen has put it somewhere new.
ge_acc_no_token() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    *pit-*)
      ge_acc_note "$2" 'looks like it carries a GoHighLevel token. This cache holds account ids and names, never a token'
      return 1 ;;
  esac
  return 0
}

# ge_acc_have: is there a cache, with at least one row in it ge can read?
#
# Sets ge_acc_out to those rows, so the refusal that asks this question and the
# list that prints the answer read the file exactly one way. Two readers here is
# how a founder gets told to run a command that then says there is nothing to
# show.
#
# The read is guarded, because a cache a sync client is holding shut otherwise
# answers with the shell's own line naming this file and the line inside it.
ge_acc_have() {
  ge_acc_out=''
  [ -f "$ge_acc_path" ] || return 1
  ge_acc_out=$( { tr -d '\r' < "$ge_acc_path" | awk -F"$GE_SEP" 'NF == 3 { print }'; } 2>/dev/null )
  [ -n "$ge_acc_out" ]
}

# The backup that has to succeed before any overwrite. ge snapshot owns the ring
# and it alone, so this calls it rather than copying: a second copier would keep
# its own count and quietly push a founder's oldest backup out of the ring.
# A target that is not there yet is ge snapshot's own no-op, so a first write is
# never blocked. It is run from inside the folder so the relative path it is
# handed can only mean one file.
ge_acc_backup() {
  ( CDPATH= cd -- "$2" && sh "$GE_HOME_DIR/scripts/ge.sh" snapshot "${1#"$2"/}" ) >/dev/null
}

# ge_acc_collect <rowsfile>: read standard input, check every row, write the
# clean rows out. Counts are left in ge_acc_good and ge_acc_bad for the caller.
#
# Returns 0 when every row was read and kept, 1 when a row was refused, and 2
# when the rows could not be written down at all. The caller needs the three
# apart, because the first two are about what the founder piped in and the third
# is about their machine, and they are answered with different sentences.
#
# WHY 2 EXISTS. On a nearly full disk every printf below fails, and each failure
# was the shell's own line, naming this file and the line number inside it, in
# front of the founder. A list of any length produced one of those per row, so
# eight hundred rows produced eight hundred of them and the sentence written for
# the founder scrolled away above the terminal. The stderr of the loop is not
# redirected as a whole, because the refusals for a bad row are written inside
# it and a founder needs to read those, so each call that can fail is guarded
# where it stands instead. The first one that does ends the read, and the caller
# says the one thing that is true once.
ge_acc_collect() {
  ge_acc_good=0
  ge_acc_bad=0
  ge_acc_no=0
  ge_acc_stuck=0
  GE_ACC_NOTES=''
  GE_ACC_SHOWN=0
  GE_ACC_SHAPEBAD=0
  while IFS= read -r ge_acc_line || [ -n "$ge_acc_line" ]; do
    ge_acc_no=$((ge_acc_no + 1))
    ge_acc_line=$(printf '%s' "$ge_acc_line" | tr -d '\r')
    case "$ge_acc_line" in
      ''|'#'*) continue ;;
    esac

    # The count is kept inside ge_acc_note now, so every row that is refused is
    # counted in one place and the count and the list can never disagree.
    ge_acc_no_token "$ge_acc_line" "$ge_acc_no" || continue

    # Held as a number before it is compared as one. row_count runs a pipeline
    # of its own, and a machine that cannot run one hands back nothing, or the
    # part of an answer it managed. Fed straight into a numeric test that became
    # the shell's own line naming this file and the line number inside it, once
    # per row. A count that is not a plain number is not a verdict on the row, it
    # is this machine saying it cannot read, so the read stops there.
    ge_acc_n=$(row_count "$ge_acc_line" 2>/dev/null)
    case ${ge_acc_n:-x} in
      *[!0-9]*|'') ge_acc_stuck=1; break ;;
    esac

    # The shape is said once, under the whole list, rather than after every row
    # that got it wrong. Four rows short of a part used to print the same
    # sentence four times.
    if [ "$ge_acc_n" -ne 3 ]; then
      GE_ACC_SHAPEBAD=1
      ge_acc_note "$ge_acc_no" 'is not an account row' "$ge_acc_line"
      continue
    fi

    ge_acc_id=$(row_field "$ge_acc_line" 1)
    ge_acc_plat=$(row_field "$ge_acc_line" 2)
    ge_acc_name=$(row_field "$ge_acc_line" 3)

    if [ -z "$ge_acc_id" ] || [ -z "$ge_acc_plat" ]; then
      GE_ACC_SHAPEBAD=1
      ge_acc_note "$ge_acc_no" 'is missing the account id or the platform' "$ge_acc_line"
      continue
    fi

    # A dash, not a guess. An account with no name is recorded as having none,
    # because the id is what publishing uses and inventing a name here would put
    # a made up page name in front of the founder later.
    [ -n "$ge_acc_name" ] || ge_acc_name='-'

    # Written from a child of this shell, and that is the whole point of the
    # brackets. A shell holds what it prints in a buffer of its own until there
    # is enough of it to be worth a write. When that write is the one that runs
    # the disk out, the part that did not fit stays in the buffer, and the next
    # thing the shell prints carries it out in front: the founder read a bare
    # "er 255", the tail end of somebody's page name, on the line above the
    # sentence written for them. A child has a buffer of its own and it goes
    # when the child does, so nothing is left over to surface later. It costs a
    # few milliseconds across a real account list, which is a handful of rows.
    if ! ( printf '%s%s%s%s%s\n' \
        "$ge_acc_id" "$GE_SEP" "$ge_acc_plat" "$GE_SEP" "$ge_acc_name" ) 2>/dev/null; then
      ge_acc_stuck=1
      break
    fi
    ge_acc_good=$((ge_acc_good + 1))
  # No 2>/dev/null on this line, and that is deliberate. A redirection written
  # here covers the whole loop, and the refusals for a bad row are written to
  # that same stream inside it, so putting one here would take away the three
  # sentences a founder needs in order to correct the line they piped in. The
  # file this writes to is claimed by the touch in ge_acc_set before a single
  # line is read, so it opens here or that touch has already said why it could
  # not, which leaves the calls inside the loop as the only ones that can fail,
  # and each of those is guarded where it stands.
  done > "$1"

  [ "$ge_acc_stuck" -eq 0 ] || return 2
  [ "$ge_acc_bad" -eq 0 ]
}

# ge_acc_no_room: the one message for a machine that could not take the accounts
# down while they were being read. The reason is asked for rather than guessed
# at, because a founder sent to check a disk that is fine never gets to the
# permission that is stopping them, and one sent to change a permission that is
# already right has been handed a line that cannot recover anything.
#
# Written here once because two places reach it: the claim on the working file,
# and a write inside the read that failed afterwards. They are the same problem
# to the founder, so they say the same thing and neither says it twice.
ge_acc_no_room() {
  # What to do after the command sits above it, never on the line itself. A
  # founder selects the whole line and pastes it, so "df -h path, to see how
  # much space is left" reaches df as seven arguments and answers about six
  # folders that do not exist.
  # The sentence about the cache is only said where there is a cache. Told to a
  # founder whose first ge accounts set is the one that failed, "your cached
  # accounts are exactly as they were" describes a file they have never had, and
  # a sentence that is not true about the easy part is not believed about the
  # hard part either.
  if ge_acc_have; then
    ge_acc_kept='      Your cached accounts are exactly as they were.'
  else
    ge_acc_kept='      Nothing was cached before this, and nothing is now.'
  fi
  if [ -w "$ge_acc_dir/.state" ]; then
    printf 'FAIL  there is no room to read the accounts in. Nothing was written.\n' >&2
    printf '%s\n' "$ge_acc_kept" >&2
    printf '      This shows how much space is left. Then pipe the same lines in again.\n' >&2
    # Quoted, because half the folders in this programme are named after a
    # business and carry a space, and an unquoted path with a space in it
    # splits into two arguments and the line a founder pastes fails.
    printf '      → run: df -h %s\n' "$(ge_quote "$ge_acc_dir")" >&2
  else
    printf 'FAIL  the folder %s/.state cannot be written to, so the accounts were not read.\n' "$ge_acc_dir" >&2
    printf '%s\n' "$ge_acc_kept" >&2
    printf '      Run this, then pipe the same lines in again.\n' >&2
    printf '      → run: chmod u+w %s\n' "$(ge_quote "$ge_acc_dir/.state")" >&2
  fi
}

ge_acc_set() {
  # Typed with nothing piped in, this would sit there reading the keyboard and
  # look like a hung command. Say what it wanted instead.
  if [ -t 0 ]; then
    printf 'FAIL  ge accounts set reads the accounts from what is piped into it, and nothing was.\n' >&2
    # The parts in angle brackets are the founder's own. It read acc_1|facebook|
    # Lumen Skin, which is a real looking row for this repository's own demo
    # founder, and ge accepts that row and writes it: somebody who pasted the
    # line as it stood had a business that is not theirs in their cache.
    printf '      This is the shape. Put your own account ids, platforms and names in it.\n' >&2
    printf '      → run: printf "%s\\n" | ge accounts set\n' "$GE_ACC_SHAPE" >&2
    return 1
  fi

  ge_acc_rows="$ge_acc_dir/.state/ghl-accounts.rows.$$"
  mkdir -p "$ge_acc_dir/.state" 2>/dev/null || {
    printf 'FAIL  could not create %s/.state.\n' "$ge_acc_dir" >&2
    printf '      → run: ge init\n' >&2
    return 1
  }

  # WHY THE GUARD IS HERE, ABOVE EVERYTHING ELSE THIS VERB DOES. The move at the
  # bottom puts a new cache in place of the old one, and a rename asks the FOLDER
  # for permission, never the file. So a ghl-accounts.md a founder had set to
  # read only was replaced anyway, ge said "Cached 1 account." and exited 0, and
  # the read only bit was gone afterwards, because the file that landed carries
  # the working file's permissions and not theirs. The guard lives in
  # lib/paths.sh so ge accounts, ge ledger, ge person, ge receipt and ge index
  # all answer the same way about the same file, and ge check can never call a
  # file read only in the same second ge wrote into it.
  #
  # Asked before a single line is read, so a refusal here costs the founder
  # nothing: no working file, no backup, and the rows they piped in are still
  # theirs to send again. A cache that is not there yet is a yes, so a first
  # write is never stopped by this.
  # No extra sentence. The first line of the shared refusal names the file, or
  # the folder, and says nothing changed, and "your cached accounts are exactly
  # as they were" is not true to tell a founder whose first ge accounts set is
  # the one that stopped here: they have never had a cache.
  ge_may_replace "$ge_acc_path" || {
    ge_replace_refusal "$ge_acc_path" >&2
    return 1
  }

  # Claimed here, before a single line is read. ge_acc_collect sends the rows it
  # keeps into this file, and a shell whose redirection fails prints its own
  # message with this file's name in it and then skips the whole loop. The count
  # underneath would then say nothing was piped in when everything was, and the
  # founder would be told to clear a cache that is fine. touch, not a redirection
  # onto a special builtin: a failed redirection there ends the shell.
  if ! touch "$ge_acc_rows" 2>/dev/null; then
    ge_acc_no_room
    return 1
  fi

  # Three answers, not two. 2 is the machine giving out part way through the
  # read, which is nothing to do with the lines the founder piped in, so it is
  # never reported as a count of lines they got wrong.
  ge_acc_collect "$ge_acc_rows"
  ge_acc_rc=$?
  if [ "$ge_acc_rc" -eq 2 ]; then
    rm -f "$ge_acc_rows" 2>/dev/null
    ge_acc_no_room
    return 1
  fi
  if [ "$ge_acc_rc" -ne 0 ]; then
    rm -f "$ge_acc_rows" 2>/dev/null
    # ONE banner, then what was wrong with each row, then the shape, then what to
    # do, then the arrow. In that order, because a founder reads down and the
    # arrow is the last thing on the screen.
    if [ "$ge_acc_bad" -eq 1 ]; then
      printf 'FAIL  1 of the lines could not be read, so nothing was written.\n' >&2
    else
      printf 'FAIL  %s of the lines could not be read, so nothing was written.\n' "$ge_acc_bad" >&2
    fi
    # Asked once for the whole message. Two sentences in it turn on the answer,
    # and reading the file twice is how one message ends up saying a founder has
    # a cache in one line and has never had one in another.
    ge_acc_cached=no
    ge_acc_have && ge_acc_cached=yes
    # Said before the list, because it is the answer to "what happened to my
    # accounts", and that is the first thing a founder wants after the banner.
    if [ "$ge_acc_cached" = yes ]; then
      printf '      Your cached accounts are exactly as they were.\n' >&2
    else
      printf '      Nothing was cached before this, and nothing is now.\n' >&2
    fi
    printf '%s' "$GE_ACC_NOTES" >&2
    # Only ever said about rows that were kept back from the list, never about
    # the ones the list already names.
    if [ "$ge_acc_bad" -gt "$GE_ACC_SHOWN" ]; then
      printf '      and %s more like those.\n' "$((ge_acc_bad - GE_ACC_SHOWN))" >&2
    fi
    # Only where a row really had the wrong shape. A paste whose only fault was
    # a token line does not need the shape explained to it.
    if [ "$GE_ACC_SHAPEBAD" -eq 1 ]; then
      printf '      A row has three parts with the | character between them:\n' >&2
      printf '        %s\n' "$GE_ACC_SHAPE" >&2
    fi
    printf '      Correct what is named above, then pipe the whole set in again.\n' >&2
    # Asked once, and both the sentence and the command come out of the answer.
    #
    # This line used to be ge accounts list every time. A founder whose FIRST
    # ge accounts set is the one that failed has nothing cached, so that line
    # answered with a second refusal, "no accounts are cached yet", and the way
    # out of one refusal was another one.
    if [ "$ge_acc_cached" = yes ]; then
      printf '      This shows what is cached now.\n' >&2
      printf '      → run: ge accounts list\n' >&2
    else
      printf '      This shows the whole command, with the shape of a row in it.\n' >&2
      printf '      → run: ge accounts\n' >&2
    fi
    return 1
  fi

  if [ "$ge_acc_good" -eq 0 ]; then
    rm -f "$ge_acc_rows" 2>/dev/null
    # The way out is the command they meant to type. ge accounts clear is said
    # here too, but never on the arrow line: a founder who follows the arrow out
    # of habit would delete the accounts they still have.
    printf 'FAIL  no account rows were piped in, so nothing was written.\n' >&2
    printf '      An empty write would look like a location with no accounts, which is a different thing.\n' >&2
    printf '      Emptying the cache on purpose is ge accounts clear.\n' >&2
    printf '      This is the shape. Put your own account ids, platforms and names in it.\n' >&2
    printf '      → run: printf "%s\\n" | ge accounts set\n' "$GE_ACC_SHAPE" >&2
    return 1
  fi

  # ge snapshot has already said what went wrong and where, so this adds the one
  # thing it cannot know: what did not happen as a result. A second FAIL banner
  # here would read as a second, separate problem.
  ge_acc_backup "$ge_acc_path" "$ge_acc_dir" || {
    rm -f "$ge_acc_rows" 2>/dev/null
    printf '      Your cached accounts were not changed. They are exactly as they were.\n' >&2
    printf '      This says whether that folder can be written to yet.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  }

  ge_acc_tmp="$ge_acc_path.ge-tmp.$$"
  {
    printf '# Social accounts\n\n'
    # Not utc_stamp: that form drops the colons so it can be a filename, and
    # iso_to_epoch cannot read it back. Publishing has to work out the age of
    # this cache in days, so the stamp is written in the shape that parses.
    printf 'stamp %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%S')"
    printf 'Times are UTC. Written by ge accounts. Do not hand edit.\n'
    # The pointer to the format is only written when that file is really in the
    # plugin. A line naming a file nobody can open teaches a founder that the
    # rest of the file it sits in is decoration too.
    if [ -f "$GE_HOME_DIR/schemas/ghl-accounts.md" ]; then
      printf 'One line per account: the account id, the platform, the name. Format: schemas/ghl-accounts.md\n\n'
    else
      printf 'One line per account: the account id, the platform, the name.\n\n'
    fi
    cat "$ge_acc_rows"
  # The 2>/dev/null goes before the output redirect, not after it. Redirections
  # are set up left to right, so one written afterwards would arrive too late to
  # catch the shell's own complaint about the file it could not create.
  } 2>/dev/null > "$ge_acc_tmp" || {
    rm -f "$ge_acc_tmp" "$ge_acc_rows" 2>/dev/null
    printf 'FAIL  the cached accounts could not be written. They are unchanged.\n' >&2
    printf '      This says whether the folder can be written to yet.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  }
  rm -f "$ge_acc_rows" 2>/dev/null

  # The founder's own permissions go across first. The file that lands is one ge
  # built, so without this it arrives carrying whatever the umask gave it, and a
  # cache somebody had set to owner only came back readable by everybody while
  # ge said how many accounts it had written.
  ge_keep_mode "$ge_acc_path" "$ge_acc_tmp"
  # 2>/dev/null and a tidy up, because a target file a founder has locked, or a
  # folder that went read only part way through, otherwise answers with a raw
  # rename line naming the working file, ahead of the sentence written for them,
  # and then leaves that file sitting in the folder they open every day.
  mv "$ge_acc_tmp" "$ge_acc_path" 2>/dev/null || {
    rm -f "$ge_acc_tmp" 2>/dev/null
    printf 'FAIL  the cached accounts could not be written. They are unchanged.\n' >&2
    printf '      This says whether the folder can be written to yet.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  }
  if [ "$ge_acc_good" -eq 1 ]; then
    printf 'Cached 1 account.\n'
  else
    printf 'Cached %s accounts.\n' "$ge_acc_good"
  fi
}

# The two answers are kept apart on purpose. No file at all is a founder who has
# never connected, and a file holding no rows is a cache that was emptied or
# hand edited, which is a different thing to tell somebody. Both read the file
# through ge_acc_have, so what this prints and what the refusals above believe
# is cached can never be two different readings of one file.
ge_acc_list() {
  if [ ! -f "$ge_acc_path" ]; then
    printf 'FAIL  no accounts are cached yet.\n' >&2
    printf '      → take the setup step, which connects GoHighLevel and fills the cache in\n' >&2
    return 1
  fi
  if ! ge_acc_have; then
    printf 'FAIL  the cache is here but it holds no accounts.\n' >&2
    printf '      → take the setup step, which connects GoHighLevel and fills the cache in\n' >&2
    return 1
  fi
  printf '%s\n' "$ge_acc_out"
}

ge_acc_clear() {
  if [ ! -f "$ge_acc_path" ]; then
    printf 'There was nothing cached, so nothing changed.\n'
    return 0
  fi
  ge_acc_backup "$ge_acc_path" "$ge_acc_dir" || {
    printf '      Nothing was cleared. Your cached accounts are exactly as they were.\n' >&2
    printf '      This says whether that folder can be written to yet.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  }
  # 2>/dev/null, because a folder held read only otherwise answers with a raw
  # remove line ahead of the sentence written for the founder, and two errors
  # for one problem reads as two problems.
  rm -f "$ge_acc_path" 2>/dev/null || {
    printf 'FAIL  the cached accounts could not be cleared. They are exactly as they were.\n' >&2
    if [ ! -w "$ge_acc_dir/.state" ]; then
      printf '      The folder %s/.state cannot be written to.\n' "$ge_acc_dir" >&2
      printf '      Run this, then ge accounts clear again.\n' >&2
      printf '      → run: chmod u+w %s\n' "$(ge_quote "$ge_acc_dir/.state")" >&2
    else
      printf '      This says whether the folder can be written to yet.\n' >&2
      printf '      → run: ge check\n' >&2
    fi
    return 1
  }
  printf 'The cached accounts are cleared. A backup was taken first.\n'
  printf 'Nothing in GoHighLevel changed. This was only the copy kept on your machine.\n'
}

ge_acc_main() {
  ge_acc_verb=${1:-}
  if [ -z "$ge_acc_verb" ]; then
    ge_acc_usage
    return 0
  fi
  shift

  case "$ge_acc_verb" in
    # write is the name the connect skill was written against. Same verb.
    set|write|list|clear)
      ge_acc_dir=$(ge_acc_home) || return 1
      ge_acc_path="$ge_acc_dir/.state/ghl-accounts.md" ;;
    *)
      printf 'FAIL  ge accounts has no verb called "%s".\n' "$ge_acc_verb" >&2
      printf '      The three it has are set, list and clear.\n' >&2
      printf '      This prints them, with what each one takes.\n' >&2
      printf '      → run: ge accounts\n' >&2
      return 1 ;;
  esac

  case "$ge_acc_verb" in
    set|write) ge_acc_set ;;
    list)      ge_acc_list ;;
    clear)     ge_acc_clear ;;
  esac
}

ge_acc_main "$@"
