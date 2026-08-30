# snapshot.sh: the backup that makes every other write safe. Sourced by ge.sh.
#
# WHY IT EXISTS: every skill in this toolkit rewrites whole founder files, so a
#                single bad regeneration can take a morning of the founder's own
#                judgement with it, and nothing else in the brain can give it
#                back. This file is what "no snapshot, no write" actually means.
#                restore.sh and undo.sh source it, so the naming rule and the
#                ring rule exist in exactly one place and cannot drift apart.
# CALLED BY:     ge snapshot, ge restore, ge undo, and every skill before a write
# READS:         the named founder file   WRITES: growth-engine/.state/snapshots/
# POSTURE:       fail-closed. A copy that cannot be made exits 1 so the caller
#                stops before it writes. One stated exception: a target that is
#                not there yet exits 0 and does nothing, because a first write
#                has nothing to lose and must never be blocked by this. It says
#                so on standard output, which every caller inside ge drops, and
#                stays silent on standard error, which three of them pass on.
#                More than one growth-engine folder is refused by lib/paths.sh,
#                so ge snapshot, ge restore and ge undo all say what every other
#                verb says and hand over the same command to paste.
#                The copy itself runs inside a group whose standard error is
#                thrown away, because a copy stopped by a quota is reported by
#                the shell and not by cp, and a redirect on cp does not reach it.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Stamps via lib/date_compat.sh.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").

# Ten is enough history for a file a founder edits by hand. Twenty for people/,
# because building one prospect takes four or five snapshotted writes before the
# founder has done anything they might want to take back.
GE_SNAP_RING=10
GE_SNAP_RING_PEOPLE=20

# Which verb to name in a recovery line. restore.sh and undo.sh set their own,
# so a founder is never told to run the command they did not run.
GE_SNAP_VERB=${GE_SNAP_VERB:-snapshot}

# The stamp of the snapshot just taken. Empty when there was nothing to copy.
GE_SNAP_LAST_STAMP=''

# The two half made copies this family of commands can have on disk at once, held
# in variables so one handler can take both away. restore.sh sets the second one
# and this file is the one both it and undo.sh source, which is why both are
# declared here: a later trap replaces an earlier one for the same signal, so
# there can only be one handler and it has to know about everything.
#
# Without it, ctrl-c during a copy of a large file leaves a file the founder has
# never heard of sitting beside their own, and nothing in the toolkit mentions
# it again. A kill that cannot be caught at all is beyond any handler, and that
# copy is at least inside .state or hidden by its leading dot.
GE_SNAP_TMP=''
GE_RESTORE_TMP=''

ge_snap_sweep() {
  [ -z "$GE_SNAP_TMP" ]    || rm -f "$GE_SNAP_TMP" 2>/dev/null
  [ -z "$GE_RESTORE_TMP" ] || rm -f "$GE_RESTORE_TMP" 2>/dev/null
  GE_SNAP_TMP=''
  GE_RESTORE_TMP=''
  return 0
}

# Interrupts only, never EXIT: ge.sh owns the exit trap, it is what answers a
# damaged install, and a second trap on the same signal replaces the first.
# Stopping here rather than carrying on is the point, because the next line
# would be a write. ge.sh's exit trap then says the command did not finish.
trap 'ge_snap_sweep; exit 130' INT HUP TERM

ge_snap_home() {
  # ge_find_home has three answers and each needs a different sentence. Merging
  # them is how a founder in the wrong folder gets told they never started.
  gsh_out=$(ge_find_home)
  gsh_rc=$?
  # The shared refusal in lib/paths.sh, so ge snapshot, ge restore and ge undo
  # say what every other verb says here too. "here or above here" left out the
  # home folder, the Desktop, Documents and Downloads, which ge_find_home reads,
  # and a bare ge init was the only way out offered. A founder who already had a
  # folder somewhere else was being talked into making a second one.
  if [ "$gsh_rc" -eq 1 ]; then
    ge_nofolder_refusal fail >&2
    return 1
  fi
  if [ "$gsh_rc" -eq 2 ]; then
    # The one refusal, from lib/paths.sh, so ge snapshot, ge restore and ge undo
    # say what every other verb says. The line here used to read "cd to the
    # folder that holds the right one", which describes an action rather than
    # naming one, and which clears nothing at all when one of the two folders
    # sits inside the other. paths.sh hands over the mv to paste instead, and
    # says in as many words that nothing is deleted by it.
    ge_scatter_refusal "$gsh_out" >&2
    return 1
  fi
  printf '%s\n' "$gsh_out" | sed -n '1p'
}

