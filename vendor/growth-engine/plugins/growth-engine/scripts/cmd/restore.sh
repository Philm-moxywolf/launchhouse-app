# restore.sh: put a backed up file back, after showing what changes. Sourced by ge.sh.
#
# WHY IT EXISTS: a backup nobody can get at is not a backup. Without this a
#                founder who wants yesterday's version has to read stamped file
#                names in a hidden folder and copy one by hand, which is the
#                point most people give up and keep the bad version. It also
#                backs up what it is about to replace, so a restore of the wrong
#                stamp is itself undoable and never a second loss.
# CALLED BY:     ge restore, ge undo, and the skills that print a way back
# READS:         growth-engine/.state/snapshots/   WRITES: the founder file named
# POSTURE:       fail-closed. If the state being replaced cannot be backed up,
#                nothing is written. If the stamp is ambiguous it refuses and
#                lists, because picking one for the founder is a silent overwrite.
#                A file that already matches the backup is left alone and said
#                so, rather than rewritten to report that nothing changed.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").

GE_SNAPSHOT_LIB_ONLY=1
. "$GE_HOME_DIR/scripts/cmd/snapshot.sh"

# CAN GE LOOK INSIDE THE BACKUP FOLDER AT ALL. Asked by ge restore and by ge
# undo, which sources this file, so the two can never answer it differently.
#
# WHY IT EXISTS: both verbs work out what backups there are by listing that one
# folder, and a folder ge cannot open lists as nothing at all, byte for byte the
# way a folder holding nothing lists. Read as "nothing", ge restore told a
# founder there were no backups of their ledger and that ge had never changed
# the file, with two backups of it sitting in that folder, and ge undo told them
# ge had not changed any of their files, an hour after changing three. Both
# sentences were invented out of an answer that never arrived, and the recovery
# printed under them could not clear anything, because nothing was wrong with
# the file they named. So the folder is asked, rather than the silence read.
#
# BOTH BITS, because either one missing hides the contents on its own. Without
# the read bit the names cannot be listed. Without the search bit the names come
# back and not one of them can be looked at, so every one is dropped and the
# listing ends up empty just the same.
#
# A folder that is not there, and a file sitting on its name, are deliberately
# not asked about here. Neither of those holds backups, so "none" is the true
# answer for them, and ge check is the leg that names them and says what to do.
ge_restore_ring_shut() {                # <home>, 0 when ge cannot look inside
  grr_dir="$1/.state/snapshots"
  [ -d "$grr_dir" ] || return 1
  if [ -r "$grr_dir" ] && [ -x "$grr_dir" ]; then
    return 1
  fi
  return 0
}

# The one refusal for it, so ge restore and ge undo say the same thing about the
# same folder. The caller passes the end of the first sentence, because only the
# caller knows what it was about to claim. Printed on standard output, and each
# caller sends it to standard error itself, so the refusal stays on one stream.
#
# WHY THE COMMAND HANDS BACK THE WRITE BIT AS WELL. ge check's backups leg says
# chmod u+rx, and that is right for the doctor, which only ever reads that folder
# and has a second leg for the write. It is wrong here. Both these verbs go on to
# put a file back, and putting a file back starts by backing up the state it
# replaces, which is a write into this same folder. With u+rx the founder pasted
# the line, ran ge undo again, and was stopped by "could not back up ops-log.md"
# about the folder they had just been told to fix. Two lines about one folder is
# the shape of a way out that does not work.
#
# Only the reading is CLAIMED above, because only the reading was examined. The
# write bit is not tested here: a folder that lists fine and will not take a file
# is a different fault, it has its own message, and folding it in would make this
# one say "ge cannot open the backup folder" about a folder ge just read.
ge_restore_ring_refusal() {             # <home> <what ge cannot say>
  printf 'FAIL  ge cannot open the backup folder, so it cannot say %s\n' "$2"
  printf '      The folder is there, and its permissions do not let ge look inside.\n'
  printf '      ge does not change permissions by itself.\n'
  printf '      This hands the folder back, to read and to write.\n'
  printf '      Do this, then run the same command again.\n'
  printf '      → run: chmod u+rwx %s\n' "$(ge_snap_quote "$1/.state/snapshots")"
}

