# undo.sh: put back the most recent thing ge changed. Sourced by ge.sh.
#
# WHY IT EXISTS: a founder who has just watched a skill overwrite good work does
#                not stop to read stamps in a hidden folder. They need one word.
#                Without this the backup ring exists and nobody uses it. It
#                refuses to guess when two files changed together, because
#                undoing the wrong one of a pair is a second loss on top of the
#                first, and the founder has no way to tell that it happened.
#                Running it twice cannot hand the damage back: what an undo put
#                back is written down, and the copy the restore leaves behind is
#                never offered again. The second run says nothing changed.
# CALLED BY:     ge undo, and the recovery lines that name it
# READS:         growth-engine/.state/snapshots/ and .state/undone
# WRITES:        one founder file, and .state/undone
# POSTURE:       fail-closed on the choice. One candidate is restored, more than
#                one is listed and nothing is written. A file name is refused
#                rather than ignored, because ignoring one put a file the founder
#                never named back to an older copy and reported success.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. BSD and GNU date both handled.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").

GE_RESTORE_LIB_ONLY=1
. "$GE_HOME_DIR/scripts/cmd/restore.sh"

GE_UNDO_NL=$(printf '\nx')
GE_UNDO_NL=${GE_UNDO_NL%x}

ge_undo_cutoff() {
  # The stamp an hour ago, in the same UTC shape the ring uses, so the window is
  # a string comparison. Converting the other way would read a UTC stamp in the
  # founder timezone and put the window out by up to fourteen hours.
  guc_t=$(( $(now_epoch) - 3600 ))
  if [ "$GE_DATE" = gnu ]; then
    date -u -d "@$guc_t" +%Y%m%dT%H%M%SZ 2>/dev/null
  else
    date -u -r "$guc_t" +%Y%m%dT%H%M%SZ 2>/dev/null
  fi
}

ge_undo_at_or_after() {                 # <stamp> <cutoff>
  [ "$1" = "$2" ] && return 0
  [ "$(printf '%s\n%s\n' "$1" "$2" | LC_ALL=C sort | sed -n '1p')" = "$2" ]
}

# The backups a previous ge undo already put back, one "<flat> <stamp>" a line.
GE_UNDO_DONE=''

# WHY THIS FILE EXISTS AT ALL: a restore backs up the state it is replacing, so
# the copy it leaves behind holds the damage and is newer than everything else in
# the ring. Taking the newest without asking made ge undo a toggle: the second
# run handed the clobbered file back, worded exactly like the first, and a
# founder who ran it twice because they were not sure it worked lost the file
# they had just got back. Reading the list is cheap and it is read once.
#
# AND A READ THAT DID NOT HAPPEN IS NOT AN EMPTY LIST. Both come back as an
# empty string, and an empty string here means "no undo has put anything back
# yet", which puts every copy a previous undo left behind back on the list. That
# is the toggle again, arrived at from the other direction, and it ends the same
# way: the founder runs ge undo twice and loses what the first one gave them. So
# this answers 0 read, 1 there and shut, 2 there and not a file, and ge undo
# stops on either of the last two rather than choose in the dark.
ge_undo_load_done() {                   # <home>: 0 read it, 1 shut, 2 not a file
  GE_UNDO_DONE=''
  guld_f="$1/.state/undone"
  # Not there at all is a real answer, and the ordinary one on a folder where no
  # undo has run yet. -h as well, so a shortcut pointing at something that is
  # gone is not counted as nothing being there.
  [ -e "$guld_f" ] || [ -h "$guld_f" ] || return 0
  [ -f "$guld_f" ] || return 2
  # The stderr redirect comes first, because a file that goes away between the
  # test above and the read below would otherwise answer the founder in the
  # shell's own words rather than in ours. The status of the read is the whole
  # point of writing it this way round: it is the only thing that tells an empty
  # file apart from one that never opened.
  GE_UNDO_DONE=$(tr -d '\r' 2>/dev/null < "$guld_f") && return 0
  GE_UNDO_DONE=''
  return 1
}

# The refusal for both of those, in one place, because the two differ only in the
# sentence that names the cause and the one command that clears it.
ge_undo_note_refusal() {                # <home> <2 when it is not a file>
  gunr_f="$1/.state/undone"
  printf 'FAIL  ge keeps a note of what it has already put back for you, and it cannot read that note.\n' >&2
  printf '      Without it, ge undo can hand you back the very change it put right last time.\n' >&2
  if [ "${2:-1}" = 2 ]; then
    printf '      Something other than a file is sitting on that name.\n' >&2
    printf '      This moves it aside and deletes nothing. ge writes a fresh note next time.\n' >&2
    printf '      → run: mv %s %s\n' \
      "$(ge_snap_quote "$gunr_f")" "$(ge_snap_quote "$gunr_f-old")" >&2
    return 0
  fi
  printf '      Its permissions do not let ge open it, and ge does not change them by itself.\n' >&2
  # The write bit goes back with the read bit on purpose. ge adds a line to this
  # note every time an undo puts something back, and that write is best effort:
  # it fails quietly rather than hold up the undo. Handed back read only, the
  # note would be read and never added to again, and the toggle this whole file
  # exists to stop would come back on the undo after next, in silence.
  printf '      This hands the note back, to read and to keep.\n' >&2
  printf '      Do this, then run the same command again.\n' >&2
  printf '      → run: chmod u+rw %s\n' "$(ge_snap_quote "$gunr_f")" >&2
  return 0
}