# The last two lines of every refusal here that is about a NAME: the founder
# typed something ge cannot turn into a file inside their folder, and what they
# are missing is the list of names that are.
#
# WHY IT IS NOT "ge snapshot founder-brain.md" ANY MORE. Every one of these
# branches offered that. A founder between session 1 and session 2 has not
# written the brain yet, which is the ordinary state at that point in the
# programme, so the line they pasted was answered with a second message about a
# file they had never had: ge snapshot said there was nothing to back up, and ge
# restore refused outright, having no backup of it either. The same three
# branches serve ge snapshot, ge restore and ge undo through GE_SNAP_VERB, so
# the line has to hold for all three, and only one does: ge index prints the
# files this folder really holds, whichever of the three the founder is running
# and whatever they have written so far. It is the same line ge restore already
# hands over three times for the same reason.
#
# Printed on standard output. Each caller sends it to standard error itself, so
# the whole refusal stays on one stream.
ge_snap_index_line() {
  printf '      ge index prints every file ge knows about, so you can pick the name.\n'
  printf '      → run: ge index\n'
}

ge_snap_relpath() {                     # <home> <argument as typed>
  gsr_home=$1
  gsr_p=$(printf '%s' "$2" | tr -d '\r')

  case $gsr_p in
    "$gsr_home"/*) gsr_p=${gsr_p#"$gsr_home"/} ;;
    /*)
      printf 'FAIL  %s is outside your growth-engine folder.\n' "$gsr_p" >&2
      printf '      ge only ever touches files inside that one folder.\n' >&2
      # The instruction sits above and the command sits alone on its own line.
      # It used to ride on the recovery line as "ge snapshot founder-brain.md,
      # using the name as it sits inside growth-engine", and a founder pastes
      # that line whole: ge is handed a file called "founder-brain.md," and
      # answers about a file of that name, which is a second refusal.
      printf '      Name the file the way it sits inside growth-engine.\n' >&2
      ge_snap_index_line >&2
      return 1 ;;
  esac

  while :; do
    case $gsr_p in
      ./*) gsr_p=${gsr_p#./} ;;
      *) break ;;
    esac
  done
  case $gsr_p in
    growth-engine/*) gsr_p=${gsr_p#growth-engine/} ;;
  esac

  case $gsr_p in
    '')
      printf 'FAIL  that is not a file name.\n' >&2
      ge_snap_index_line >&2
      return 1 ;;
    ..|../*|*/..|*/../*)
      printf 'FAIL  %s steps outside your growth-engine folder.\n' "$gsr_p" >&2
      printf '      Name the file the way it sits inside growth-engine.\n' >&2
      ge_snap_index_line >&2
      return 1 ;;
    */)
      printf 'FAIL  %s names a folder, and ge %s works on one file.\n' "$gsr_p" "$GE_SNAP_VERB" >&2
      # The folder is quoted and the gap is left outside the quotes, so the two
      # halves sit next to each other and a shell joins them into one argument.
      # A founder types the file name into the gap, and if that name carries a
      # space of its own they can put quotes round the whole thing: either way
      # the folder half is already safe. Bare, "My Notes/" split the line in two.
      printf '      → run: ge %s %s<the file inside it>\n' "$GE_SNAP_VERB" "$(ge_snap_quote "$gsr_p")" >&2
      return 1 ;;
    *__*)
      # A backup file name carries the folder in it, with the slash written as
      # two underscores. A file name that already has two underscores would make
      # that ambiguous, and ge undo would put the file back in the wrong place.
      printf 'FAIL  ge cannot back up %s, because its name contains two underscores in a row.\n' "$gsr_p" >&2
      printf '      Backup names use two underscores to stand for a folder, so this one could not be read back.\n' >&2
      # A command to paste beats a description of one, but only when the file is
      # really there and the shorter name is free. A name reaching here is as
      # often one typed wrong as one on disk, and handing over an mv that fails
      # is a worse line than the sentence it replaces. The name goes to sed on
      # standard input, never into the script sed is given.
      gsr_fix=$(printf '%s' "$gsr_p" | sed 's|__*|_|g')
      if [ -e "$gsr_home/$gsr_p" ] && [ ! -e "$gsr_home/$gsr_fix" ]; then
        printf '      → run: mv %s %s\n' \
          "$(ge_snap_quote "$gsr_home/$gsr_p")" "$(ge_snap_quote "$gsr_home/$gsr_fix")" >&2
      else
        # A bare arrow, because there is no command here. ge will not invent a
        # third name for the founder to keep track of, and the line opened on
        # "rename", which is a real program on some machines: pasted there it set
        # about renaming something. Give is neither a program nor a shell
        # reserved word, so pasting this now does nothing at all.
        printf '      → Give the file a name with a single underscore or a dash, then run the same command again.\n' >&2
      fi
      return 1 ;;
  esac

  printf '%s\n' "$gsr_p"
}