# The number of lines in a file, asked in the one place that is safe to ask it.
#
# WHY THE REDIRECT IS ON A GROUP. "wc -l < file" opens the file through the
# SHELL, not through wc, so a file the shell cannot open is reported by the
# shell, and that line names this script and the line number inside it. A
# 2>/dev/null written on the wc itself arrives too late, because redirections
# are set up left to right and the input one has already failed by then. On the
# group it is in place first, so the complaint lands in it.
#
# Nothing is printed when the count did not arrive. A caller that took an empty
# answer as a number would go on to print it.
ge_restore_countlines() {               # <the file>
  grc_n=$({ wc -l < "$1"; } 2>/dev/null | tr -d ' ')
  case ${grc_n:-x} in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$grc_n"
}

ge_restore_diffcount() {                # <the file now> <the backup>
  # Asked before anything below opens the backup. Every line here reads it, and
  # a backup ge cannot read has no count to give: saying so is the honest answer
  # and it is also the quiet one, because each of the readers below announces a
  # file it cannot open in its own words, over the founder's screen, above ge's
  # own refusal. The caller says what it found.
  [ -r "$2" ] || return 1
  [ -f "$1" ] || { ge_restore_countlines "$2"; return $?; }
  # And the file as it stands has to open too, or there is nothing to compare the
  # backup with. Without this, cmp came back "not the same" because it could not
  # read one side, diff came back with nothing for the same reason, and the count
  # fell through to the size of the backup on its own. That number was then
  # printed as "40 lines different from the file you have now", about a file ge
  # had never once opened, on the screen a founder reads while choosing which
  # backup to overwrite their work with. No count is the honest answer, and both
  # callers already have a way to say so.
  [ -r "$1" ] || return 1
  cmp -s "$1" "$2" && { printf '0\n'; return 0; }
  # diff prints the old line AND the new line for every line it changed, so
  # counting both sides read one edited line as two, and every number a founder
  # is shown was doubled in the direction that makes a small change look big.
  # Each run of changes counts once, at the size of its larger side, which is
  # what a founder counts by eye. A line only added, or only taken away, has one
  # side and so still counts once. The lines starting with a digit are diff's own
  # headers, and each one opens the next run.
  grd_n=$(diff "$1" "$2" 2>/dev/null | awk '
    /^[0-9]/ { total = total + (old > new ? old : new); old = 0; new = 0; next }
    /^</     { old = old + 1; next }
    /^>/     { new = new + 1; next }
    END      { total = total + (old > new ? old : new); print total + 0 }
  ')
  # diff reports nothing countable for a file that is not plain text, and the
  # two are known to differ by now, so fall back to the size of the backup. The
  # 2>/dev/null here sits on the test, which has nothing to say, and the fall
  # back is where the reading was actually done: that is why it goes through the
  # one function that opens a file safely rather than opening one itself.
  [ "$grd_n" -gt 0 ] 2>/dev/null || { ge_restore_countlines "$2"; return $?; }
  printf '%s\n' "$grd_n"
}

# "1 lines are different" reads as a mistake and makes a founder wonder what
# else here is careless. Both places that print a count come through here: the
# singular was once fixed in ge_restore_apply and missed in ge_restore_list, and
# the listing is the one a founder reads while deciding whether to overwrite.
ge_restore_lines() {                    # <count> -> "1 line" or "4 lines"
  if [ "$1" = 1 ]; then
    printf '1 line'
  else
    printf '%s lines' "$1"
  fi
}

ge_restore_apply() {                    # <home> <relative path> <stamp>
  gra_home=$1
  gra_rel=$2
  gra_stamp=$3
  gra_src="$gra_home/.state/snapshots/$(ge_snap_flat "$gra_rel").$gra_stamp"
  gra_tgt="$gra_home/$gra_rel"

  if [ ! -f "$gra_src" ]; then
    printf 'FAIL  there is no backup of %s stamped %s.\n' "$gra_rel" "$gra_stamp" >&2
    printf '      With no stamp after it, ge restore lists the stamps there are.\n' >&2
    printf '      → run: ge restore %s\n' "$(ge_snap_quote "$gra_rel")" >&2
    return 1
  fi

  # THE BACKUP IS THERE AND GE CANNOT OPEN IT, asked before anything reads it.
  #
  # Without this the read failed three times over and none of the three said so.
  # cmp was handed a file it could not open, the line count fell through to the
  # shell's own input redirect, which put a raw line naming this script and the
  # line number inside it on the screen above everything ge wrote, and then cp
  # failed and was reported as "could not write", which is the other operation
  # entirely: the founder was sent to ge check about a folder that is fine, and
  # ge check answered that the backup is there and healthy, because it is.
  #
  # The permissions on the backup are the one thing ge can see and the one thing
  # a founder can put right, so that is what is named. Only the file is claimed
  # here, because only the file was examined: a folder ge could not look inside
  # would have failed the test above this one instead.
  if [ ! -r "$gra_src" ]; then
    printf 'FAIL  the backup of %s stamped %s is there, but ge cannot read it. Nothing was restored.\n' \
      "$gra_rel" "$gra_stamp" >&2
    printf '      Its permissions do not let ge open it, and ge does not change them by itself.\n' >&2
    printf '      Do this, then run the same command again.\n' >&2
    printf '      → run: chmod u+r %s\n' "$(ge_snap_quote "$gra_src")" >&2
    return 1
  fi

  # Byte for byte the same already, so there is nothing to put back. Writing the
  # same bytes again would eat a slot in the ring, move the modified time and set
  # a sync client going for nothing. It is also where a second ge undo lands, and
  # saying so plainly beats rewriting the file to report that nothing changed.
  if [ -f "$gra_tgt" ] && cmp -s "$gra_tgt" "$gra_src"; then
    printf '%s is already the same as the backup stamped %s. Nothing was changed.\n' \
      "$gra_rel" "$gra_stamp"
    return 0
  fi

  # Empty when the count could not be taken. It is only ever used to write one
  # sentence about how much changed, so a restore is never held up by it, and
  # the sentence is left out rather than printed with a hole where the number
  # goes. The check above has already proved the backup can be read, so reaching
  # here empty means the machine, not the file.
  gra_diff=$(ge_restore_diffcount "$gra_tgt" "$gra_src") || gra_diff=''

  gra_dir=$(dirname -- "$gra_tgt")
  if ! mkdir -p "$gra_dir" 2>/dev/null; then
    printf 'FAIL  could not make the folder %s, so nothing was restored.\n' "$gra_dir" >&2
    printf '      ge check says whether that folder is read only.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  fi

  # The shared guard from lib/paths.sh, asked BEFORE anything is copied and
  # before the backup slot is spent. A restore replaces the founder's own file,
  # so it is the same write every other command makes and it gets the same
  # answer: a read only file, a folder that will not take a new file, or a name
  # that belongs to a folder or a broken shortcut, each named in one sentence
  # with the one command that clears it. Without this the rename below failed and
  # the founder was told to run ge check, which reports the folder as fine.
  # A file that is not there at all passes, because putting one back is exactly
  # what this command is for.
  if ! ge_may_replace "$gra_tgt"; then
    ge_replace_refusal "$gra_tgt" "Nothing was restored." >&2
    return 1
  fi

  # Take the copy first, and take it next to the file it will become, so the
  # move at the end stays on one filesystem. Backing up the current state can
  # push the oldest backup out of the ring, and the oldest backup is exactly
  # what a founder reaching this far back is asking for.
  gra_tmp="$gra_dir/.ge-restore-tmp.$$"
  # Recorded before it exists, so a ctrl-c between the two lines still takes it
  # away. snapshot.sh owns the handler that reads this.
  GE_RESTORE_TMP=$gra_tmp
  if ! cp "$gra_src" "$gra_tmp" 2>/dev/null; then
    rm -f "$gra_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    printf 'FAIL  could not write %s, so nothing was restored.\n' "$gra_rel" >&2
    printf '      ge check says whether that folder is read only or full.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  fi

  # Back up what is about to be replaced, before replacing it. This is the whole
  # reason a restore is safe to try: the wrong choice costs one more command.
  if ! ge_snapshot_take "$gra_home" "$gra_rel"; then
    rm -f "$gra_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    return 1
  fi
  gra_back=$GE_SNAP_LAST_STAMP

  # The founder's own permissions go onto the copy before it lands, never after.
  # After the rename there is nothing left to read them from. A file a founder
  # set to owner only holds prospect names, and a restore that handed it back
  # readable by everybody would have undone that decision in silence.
  ge_keep_mode "$gra_tgt" "$gra_tmp"

  if ! mv "$gra_tmp" "$gra_tgt" 2>/dev/null; then
    rm -f "$gra_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    # ge_may_replace above saw nothing in the way, so this is a failure ge cannot
    # name: the folder filled up, or a sync client took the file mid write. The
    # shared refusal says exactly that and sends the founder to the doctor,
    # rather than naming a chmod on something that is already fine.
    ge_replace_refusal "$gra_tgt" "Nothing was restored." >&2
    return 1
  fi
  GE_RESTORE_TMP=''

  printf 'restored %s from the backup stamped %s\n' "$gra_rel" "$gra_stamp"
  if [ -z "$gra_diff" ]; then
    :                                   # no count, so no sentence about one
  elif [ "$gra_diff" = 0 ]; then
    printf '  it was already the same. Nothing in the file changed.\n'
  else
    # The noun and the verb both have to agree, so the verb is picked here and
    # the noun comes from the one function both printing places share.
    gra_verb=are
    [ "$gra_diff" = 1 ] && gra_verb=is
    printf '  %s %s different from what was there a moment ago.\n' \
      "$(ge_restore_lines "$gra_diff")" "$gra_verb"
  fi
  if [ -n "$gra_back" ]; then
    # The sentence goes above the arrow here too. This one is printed after a
    # restore that worked, and it is the line a founder pastes when the stamp
    # they picked turns out to be the wrong one.
    printf '  This puts back what you had a moment ago.\n'
    printf '  → run: ge restore %s %s\n' "$(ge_snap_quote "$gra_rel")" "$gra_back"
  fi
  return 0
}

# ge restore <file> --from -: put back a copy that is handed to ge on its input,
# rather than one out of the ring.
#
# WHY IT EXISTS: the ring is ten deep and it rolls, so the tenth write of the
# day pushes the morning's copy out of it for ever. Anything keeping a longer
# history than that has every version and no way to hand one back, because the
# only way in was to write the founder's file itself, and two writers on one
# file is how a file ends up half one version and half another with nothing
# saying which. This is the way in that keeps one writer: the caller says what
# the bytes are, and ge does the writing, so the backup before the overwrite,
# the founder's own permissions, the whole file built under a working name and
# moved into place in one step, and the way back afterwards all still happen.
#
# The bytes arrive on standard input and from nowhere else. A path would be a
# second thing to get wrong: a path is read relative to a working directory,
# which is exactly what the pin in lib/paths.sh exists to stop mattering, and a
# path that walks upward is a copy of a file ge was never meant to read.
#
# WHY AN EMPTY INPUT IS REFUSED. Nothing here can tell a version that was
# genuinely empty from a delivery that failed halfway and closed, and the two
# have opposite right answers: write it, or write nothing at all. A refusal
# costs one command. Guessing wrong costs the file, and the founder finds out
# by opening it.
ge_restore_from_stdin() {               # <home> <relative path>
  grs_home=$1
  grs_rel=$2
  grs_tgt="$grs_home/$grs_rel"
  grs_dir=$(dirname -- "$grs_tgt")

  if ! mkdir -p "$grs_dir" 2>/dev/null; then
    printf 'FAIL  could not make the folder %s, so nothing was restored.\n' "$grs_dir" >&2
    printf '      ge check says whether that folder is read only.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  fi

  # The same guard, asked in the same place and for the same reason as the
  # branch above: before the copy is taken and before a slot in the ring is
  # spent on a write that is not going to happen.
  if ! ge_may_replace "$grs_tgt"; then
    ge_replace_refusal "$grs_tgt" "Nothing was restored." >&2
    return 1
  fi

  grs_tmp="$grs_dir/.ge-restore-tmp.$$"
  # Recorded before it exists, so an interrupt between these two lines still
  # takes it away. snapshot.sh owns the handler that reads this.
  GE_RESTORE_TMP=$grs_tmp
  # The redirect is on the group and not on cat, for the reason set out over
  # every other write in this toolkit: a redirect that fails is reported by the
  # shell, naming this file and a line number inside it, above the sentence
  # written for the founder. The status is read, because a copy that stopped
  # part way through still leaves a file that opens.
  if ! { cat > "$grs_tmp"; } 2>/dev/null; then
    rm -f "$grs_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    printf 'FAIL  could not write %s, so nothing was restored.\n' "$grs_rel" >&2
    printf '      ge check says whether that folder is read only or full.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  fi

  if [ ! -s "$grs_tmp" ]; then
    rm -f "$grs_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    printf 'FAIL  the copy handed to ge held nothing at all, so nothing was restored.\n' >&2
    printf '      %s is exactly as it was.\n' "$grs_rel" >&2
    printf '      ge restore on its own lists the copies ge has of it.\n' >&2
    printf '      → run: ge restore %s\n' "$(ge_snap_quote "$grs_rel")" >&2
    return 1
  fi

  # Byte for byte the same already. Writing it again would spend a slot in the
  # ring, move the modified time and set a sync client going, all to report that
  # nothing changed. The same answer ge_restore_apply gives to the same state.
  if [ -f "$grs_tgt" ] && cmp -s "$grs_tgt" "$grs_tmp"; then
    rm -f "$grs_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    printf '%s is already the same as the copy you picked. Nothing was changed.\n' "$grs_rel"
    return 0
  fi

  grs_diff=$(ge_restore_diffcount "$grs_tgt" "$grs_tmp") || grs_diff=''

  # Back up what is about to be replaced, before replacing it, so this restore
  # is itself undoable. ge undo reads the newest copy in the ring, which is the
  # one this line makes, so it is also what makes ge undo the way back.
  if ! ge_snapshot_take "$grs_home" "$grs_rel"; then
    rm -f "$grs_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    return 1
  fi
  grs_back=$GE_SNAP_LAST_STAMP

  # The founder's own permissions go onto the copy before it lands, never after.
  # After the rename there is nothing left to read them from.
  ge_keep_mode "$grs_tgt" "$grs_tmp"

  if ! mv "$grs_tmp" "$grs_tgt" 2>/dev/null; then
    rm -f "$grs_tmp" 2>/dev/null
    GE_RESTORE_TMP=''
    ge_replace_refusal "$grs_tgt" "Nothing was restored." >&2
    return 1
  fi
  GE_RESTORE_TMP=''

  printf 'restored %s from the copy you picked\n' "$grs_rel"
  if [ -z "$grs_diff" ]; then
    :
  elif [ "$grs_diff" = 0 ]; then
    printf '  it was already the same. Nothing in the file changed.\n'
  else
    grs_verb=are
    [ "$grs_diff" = 1 ] && grs_verb=is
    printf '  %s %s different from what was there a moment ago.\n' \
      "$(ge_restore_lines "$grs_diff")" "$grs_verb"
  fi
  if [ -n "$grs_back" ]; then
    printf '  This puts back what you had a moment ago.\n'
    printf '  → run: ge restore %s %s\n' "$(ge_snap_quote "$grs_rel")" "$grs_back"
  fi
  return 0
}

ge_restore_list() {                     # <home> <relative path> <stamps, oldest first>
  grl_home=$1
  grl_rel=$2
  grl_dir="$grl_home/.state/snapshots"
  grl_flat=$(ge_snap_flat "$grl_rel")
  # Every row below compares a backup with the file the founder has now, so a
  # file that is there and will not open takes every comparison down with it.
  # Asked once, here, because it is one fact about one file and the answer is the
  # same on every row. Left to the rows it came out as "ge cannot read this one"
  # against each backup in turn, which names the wrong file: the backups are fine
  # and it is their own file ge cannot see.
  grl_blind=''
  if [ -f "$grl_home/$grl_rel" ] && [ ! -r "$grl_home/$grl_rel" ]; then
    grl_blind=1
    printf '        ge cannot read %s as it stands, so it cannot say how these differ from it.\n' \
      "$grl_rel"
  fi
  printf '%s\n' "$3" | while IFS= read -r grl_s; do
    [ -n "$grl_s" ] || continue
    # A backup ge could not read gives no count, and a made up one here would be
    # a founder choosing which stamp to overwrite their work with by a number ge
    # invented. It is said in the listing instead, so the one they cannot use is
    # the one they can see is different.
    if [ -n "$grl_blind" ]; then
      printf '        %s\n' "$grl_s"
    elif ! grl_n=$(ge_restore_diffcount "$grl_home/$grl_rel" "$grl_dir/$grl_flat.$grl_s"); then
      printf '        %s   ge cannot read this one\n' "$grl_s"
    elif [ "$grl_n" = 0 ]; then
      printf '        %s   the same as the file you have now\n' "$grl_s"
    else
      printf '        %s   %s different from the file you have now\n' \
        "$grl_s" "$(ge_restore_lines "$grl_n")"
    fi
  done
}

ge_restore_main() {
  GE_SNAP_VERB=restore

  if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
    printf 'FAIL  ge restore needs the name of the file to put back.\n' >&2
    # It named founder-brain.md. Between session 1 and session 2 most founders
    # have no such file and no backup of one, so pasting that line was answered
    # with a second refusal about a file they had never heard ge mention. ge
    # index names the files this folder really holds, which is the thing the
    # founder was missing, and it is the same line the three branches below hand
    # over for the same reason.
    printf '      ge index prints every file ge knows about, so you can pick the name.\n' >&2
    printf '      → run: ge index\n' >&2
    return 1
  fi

  grm_home=$(ge_snap_home) || return 1
  grm_rel=$(ge_snap_relpath "$grm_home" "$1") || return 1

  # --from, read before the ring is listed, because a copy handed to ge does not
  # need the ring to hold anything and the whole listing below is about what the
  # ring holds. A file with no backups at all is the ordinary case here: it is
  # what a founder has after their first write, and it is exactly when somebody
  # asks for a version from further back than the ring goes.
  if [ "${2:-}" = --from ]; then
    if [ "${3:-}" != - ]; then
      printf 'FAIL  ge restore --from reads the copy on its input, and nothing else.\n' >&2
      printf '      A single dash is the whole of what goes after it.\n' >&2
      printf '      With nothing after the file name, ge restore lists the copies it has.\n' >&2
      printf '      → run: ge restore %s\n' "$(ge_snap_quote "$grm_rel")" >&2
      return 1
    fi
    if [ "$#" -gt 3 ]; then
      printf 'FAIL  ge restore --from - takes nothing after the dash.\n' >&2
      printf '      The copy comes in on its own, so there is no stamp to name as well.\n' >&2
      printf '      With nothing after the file name, ge restore lists the copies it has.\n' >&2
      printf '      → run: ge restore %s\n' "$(ge_snap_quote "$grm_rel")" >&2
      return 1
    fi
    ge_restore_from_stdin "$grm_home" "$grm_rel"
    return $?
  fi

  grm_want=$(printf '%s' "${2:-}" | tr -d '\r')

  grm_dir="$grm_home/.state/snapshots"
  grm_flat=$(ge_snap_flat "$grm_rel")
  grm_list=$(ge_snap_stamps "$grm_dir" "$grm_flat")

  if [ -z "$grm_list" ]; then
    # TWO REFUSALS, because ge snapshot only clears one of them.
    #
    # This used to be one refusal handing over ge snapshot whatever the state of
    # the folder. On a file that is not in the folder at all, ge snapshot has
    # nothing to copy: it says so, exits 0, and the founder runs ge restore again
    # and reads this same refusal word for word. A way out that runs, changes
    # nothing and leads straight back is worse than none, because there is no
    # error anywhere for the founder to notice.
    #
    # ge snapshot itself is left as it is. Three other commands take their backup
    # by running it before a first write, and a file that does not exist yet has
    # to stay a success there or a founder's first prospect cannot be added. ge
    # restore is where the two cases can be told apart, so they are told apart
    # here.
    # The branches are told apart by the SAME test ge snapshot backs off on,
    # which is -f. That is what makes the first one honest: ge snapshot copies an
    # ordinary file and nothing else, so it is offered where there is one and
    # nowhere else. Each of the other three says only what it looked at, because
    # "there is no people.md here" about a folder called people is a sentence a
    # founder cannot act on and cannot trust.
    grm_tgt="$grm_home/$grm_rel"
    if [ -d "$grm_tgt" ]; then
      printf 'FAIL  %s is a folder, and ge restore puts back one file at a time.\n' "$grm_rel" >&2
      # Folder inside the quotes, gap outside them, so the shell reads the pair
      # as one argument once the founder has typed the name into the gap.
      printf '      → run: ge restore %s/<the file inside it>\n' "$(ge_snap_quote "$grm_rel")" >&2
      return 1
    fi
    # AND NOW ASK WHETHER THE EMPTY LIST IS AN ANSWER AT ALL.
    #
    # Each of the three branches below says something about the backups there
    # are, and every one of them was reading an empty list as proof there are
    # none. With the folder shut, ge has not seen a single backup and cannot say
    # anything about them, so it says that instead and names the folder.
    #
    # It goes here and not above the folder branch on purpose. That branch is
    # about the name the founder typed, it never mentions backups, and it would
    # refuse a folder with a full ring in exactly the same words.
    if ge_restore_ring_shut "$grm_home"; then
      ge_restore_ring_refusal "$grm_home" "whether there are backups of $grm_rel." >&2
      return 1
    fi
    if [ -f "$grm_tgt" ]; then
      printf 'FAIL  there are no backups of %s.\n' "$grm_rel" >&2
      printf '      ge makes one every time it changes a file, so ge has not changed this one yet.\n' >&2
      printf '      This makes one now, and then there is something to put back.\n' >&2
      printf '      → run: ge snapshot %s\n' "$(ge_snap_quote "$grm_rel")" >&2
      return 1
    fi
    # -h as well as -e, because a shortcut pointing at something that is gone
    # answers to neither on its own.
    if [ -e "$grm_tgt" ] || [ -h "$grm_tgt" ]; then
      printf 'FAIL  %s is not an ordinary file, so there is nothing here for ge to put back.\n' "$grm_rel" >&2
      printf '      ge index prints every file ge knows about, so you can check the name.\n' >&2
      printf '      → run: ge index\n' >&2
      return 1
    fi
    printf 'FAIL  there is no %s in your growth-engine folder.\n' "$grm_rel" >&2
    printf '      ge puts a file back from a backup, and there is neither the file nor a backup of it.\n' >&2
    printf '      ge index prints every file ge knows about, so you can check the name.\n' >&2
    printf '      → run: ge index\n' >&2
    return 1
  fi

  grm_count=$(printf '%s\n' "$grm_list" | wc -l | tr -d ' ')
  grm_newest=$(printf '%s\n' "$grm_list" | sed -n '$p')

  if [ -n "$grm_want" ]; then
    if ! printf '%s\n' "$grm_list" | grep -q -x -F "$grm_want"; then
      printf 'FAIL  there is no backup of %s stamped %s.\n' "$grm_rel" "$grm_want" >&2
      printf '      These are the ones there are, oldest first:\n' >&2
      ge_restore_list "$grm_home" "$grm_rel" "$grm_list" >&2
      printf '      → run: ge restore %s %s\n' "$(ge_snap_quote "$grm_rel")" "$grm_newest" >&2
      return 1
    fi
    ge_restore_apply "$grm_home" "$grm_rel" "$grm_want"
    return $?
  fi

  if [ "$grm_count" -eq 1 ]; then
    ge_restore_apply "$grm_home" "$grm_rel" "$grm_newest"
    return $?
  fi

  # More than one, and no stamp given. Refusing and listing is the only honest
  # answer: choosing for the founder would overwrite the file they can still see.
  printf 'FAIL  there are %s backups of %s, so ge will not pick one for you.\n' "$grm_count" "$grm_rel" >&2
  printf '      Oldest first, newest last:\n' >&2
  ge_restore_list "$grm_home" "$grm_rel" "$grm_list" >&2
  # "for the newest one" sat on the end of the command, after a run of spaces.
  # A founder selects the whole line, so those four words were pasted with it.
  printf '      This one is the newest.\n' >&2
  printf '      → run: ge restore %s %s\n' "$(ge_snap_quote "$grm_rel")" "$grm_newest" >&2
  return 1
}

# undo.sh sources this file for ge_restore_apply and sets this first, because it
# is not the restore command and must not run it.
[ -n "${GE_RESTORE_LIB_ONLY:-}" ] || ge_restore_main "$@"