ge_undo_was_done() {                    # <flat> <stamp>
  [ -n "$GE_UNDO_DONE" ] || return 1
  case "$GE_UNDO_NL$GE_UNDO_DONE$GE_UNDO_NL" in
    *"$GE_UNDO_NL$1 $2$GE_UNDO_NL"*) return 0 ;;
  esac
  return 1
}

# Best effort on purpose. A folder that will not take this line still gets its
# undo, it just gets the old toggle with it, and refusing the undo over a note
# to ourselves would be the worse trade. Capped, because it is appended to for
# as long as the folder exists and nothing else ever prunes it.
ge_undo_record() {                      # <home> <flat> <stamp>
  gur_f="$1/.state/undone"
  gur_keep=$(tail -n 99 "$gur_f" 2>/dev/null)
  # Not ": >": a failed redirect on a special built-in ends the whole shell under
  # dash, which is /bin/sh on most Linux. "true" is a regular built-in, and the
  # stderr redirect comes first so the shell's own complaint is not the answer.
  true 2>/dev/null > "$gur_f" || return 0
  [ -z "$gur_keep" ] || printf '%s\n' "$gur_keep" 2>/dev/null >> "$gur_f"
  printf '%s %s\n' "$2" "$3" 2>/dev/null >> "$gur_f"
  return 0
}

ge_undo_scan() {                        # <snapshot dir>, oldest first: "<stamp> <flat>"
  [ -d "$1" ] || return 0
  # ge_snap_names, not ls, because ls leaves out dot-prefixed names and every
  # backup of a .state file has one. Missing them made this say there was
  # nothing to undo while the backup of the founder's receipt sat right there.
  ge_snap_names "$1" | while IFS= read -r gus_name; do
    case $gus_name in
      *.*) ;;
      *) continue ;;
    esac
    gus_stamp=${gus_name##*.}
    gus_flat=${gus_name%.*}
    [ -n "$gus_flat" ] || continue
    ge_snap_is_stamp "$gus_stamp" || continue
    # A copy a previous undo left behind holds the state that undo replaced.
    # Offering it again is how undo became a toggle, so it is not a candidate.
    ge_undo_was_done "$gus_flat" "$gus_stamp" && continue
    printf '%s %s\n' "$gus_stamp" "$gus_flat"
  done | LC_ALL=C sort
}