ge_snap_quote() {
  # A recovery line has to be a command the founder can paste. A file called
  # sam's notes.md pasted bare is a command that does not run, which turns the
  # one line that was meant to help into a second problem.
  case $1 in
    '') printf "''"; return 0 ;;
    *[!A-Za-z0-9._/@-]*) ;;
    *) printf '%s' "$1"; return 0 ;;
  esac
  gsq_rest=$1
  printf "'"
  while :; do
    case $gsq_rest in
      *\'*)
        printf '%s' "${gsq_rest%%\'*}"
        printf "'"; printf '\\'; printf "''"
        gsq_rest=${gsq_rest#*\'} ;;
      *) printf '%s' "$gsq_rest"; break ;;
    esac
  done
  printf "'"
}

# people/sofia.md becomes people__sofia.md, so .state/snapshots/ stays one flat
# folder and growth-engine/sofia.md can never overwrite growth-engine/people/sofia.md.
ge_snap_flat()   { printf '%s' "$1" | sed 's|/|__|g'; }
ge_snap_unflat() { printf '%s' "$1" | sed 's|__|/|g'; }

ge_snap_ring() {
  case $1 in
    people/*) printf '%s' "$GE_SNAP_RING_PEOPLE" ;;
    *)        printf '%s' "$GE_SNAP_RING" ;;
  esac
}

ge_snap_is_stamp() {
  case $1 in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) return 0 ;;
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-[0-9][0-9][0-9]) return 0 ;;
  esac
  return 1
}

# The one place the ring is enumerated. ls -1 was used here and it does not list
# a dot-prefixed name, so .state/receipt.md, which flattens to .state__receipt.md,
# came back with no stamps at all: no tie-breaker, no pruning, and a second write
# in the same second landing on top of the first through mv. Everything that
# reads the ring calls this, so that can only ever be wrong in one place.
ge_snap_names() {                       # <snapshot dir>, one bare name per line
  [ -d "$1" ] || return 0
  # ge undo enumerates with pathname expansion turned off, which would leave the
  # globs below standing as themselves. Turned on here, and put back as found.
  gsl_noglob=''
  case $- in *f*) gsl_noglob=1; set +f ;; esac
  # Three patterns, because the first skips dot names and the other two are how
  # POSIX reaches them without reaching . and .. as well. A pattern that matches
  # nothing is left standing as itself, which is what the -e test throws away.
  for gsl_p in "$1"/* "$1"/.[!.]* "$1"/..?*; do
    [ -e "$gsl_p" ] || continue
    printf '%s\n' "${gsl_p##*/}"
  done
  [ -z "$gsl_noglob" ] || set -f
  return 0
}

ge_snap_stamps() {                      # <snapshot dir> <flat name>, oldest first
  gss_dir=$1
  gss_flat=$2
  [ -d "$gss_dir" ] || return 0
  ge_snap_names "$gss_dir" | while IFS= read -r gss_name; do
    case $gss_name in
      "$gss_flat".*) ;;
      *) continue ;;
    esac
    gss_s=${gss_name#"$gss_flat".}
    ge_snap_is_stamp "$gss_s" || continue
    printf '%s\n' "$gss_s"
  done | LC_ALL=C sort
}

ge_snap_bump() {                        # <stamp> -> the next stamp after it
  case $1 in
    *-[0-9][0-9][0-9]) gsb_base=${1%-*}; gsb_n=${1##*-} ;;
    *) gsb_base=$1; gsb_n=001 ;;
  esac
  # Leading zeros are stripped by hand: shell arithmetic reads 010 as octal.
  gsb_n=${gsb_n#0}
  gsb_n=${gsb_n#0}
  [ -n "$gsb_n" ] || gsb_n=0
  gsb_n=$((gsb_n + 1))
  case $gsb_n in
    [0-9])      printf '%s-00%s' "$gsb_base" "$gsb_n" ;;
    [0-9][0-9]) printf '%s-0%s'  "$gsb_base" "$gsb_n" ;;
    [0-9][0-9][0-9]) printf '%s-%s' "$gsb_base" "$gsb_n" ;;
    *) return 1 ;;
  esac
}

ge_snap_next_stamp() {                  # <snapshot dir> <flat name>
  # The stamp has to sort after every stamp already there. A ge skill can take
  # several snapshots of one file inside the same second, and if the new one
  # sorted first the ring would throw away the newest copy rather than the oldest.
  gsn_now=$(utc_stamp)
  gsn_max=$(ge_snap_stamps "$1" "$2" | sed -n '$p')
  if [ -z "$gsn_max" ]; then
    printf '%s' "$gsn_now"
    return 0
  fi
  gsn_first=$(printf '%s\n%s\n' "$gsn_now" "$gsn_max" | LC_ALL=C sort | sed -n '1p')
  if [ "$gsn_now" != "$gsn_max" ] && [ "$gsn_first" = "$gsn_max" ]; then
    printf '%s' "$gsn_now"
    return 0
  fi
  ge_snap_bump "$gsn_max"
}

ge_snap_prune() {                       # <snapshot dir> <flat name> <ring size>
  gsp_total=$(ge_snap_stamps "$1" "$2" | wc -l | tr -d ' ')
  [ "$gsp_total" -gt "$3" ] || return 0
  gsp_drop=$((gsp_total - $3))
  ge_snap_stamps "$1" "$2" | head -n "$gsp_drop" | while IFS= read -r gsp_s; do
    rm -f "$1/$2.$gsp_s" 2>/dev/null
  done
  return 0
}


ge_snapshot_take() {                    # <home> <relative path>
  gst_home=$1
  gst_rel=$2
  GE_SNAP_LAST_STAMP=''
  gst_src="$gst_home/$gst_rel"

  if [ -d "$gst_src" ]; then
    printf 'FAIL  %s is a folder, and ge snapshot backs up one file at a time.\n' "$gst_rel" >&2
    # Quoted for the same reason as the folder branch of ge_snap_relpath, and
    # the same way: the folder inside quotes, the gap outside them, so the shell
    # reads the pair as one argument once the founder has filled the gap in.
    printf '      → run: ge snapshot %s/<the file inside it>\n' "$(ge_snap_quote "$gst_rel")" >&2
    return 1
  fi

  # A file that is not there yet cannot be lost, so this is a success. Without
  # it the first export on every founder machine would fail on a backup of a
  # file the export itself is about to create.
  [ -f "$gst_src" ] || return 0

  gst_dir="$gst_home/.state/snapshots"
  if ! mkdir -p "$gst_dir" 2>/dev/null; then
    printf 'FAIL  could not make the backup folder at %s.\n' "$gst_dir" >&2
    printf '      Nothing was changed.\n' >&2
    ge_backup_refusal "$gst_dir" >&2
    return 1
  fi

  gst_flat=$(ge_snap_flat "$gst_rel")
  gst_stamp=$(ge_snap_next_stamp "$gst_dir" "$gst_flat")
  if [ -z "$gst_stamp" ]; then
    printf 'FAIL  %s has already been backed up 999 times in the same second.\n' "$gst_rel" >&2
    printf '      Nothing was changed.\n' >&2
    # A bare arrow: waiting is not a command. It opened on "the", and a founder
    # who pasted that was answered about a command called the.
    printf '      → Give it a moment, then run the same command again.\n' >&2
    return 1
  fi

  # Copy to a temporary name and move it into place, so a copy that stops
  # halfway never leaves a backup that looks whole and is not.
  gst_tmp="$gst_dir/.ge-snapshot-tmp.$$"
  # Recorded before it exists, so a ctrl-c between these two lines still takes
  # it away rather than leaving half a backup in the ring.
  GE_SNAP_TMP=$gst_tmp
  # The redirect goes on the group, not on cp. A disk quota or a file size limit
  # stops cp with a signal, and the line that names that is written by the shell
  # waiting on cp rather than by cp itself, so a redirect on cp alone never
  # caught it. The founder was shown a raw line naming this file, a line number
  # inside it and the working name of the backup, and then the sentence below as
  # well: two messages for one problem, and the first of them not ours. The
  # group's own standard error is where the shell writes that line, so this
  # catches both. A subshell does not work here, and appending anything after cp
  # inside the group would throw away the very failure this is testing for.
  if ! { cp "$gst_src" "$gst_tmp"; } 2>/dev/null; then
    rm -f "$gst_tmp" 2>/dev/null
    GE_SNAP_TMP=''
    printf 'FAIL  could not back up %s, so nothing was changed.\n' "$gst_rel" >&2
    printf '      Backups go in %s\n' "$gst_dir" >&2
    ge_backup_refusal "$gst_dir" >&2
    return 1
  fi
  if ! mv "$gst_tmp" "$gst_dir/$gst_flat.$gst_stamp" 2>/dev/null; then
    rm -f "$gst_tmp" 2>/dev/null
    GE_SNAP_TMP=''
    printf 'FAIL  could not finish backing up %s, so nothing was changed.\n' "$gst_rel" >&2
    printf '      Backups go in %s\n' "$gst_dir" >&2
    ge_backup_refusal "$gst_dir" >&2
    return 1
  fi
  GE_SNAP_TMP=''

  ge_snap_prune "$gst_dir" "$gst_flat" "$(ge_snap_ring "$gst_rel")"
  GE_SNAP_LAST_STAMP=$gst_stamp
  return 0
}