ge_undo_main() {
  GE_SNAP_VERB=restore

  # ge undo takes no file name. It used to take one, ignore it, and put a
  # different file back while reporting success, which is a loss a founder has no
  # reason to go looking for. Every other verb reads its arguments, so a founder
  # guessing this shape is guessing the shape the rest of ge taught them.
  if [ $# -gt 0 ]; then
    gum_arg=$(printf '%s' "$1" | tr -d '\r')
    printf 'FAIL  ge undo does not take a file name.\n' >&2
    printf '      It puts back the most recent change ge made, whichever file that was.\n' >&2
    # The clause sits above the arrow. Everything after "→ run: " is pasted, so
    # ", to pick a backup of that one file" reached ge restore as eight more
    # arguments and the founder read a second refusal instead of a listing.
    printf '      ge restore picks a backup of one file you name.\n' >&2
    printf '      → run: ge restore %s\n' "$(ge_snap_quote "$gum_arg")" >&2
    return 1
  fi

  gum_home=$(ge_snap_home) || return 1

  # ASKED BEFORE THE RING IS LISTED, because the refusal further down reads an
  # empty listing as an empty folder. A folder ge cannot open lists as nothing at
  # all, so ge undo told a founder it had not changed any of their files while
  # three of their own changes sat backed up in that folder, and sent them to ge
  # check, which is the one part of ge that was already saying so. The shared
  # test and the shared refusal live in restore.sh, which this file sources.
  if ge_restore_ring_shut "$gum_home"; then
    ge_restore_ring_refusal "$gum_home" "whether there is anything to undo." >&2
    return 1
  fi

  ge_undo_load_done "$gum_home" || { ge_undo_note_refusal "$gum_home" "$?"; return 1; }

  gum_dir="$gum_home/.state/snapshots"
  gum_all=$(ge_undo_scan "$gum_dir")

  if [ -z "$gum_all" ]; then
    printf 'FAIL  there is nothing to undo. ge has not changed any of your files yet.\n' >&2
    printf '      ge check reads your folder and says what state it is in.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  fi

  gum_flats=$(printf '%s\n' "$gum_all" | while IFS=' ' read -r gum_s gum_f; do
    [ -n "$gum_f" ] && printf '%s\n' "$gum_f"
  done | LC_ALL=C sort -u)

  # No cutoff means date refused the arithmetic. Treat every file as recent, so
  # the command asks rather than choosing on a number it could not work out.
  gum_cut=$(ge_undo_cutoff)

  gum_recent=''
  gum_n=0
  gum_ifs=$IFS
  IFS=$GE_UNDO_NL
  set -f
  for gum_flat in $gum_flats; do
    # Oldest first, so the last one left standing is the newest that no previous
    # undo has already put back. IFS is already a newline here and pathname
    # expansion is already off, which is what makes the plain loop safe.
    gum_newest=''
    for gum_s in $(ge_snap_stamps "$gum_dir" "$gum_flat"); do
      ge_undo_was_done "$gum_flat" "$gum_s" && continue
      gum_newest=$gum_s
    done
    [ -n "$gum_newest" ] || continue
    if [ -n "$gum_cut" ] && ! ge_undo_at_or_after "$gum_newest" "$gum_cut"; then
      continue
    fi
    gum_recent="$gum_recent$gum_newest $gum_flat$GE_UNDO_NL"
    gum_n=$((gum_n + 1))
  done
  set +f
  IFS=$gum_ifs

  if [ "$gum_n" -gt 1 ]; then
    printf 'FAIL  %s of your files were changed in the last hour, so ge undo will not pick one.\n' "$gum_n" >&2
    printf '      These are the ones it could put back:\n' >&2
    # The column is measured, not fixed at 28. A prospect file named from a long
    # email address overran that, and one overrun row carries its own stamp out
    # of line while every row after it stays put, which reads as two lists. 50 is
    # where it stops: eight of indent, the name, a space and a twenty character
    # stamp is 79 columns, and a terminal is eighty.
    gum_w=28
    gum_ifs=$IFS
    IFS=$GE_UNDO_NL
    set -f
    for gum_line in $gum_recent; do
      [ -n "$gum_line" ] || continue
      gum_pt=$(ge_snap_unflat "${gum_line#* }")
      [ "${#gum_pt}" -le "$gum_w" ] || gum_w=${#gum_pt}
    done
    [ "$gum_w" -le 50 ] || gum_w=50

    # The line a founder can paste has to name the file that changed LAST. It
    # used to name the first row of the list, and the list is sorted by name, so
    # pasting it restored a file they were not thinking about and left them a
    # second change to unpick.
    #
    # Compared on the second only. The -002 on the end of a stamp is a tie break
    # between two backups of ONE file taken inside the same second, so reading it
    # as an order across two different files says the wrong one changed last.
    # Two files that share a second cannot be told apart at all, and the first
    # row is kept, which is at least the same answer every time. Both are on the
    # screen above either way.
    gum_best=''
    gum_best_sec=''
    for gum_line in $gum_recent; do
      [ -n "$gum_line" ] || continue
      gum_st=${gum_line%% *}
      gum_pt=$(ge_snap_unflat "${gum_line#* }")
      if [ "${#gum_pt}" -gt "$gum_w" ]; then
        # Past the stop, so the stamp goes underneath rather than off the side.
        printf '        %s\n          %s\n' "$gum_pt" "$gum_st" >&2
      else
        gum_pad=$gum_pt
        while [ "${#gum_pad}" -lt "$gum_w" ]; do gum_pad="$gum_pad "; done
        printf '        %s %s\n' "$gum_pad" "$gum_st" >&2
      fi
      gum_sec=${gum_st%%-*}
      if [ -z "$gum_best_sec" ] ||
         { [ "$gum_sec" != "$gum_best_sec" ] && ge_undo_at_or_after "$gum_sec" "$gum_best_sec"; }; then
        gum_best="$(ge_snap_quote "$gum_pt") $gum_st"
        gum_best_sec=$gum_sec
      fi
    done
    set +f
    IFS=$gum_ifs
    printf '      → run: ge restore %s\n' "$gum_best" >&2
    return 1
  fi

  if [ "$gum_n" -eq 1 ]; then
    gum_pick=${gum_recent%"$GE_UNDO_NL"}
  else
    # Nothing recent. The most recent change there is, whenever it was.
    gum_pick=$(printf '%s\n' "$gum_all" | sed -n '$p')
  fi

  gum_stamp=${gum_pick%% *}
  gum_flat=${gum_pick#* }
  gum_rel=$(ge_snap_unflat "$gum_flat")

  ge_restore_apply "$gum_home" "$gum_rel" "$gum_stamp" || return 1

  # The copy the restore just took holds the state this undo replaced, and it is
  # now the newest in the ring. Written down, so the next ge undo steps past it
  # to the change before instead of handing this one back. Empty means the file
  # was already the way the backup has it, so there was nothing to write down.
  [ -z "$GE_SNAP_LAST_STAMP" ] ||
    ge_undo_record "$gum_home" "$gum_flat" "$GE_SNAP_LAST_STAMP"
  return 0
}

ge_undo_main "$@"