ge_snapshot_main() {
  if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
    printf 'FAIL  ge snapshot needs the name of the file to back up.\n' >&2
    # Same reason as the three branches in ge_snap_relpath: naming the brain
    # here sent a founder who has not written one to a command that answers
    # there was nothing to back up.
    ge_snap_index_line >&2
    return 1
  fi
  gsm_home=$(ge_snap_home) || return 1
  gsm_rel=$(ge_snap_relpath "$gsm_home" "$1") || return 1
  ge_snapshot_take "$gsm_home" "$gsm_rel" || return 1

  # Nothing there to copy. Still a success, because a first write has nothing to
  # lose and must never be blocked by a backup of the file it is about to make.
  #
  # THIS STAYS AT ZERO, and here is the argument, because it was nearly changed.
  # ge person, ge ledger and ge remember all take their backup by running this
  # command, not by calling the function inside it, so there is no seam here
  # between "a founder typed it" and "ge is about to write". Refusing a file that
  # is not there would therefore refuse ge person add for a person who has no
  # file yet, which is every founder's first prospect. What was actually broken
  # was ge restore offering this command as the way out of a refusal it cannot
  # clear, and that is fixed in restore.sh, where ge does know which of the two
  # cases it is looking at. The message below says plainly that nothing was
  # copied, so a founder who typed a name one letter wrong is not told a backup
  # exists.
  #
  # Said out loud, though, and this is why: ge snapshot is also the verb the help
  # text offers a founder before they edit a file by hand, and a name typed one
  # letter wrong looked exactly like a backup that had been taken. It goes on
  # standard output, which every skill and every command inside ge that calls
  # this sends to /dev/null, so a first write still reads clean. Standard error
  # is left silent on purpose: three commands pass it straight through to the
  # founder, and each of them backs up a file that does not exist yet.
  if [ -z "$GE_SNAP_LAST_STAMP" ]; then
    printf 'there is no %s in your growth-engine folder, so there was nothing to back up.\n' "$gsm_rel"
    printf '  ge index prints every file ge knows about, so you can check the name.\n'
    printf '  → run: ge index\n'
    return 0
  fi

  printf 'snapshot %s %s\n' "$gsm_rel" "$GE_SNAP_LAST_STAMP"
}

# restore.sh and undo.sh source this file for the rules above and set this
# first, because they are not the snapshot command and must not run it.
[ -n "${GE_SNAPSHOT_LIB_ONLY:-}" ] || ge_snapshot_main "$@"
