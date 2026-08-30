# index.sh: rebuild the derived status table at .state/index.md. Sourced by ge.sh.
#
# WHY IT EXISTS: a founder three weeks in has a dozen files and no way to see
#                which of them are real. Asking a skill to read the folder every
#                time gives a different answer each time. One table, rebuilt from
#                what is actually on disk, is what stops "I thought I had done
#                that" turning into a missed gate on the Friday.
# CALLED BY:     ge index, the last step of every skill write chain, ge check
# READS:         the founder's files, schemas/gates.md   WRITES: .state/index.md
# POSTURE:       fail-closed on every file and folder this table is built out of.
#                A file ge cannot stat is reported, never dropped, because a
#                dropped row reads as "you have not done that" and it is not
#                true. A file or a folder ge cannot READ is a different thing
#                again: it answers with nothing, and nothing is exactly what an
#                empty one answers with. So the rebuild stops and says which one
#                it was. A table recording none of a founder's prospects is worse
#                than no rebuild at all, because ge index then exits 0, says
#                where it wrote, and every reader of the table believes it.
#                No snapshot is taken: this file is derived and rebuildable, and
#                it is the only founder file that may be rewritten without one.
#                It is still not rewritten over a founder's own read only
#                setting: that is asked through the shared guard in lib/paths.sh
#                before the working file is made, and their permissions go
#                across onto the table that lands.
#                The one file it writes is .state/index.md. So a growth-engine
#                folder that has gone read only while .state has not is a rebuild
#                that really happened: it exits 0, names where it wrote, and
#                prints no recovery line, because nothing was refused. Whether
#                the folder around it can be written to is ge check's question,
#                and answering it here would be this verb reporting a fault it
#                did not hit.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. date -r for times, stat only
#                as a fallback and tried both flavours.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
# Every write here is claimed, then guarded, so a folder a sync client is holding
# read only answers with one sentence of ours and never with the shell's own line
# naming this file, the line number inside it and the working file beside theirs.
#
# THE TRACK LINE IS READ EXACTLY THE WAY ge lint READS IT. This file is the one
# that forks the list on it, so a header spelling this cannot see is a founder
# who is never shown two of their own gate C files, with a clean lint beside it
# saying the track is set. Change either reader and change both. ge lint's copy
# is gl_head_field in cmd/lint.sh.

# The files the programme gates on, in the order a founder builds them.
# Field 3 is the track that sees the row. A row marked "-" is seen by both.
# Rule 1 of the design: a founder never sees the other track's material, so a
# B2C founder is never shown outreach-sequence.md sitting there missing.
ge_index_rows() {
  cat <<'GE_INDEX_ROWS'
founder-brain.md|gate A|-
content-30.md|gate B|-
content-30.csv|gate B|-
rss-feeds.md|gate B|-
outreach-sequence.md|gate C|b2b
outreach-firstlines.csv|gate C|b2b
dm-openers.md|gate C|b2c
hook-bank.md|gate C|b2c
inbound-scripts.md|gate C|b2c
ops-workflow.md|gate C|-
90-day-plan.md|-|-
playbook-insert.md|-|-
ledger.md|-|-
memory.md|-|-
ops-log.md|-|-
GE_INDEX_ROWS
}

# ge_index_can_read <path>: 0 when ge can open that file and read it right now.
#
# TWO DIFFERENT QUESTIONS, AND BOTH ARE ASKED. The guard in ge_index_main asks
# [ -r ], because the chmod it hands the founder is the thing that changes the
# permission bits, and a line that clears exactly what was tested is the only
# kind worth printing. This asks the other one, at the moment of reading: can
# this file be opened. A file a sync client takes hold of in between answers yes
# to the first and no to this one, and a read that came back with nothing must
# never be written down as nothing.
#
# true, and never the colon builtin. A redirect that fails on a special built-in
# ends the whole shell under dash, which is /bin/sh on most of Linux, so the
# founder would get no message at all. true is an ordinary builtin and merely
# hands back a failure.
ge_index_can_read() {                   # <path>
  true 2>/dev/null < "$1"
}

# ge_index_dir_open <folder>: 0 when the folder can be listed and walked.
#
# Listing the names needs the read bit and reaching the files inside needs the
# search bit, and a folder with one and not the other walks halfway and says
# nothing. ge check and ge lint ask for both back in one chmod, so this asks for
# the same pair. Neither is refused on a machine where the bit means nothing, a
# run as root or a Windows drive under Git Bash, because on those the folder
# really can be walked and there is nothing to refuse.
ge_index_dir_open() {                   # <folder>
  [ -r "$1" ] && [ -x "$1" ]
}

# ge_index_gate <file> <default>: the gate label, from schemas/gates.md when that
# file carries a table row for this file, and from the built-in list otherwise.
# B-00 owns the schema and has not necessarily run, so the built-in is what makes
# this work today rather than after another task lands.
ge_index_gate() {
  gx_file=$1
  gx_default=$2
  gx_schema="$GE_HOME_DIR/schemas/gates.md"
  if [ -f "$gx_schema" ]; then
    gx_hit=$(tr -d '\r' < "$gx_schema" \
      | grep "^[[:space:]]*|[[:space:]]*$gx_file[[:space:]]*|" \
      | sed -n '1p' | cut -d'|' -f3 | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    [ -n "$gx_hit" ] && { printf '%s' "$gx_hit"; return 0; }
  fi
  printf '%s' "$gx_default"
}

# ge_index_status <path>: missing, empty or ok, or nothing at all and a failure
# when ge could not open the file. A file holding nothing but blank lines counts
# as empty, because that is what a founder means when they say the file is there
# but there is nothing in it.
#
# A FILE THAT WILL NOT OPEN IS NOT AN EMPTY FILE. awk reads nothing out of both
# of them, so this wrote down empty for a founder's thirty pieces sitting in a
# file their sync client had hold of for a minute, ge exited 0 and named the file
# it had written, and every skill reading the table counted the gate as unwritten
# from then on. There are three words this column is allowed to hold and none of
# them is true here, so nothing is printed and the caller stops. What a founder
# reads about it is written in ge_index_inputs, in words, with the chmod.
ge_index_status() {
  [ -e "$1" ] || { printf 'missing'; return 0; }
  ge_index_can_read "$1" || return 1
  if awk 'NF { found = 1 } END { exit found ? 0 : 1 }' "$1" 2>/dev/null; then
    printf 'ok'
  else
    printf 'empty'
  fi
}

# ge_index_bytes <path>: the byte count, with the padding wc adds removed.
ge_index_bytes() {
  gx_n=$(wc -c < "$1" 2>/dev/null | tr -d ' ')
  [ -n "$gx_n" ] && printf '%s' "$gx_n" || printf '%s' '-'
}

# ge_index_mtime <path>: when the file last changed, to the minute.
# date -r takes a filename on both flavours. The epoch fallback is there because
# an older BSD date takes seconds only, and a dash beats a wrong timestamp.
ge_index_mtime() {
  gx_m=$(date -r "$1" '+%Y-%m-%d %H:%M' 2>/dev/null)
  if [ -z "$gx_m" ]; then
    gx_s=$(stat -f %m "$1" 2>/dev/null) || gx_s=$(stat -c %Y "$1" 2>/dev/null) || gx_s=''
    case ${gx_s:-x} in
      *[!0-9]*|'') gx_s='' ;;
    esac
    [ -n "$gx_s" ] && gx_m=$(date -r "$gx_s" '+%Y-%m-%d %H:%M' 2>/dev/null)
  fi
  [ -n "$gx_m" ] && printf '%s' "$gx_m" || printf '%s' '-'
}

# ge_index_track <brain>: b2b, b2c or empty. Read above the first ## heading, so
# the word track appearing in the founder's own prose lower down cannot win.
#
# The label is read without case, so TRACK, Track and track are one thing, and
# only the part of the line in front of the first colon is treated as the label,
# so a sentence that merely mentions the word track is not read as the answer.
#
# READ EXACTLY THE WAY ge lint READS IT. This is the reader that forks the file
# list, so anything it cannot see, a founder never sees either. It used to match
# the label with one pattern that allowed a list dash and stars in front of the
# word but nothing after it, which meant "- **Track**: b2b" was read by lint and
# not by this. A B2B founder who wrote their Brain header in bold got an index
# with no outreach rows in it at all, and a clean lint saying the track was set,
# so nothing on screen suggested two gate C files were missing. The same went
# for a Brain that Notepad had saved with the invisible mark at the top of it.
#
# Read a line at a time rather than through one sed, because the mark comes off
# the first line only and the label needs tidying before it is compared. Nothing
# founder written is ever put into the sed programs below: they are fixed text.
ge_index_track() {
  [ -f "$1" ] || return 0
  gx_tr_one=1
  gx_tr_out=''
  while IFS= read -r gx_tr_l || [ -n "$gx_tr_l" ]; do
    gx_tr_l=$(printf '%s' "$gx_tr_l" | tr -d '\r')
    # The mark a Windows editor leaves sits at the very start of the file, so it
    # lands on the first line and only there, and a Brain written by hand can
    # carry a header field on that line.
    if [ "$gx_tr_one" -eq 1 ]; then gx_tr_l=${gx_tr_l#"$GE_BOM"}; gx_tr_one=0; fi
    case $gx_tr_l in '## '*) break ;; esac
    case $gx_tr_l in *:*) ;; *) continue ;; esac
    gx_tr_lab=$(printf '%s' "${gx_tr_l%%:*}" \
      | sed 's/^[-*#[:space:]]*//; s/[*[:space:]]*$//' \
      | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz')
    [ "$gx_tr_lab" = track ] || continue
    # The first run of letters and numbers after the colon, so the stars around
    # a bold value and any note written after it are left behind.
    gx_tr_out=$(printf '%s' "${gx_tr_l#*:}" \
      | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz' \
      | sed 's/^[^a-z0-9]*//; s/[^a-z0-9].*//')
    break
  # Guarded, because a Brain a sync client has locked would otherwise answer
  # with the shell's own line naming this file and the line number inside it,
  # and the table below it would still be built and still be right.
  done 2>/dev/null < "$1"
  printf '%s' "$gx_tr_out"
}

# ge_index_people <home>: the one directory row, a count and a newest stamp.
# Nothing per person is ever copied here. The enumeration is the sanctioned one:
# an empty people folder is the normal first state on all 130 machines, not a fault.
#
# THE FOLDER BEING THERE IS NOT THE SAME AS BEING READABLE, and this asked only
# the first of those. A folder whose contents cannot be listed answers
# people/*.md with nothing at all, and nothing at all is exactly what an empty
# folder answers with, which is what a sync client holding it for a moment looks
# like from in here. So the walk counted nobody, this row said "empty, 0 files"
# over a founder's prospects, ge exited 0 and printed where it had written. The
# founder then read "gate B or C: 0 of 1 file written" at the top of every
# session, and the doctor passed the same folder in the same second, because both
# of them read this table. ge person asks before it lists or exports, ge lint
# asks before it walks, and ge check calls the folder a failure. This was the one
# reader that never asked.
ge_index_people() {
  gx_dir="$1/people"
  if [ ! -d "$gx_dir" ]; then
    printf '| people/ | %s | missing | - | - |\n' "$(ge_index_gate 'people/' 'gate B or C')"
    return 0
  fi
  # The guard in ge_index_inputs asks this first, so the ordinary answer here is
  # a message naming the chmod rather than this line. Asked again, at the moment
  # of walking, because a sync client can take the folder in between, and a count
  # nobody could take must never be written down as a count of nobody.
  ge_index_dir_open "$gx_dir" || return 1
  gx_count=0
  gx_newest=0
  gx_newest_file=''
  for gx_f in "$gx_dir"/*.md; do
    # Two things are skipped by this, and neither of them ends the walk. The
    # pattern itself comes back unexpanded from a folder with no person files in
    # it, which is the normal first state. And a shortcut pointing at something
    # that is gone answers the same way. This used to break out of the loop on
    # either, so one dead shortcut early in the list left every person after it
    # uncounted, and the row read as a smaller folder than the founder has.
    [ -e "$gx_f" ] || continue
    case ${gx_f##*/} in README.md) continue ;; esac
    gx_count=$((gx_count + 1))
    gx_when=$(date -r "$gx_f" '+%s' 2>/dev/null)
    case ${gx_when:-x} in
      *[!0-9]*|'') gx_when=0 ;;
    esac
    if [ "$gx_when" -gt "$gx_newest" ]; then
      gx_newest=$gx_when
      gx_newest_file=$gx_f
    fi
  done
  if [ "$gx_count" -eq 0 ]; then
    printf '| people/ | %s | empty | 0 files | - |\n' "$(ge_index_gate 'people/' 'gate B or C')"
    return 0
  fi
  gx_stamp='-'
  [ -n "$gx_newest_file" ] && gx_stamp=$(ge_index_mtime "$gx_newest_file")
  gx_word=files
  [ "$gx_count" -eq 1 ] && gx_word=file
  printf '| people/ | %s | ok | %s %s | %s |\n' \
    "$(ge_index_gate 'people/' 'gate B or C')" "$gx_count" "$gx_word" "$gx_stamp"
}

ge_index_build() {
  gx_home=$1
  gx_brain="$gx_home/founder-brain.md"
  # A BRAIN THAT WILL NOT OPEN IS NOT A BRAIN WITH NO TRACK IN IT. The reader
  # below answers both with nothing, and nothing is read here as "no track yet",
  # which is the state that lists neither track's session 3 files. So a B2B
  # founder whose Brain was locked for a minute got a table with no outreach rows
  # in it at all, and nothing on the screen suggested two gate C files existed.
  # ge_index_inputs says this in words a founder can act on before anything is
  # built. Asked again here for the file taken hold of in between, and it stops
  # the rebuild rather than printing a table with one track's work missing.
  if [ -f "$gx_brain" ] && ! ge_index_can_read "$gx_brain"; then
    return 1
  fi
  gx_track=$(ge_index_track "$gx_brain")

  printf '# Index\n\n'
  printf 'Derived from your files by ge index, and rebuilt every time it runs.\n'
  printf 'Nothing here is worth editing. Change a file, then run ge index again.\n\n'
  printf '| file | gate | status | bytes | modified |\n'
  printf '|---|---|---|---|---|\n'

  ge_index_rows | while IFS='|' read -r gx_name gx_gate gx_for; do
    [ -n "$gx_name" ] || continue
    # The track fork. An unlocked brain has no track yet, so neither track's
    # session-3 files are listed. Showing both would show one founder the other
    # track's material, which is the one thing rule 1 forbids.
    case "$gx_for" in
      -) : ;;
      *) [ "$gx_for" = "$gx_track" ] || continue ;;
    esac
    gx_path="$gx_home/$gx_name"
    # Nothing is written down about a file that would not open. The whole
    # rebuild ends here instead, and the founder is told which file it was. The
    # loop runs in a shell of its own, being the end of a pipeline, so leaving it
    # is what hands the failure back to the line below.
    gx_st=$(ge_index_status "$gx_path") || exit 1
    if [ "$gx_st" = missing ]; then
      printf '| %s | %s | missing | - | - |\n' "$gx_name" "$(ge_index_gate "$gx_name" "$gx_gate")"
    else
      printf '| %s | %s | %s | %s | %s |\n' \
        "$gx_name" "$(ge_index_gate "$gx_name" "$gx_gate")" "$gx_st" \
        "$(ge_index_bytes "$gx_path")" "$(ge_index_mtime "$gx_path")"
    fi
  done || return 1

  ge_index_people "$gx_home"
}

# ge_index_inputs <home>: 0 when everything this table is read out of can be
# opened. Prints the one refusal on standard error and returns 1 when something
# cannot, and nothing has been built or written by then.
#
# WHY IT IS ASKED BEFORE A SINGLE ROW IS BUILT. Every reader in here answers a
# file or a folder it cannot open the same way it answers an empty one, with
# nothing, and this table is where the whole toolkit goes to find out what a
# founder has. So the one that matters is said in front, in the founder's words,
# with the command that hands the file back. Asked here, a refusal costs them
# nothing: no working file has been made and the table they already have is
# untouched.
#
# THREE GUARDS AND NEVER TWO OF THEM AT ONCE. Each names what it examined, and
# the line it ends on clears exactly that. The Brain comes first because it
# decides which rows the table carries at all, so ge cannot even say which files
# to look at until it has been read.
#
# [ -r ] and not an attempt to open. The command handed over is a chmod, which
# changes the permission bits, so the permission bits are what is tested. ge lint
# and ge check ask the same question the same way about the same files, and the
# three of them have to agree or a founder is told one thing by the doctor and
# another by the table.
ge_index_inputs() {                     # <home>
  gx_in_home=$1
  gx_in_brain="$gx_in_home/founder-brain.md"

  if [ -f "$gx_in_brain" ] && [ ! -r "$gx_in_brain" ]; then
    printf 'FAIL  founder-brain.md cannot be opened, so the index was not rebuilt.\n' >&2
    printf '      Your Brain says which track you are on, and this table lists a\n' >&2
    printf '      different set of files for each track. A table built now would\n' >&2
    printf '      leave out whichever of them are yours.\n' >&2
    printf '      What you wrote in it is still there, and the table you already have\n' >&2
    printf '      was left exactly as it was.\n' >&2
    # The command, and nothing else, on its own line. A founder selects the whole
    # line and pastes it, so what they need to know sits above it.
    printf '      This hands the file back. Then run ge index again.\n' >&2
    printf '      → run: chmod u+r %s\n' "$(ge_quote "$gx_in_brain")" >&2
    return 1
  fi

  # The same fork the table itself runs on, so this asks about the founder's own
  # files and never about the other track's. Naming a file a B2C founder is never
  # shown would be this refusal breaking rule 1 on its way to being helpful.
  gx_in_track=$(ge_index_track "$gx_in_brain")
  gx_in_shut=$(ge_index_rows | while IFS='|' read -r gx_in_n gx_in_g gx_in_for; do
    [ -n "$gx_in_n" ] || continue
    # The same fork the build runs, written as a test and not as a case, and that
    # is not a style choice. bash will not parse a case statement inside $( ),
    # and bash is /bin/sh on a Mac and the shell under Git Bash, so the two
    # families that most of the cohort is on read this file. dash parses it
    # happily, which is exactly how a line like that gets written and shipped.
    if [ "$gx_in_for" != "-" ] && [ "$gx_in_for" != "$gx_in_track" ]; then
      continue
    fi
    # A file that is not there is a row saying missing, which is true and is most
    # of this table on day one. Only a file that is there and will not open is
    # this question.
    [ -e "$gx_in_home/$gx_in_n" ] || continue
    [ -r "$gx_in_home/$gx_in_n" ] || printf '%s\n' "$gx_in_n"
  done)

  if [ -n "$gx_in_shut" ]; then
    # Every one of them, in one command. A chmod naming the first alone leaves
    # the founder reading this again about the second, and half a way out is what
    # makes somebody stop reading them.
    #
    # Same IFS and glob discipline as the walk in lib/paths.sh, and for the same
    # reasons: a name is pinned to the newline it was printed with, and a folder
    # or file named with a * or a ? must not be rewritten on the way through.
    gx_in_cmd=''
    gx_in_ifs=$IFS
    gx_in_noglob=''
    case $- in *f*) gx_in_noglob=1 ;; esac
    set -f
    IFS='
'
    for gx_in_f in $gx_in_shut; do
      [ -n "$gx_in_f" ] || continue
      gx_in_cmd="$gx_in_cmd $(ge_quote "$gx_in_home/$gx_in_f")"
    done
    IFS=$gx_in_ifs
    [ -n "$gx_in_noglob" ] || set +f

    # One file and several are worded apart all the way down. A founder looking
    # at one file name under a sentence about "them" reads it twice to work out
    # whether ge means something they cannot see.
    if [ "$(printf '%s\n' "$gx_in_shut" | grep -c .)" -eq 1 ]; then
      printf 'FAIL  ge could not open this file, so the index was not rebuilt:\n' >&2
      printf '%s\n' "$gx_in_shut" | sed '/^$/d; s/^/        /' >&2
      printf '      What you wrote in it is still there. A table built now would call it\n' >&2
      printf '      empty, and empty is what this table says about a file with nothing\n' >&2
      printf '      in it.\n' >&2
      printf '      The table you already have was left exactly as it was.\n' >&2
      printf '      This hands it back. Then run ge index again.\n' >&2
    else
      printf 'FAIL  ge could not open these files, so the index was not rebuilt:\n' >&2
      printf '%s\n' "$gx_in_shut" | sed '/^$/d; s/^/        /' >&2
      printf '      What you wrote in them is still there. A table built now would call\n' >&2
      printf '      them empty, and empty is what this table says about a file with\n' >&2
      printf '      nothing in it.\n' >&2
      printf '      The table you already have was left exactly as it was.\n' >&2
      printf '      This hands them back. Then run ge index again.\n' >&2
    fi
    printf '      → run: chmod u+r%s\n' "$gx_in_cmd" >&2
    return 1
  fi

  # The last row of the table, and the one that reads as a count of people. A
  # folder ge cannot list answers with nothing, an empty folder answers with
  # nothing, and only one of those is a founder with no prospects yet.
  gx_in_people="$gx_in_home/people"
  if [ -d "$gx_in_people" ] && ! ge_index_dir_open "$gx_in_people"; then
    printf 'FAIL  the people folder cannot be opened, so the index was not rebuilt.\n' >&2
    printf '      Everybody in it is still there. Nothing here can list them while it\n' >&2
    printf '      is shut, so a table built now would record none of them.\n' >&2
    printf '      The table you already have was left exactly as it was.\n' >&2
    printf '      This hands the folder back. Then run ge index again.\n' >&2
    printf '      → run: chmod u+rx %s\n' "$(ge_quote "$gx_in_people")" >&2
    return 1
  fi

  return 0
}

# ge_index_no_build <home>: the one refusal for a rebuild that started and did
# not finish. Written once, because two callers print it: a reader that stopped
# part way, and a working file that came out short.
#
# It names no cause, because ge has none to name. The guards above have already
# said everything ge could see in the way, so what is left is a folder that
# changed underneath the run, a disk with no room in it, or a file taken hold of
# between one line and the next. The doctor is what looks at the whole folder.
ge_index_no_build() {                   # <home>
  printf 'FAIL  could not build the index at %s/.state/index.md.\n' "$1" >&2
  printf '      Your files were not touched. Only the table was not rebuilt.\n' >&2
  printf '      This says whether the folder can be read and written to.\n' >&2
  printf '      → run: ge check\n' >&2
}

ge_index_main() {
  # ge index is the one read-mostly verb that writes a file, so a flag it does
  # not have is refused rather than ignored. A founder who types ge index
  # --strict and gets a clean table believes the flag did something.
  if [ $# -gt 0 ]; then
    printf 'FAIL  ge index takes no arguments, and it was given "%s".\n' "$1" >&2
    printf '      → run: ge index\n' >&2
    return 1
  fi

  gx_out=$(ge_find_home)
  gx_rc=$?
  # The shared refusal in lib/paths.sh, not one written here. "here or above
  # here" is not the search ge_find_home runs: it goes on to the home folder,
  # the Desktop, Documents and Downloads. The sentence about the index stays,
  # because it is this verb's own and it is the same one the scatter refusal
  # below carries.
  if [ "$gx_rc" -eq 1 ]; then
    ge_nofolder_refusal fail 'The index was not rebuilt.' >&2
    return 1
  fi
  if [ "$gx_rc" -eq 2 ]; then
    # The shared refusal in lib/paths.sh, not one written here. The line this
    # replaced said "cd into the one you want", which cannot clear it: the
    # search takes in the home folder, the Desktop, Documents and Downloads
    # whatever folder the founder is standing in, so the same refusal came back
    # from inside the folder it had just named. Renaming one does clear it, and
    # the shared refusal prints that as a command they can paste.
    ge_scatter_refusal "$gx_out" 'The index was not rebuilt.' >&2
    return 1
  fi
  gx_home=$(printf '%s\n' "$gx_out" | sed -n '1p')

  if [ ! -d "$gx_home/.state" ] && ! mkdir -p "$gx_home/.state" 2>/dev/null; then
    printf 'FAIL  could not create %s/.state.\n' "$gx_home" >&2
    # What the command does sits above it, never on the line itself. A founder
    # selects the whole line and pastes it, so "ge init, which creates the
    # folders the index needs" reaches ge as a verb called "init," and ge
    # answers that it has no such thing.
    printf '      This puts the folders the index needs back, and leaves your files alone.\n' >&2
    printf '      → run: ge init\n' >&2
    return 1
  fi

  # WHAT THE TABLE IS READ OUT OF, ASKED BEFORE ANY OF IT IS READ. Every reader
  # in this file answers a locked file the way it answers an empty one, so this
  # is the guard that keeps a rebuild from writing down "you have none of that"
  # about work that is sitting there. A refusal here costs the founder nothing:
  # no working file has been made yet and their old table is untouched.
  ge_index_inputs "$gx_home" || return 1

  # WHY THE GUARD IS HERE, ABOVE THE REBUILD. The move at the bottom puts a new
  # file in place of the old one, and a rename asks the FOLDER for permission,
  # never the file. So an index.md a founder had set to read only was replaced
  # anyway, ge printed the table and exited 0, and the read only bit was gone
  # afterwards, because the file that landed carries the working file's
  # permissions and not theirs. This table is derived, so nobody would miss the
  # content, but the setting is the founder's own decision and undoing it in
  # silence is its own fault. The guard lives in lib/paths.sh so ge index,
  # ge ledger, ge person and ge receipt all answer the same way about the same
  # file, and ge check can never call a file read only in the same second ge
  # wrote into it.
  #
  # Asked before the working file is made, so a refusal here leaves nothing
  # behind. An index that is not there yet is a yes, so a first rebuild is never
  # stopped by this. A disk with no room left is not this question and is still
  # answered by the claim below.
  if ! ge_may_replace "$gx_home/.state/index.md"; then
    ge_replace_refusal "$gx_home/.state/index.md" 'The index was not rebuilt.' >&2
    return 1
  fi

  # Temp file then move, so an interrupted rebuild never leaves half a table
  # where a skill is about to read a whole one.
  gx_tmp="$gx_home/.state/index.md.ge-tmp.$$"
  # Claim the temp file with touch, not with a redirection onto the colon
  # builtin: a redirection that fails on a special builtin ends the whole shell
  # under dash, and the founder would see no message at all.
  if ! touch "$gx_tmp" 2>/dev/null; then
    printf 'FAIL  could not write inside %s/.state, so the index was not rebuilt.\n' "$gx_home" >&2
    # A command, not a description. "Check the folder is not read only" is
    # something to go and do, and a founder who does not know how to do it has
    # nowhere to go from here. The path is quoted because a folder named after a
    # business usually carries a space, and an unquoted one splits in two.
    #
    # WHICH command is asked for rather than guessed at. This branch handed
    # every founder the same chmod, and on a full disk the permissions are
    # already right, so the one line they were given changed nothing and there
    # was no second door. A recovery line that does not recover is worse than
    # the fault it is answering.
    if [ ! -w "$gx_home/.state" ]; then
      printf '      That folder cannot be written to.\n' >&2
      printf '      Run this, then ge index again.\n' >&2
      printf '      → run: chmod u+w %s\n' "$(ge_quote "$gx_home/.state")" >&2
    else
      printf '      There is no room left to write in it.\n' >&2
      printf '      This shows how much space is left. Then ge index again.\n' >&2
      printf '      → run: df -h %s\n' "$(ge_quote "$gx_home")" >&2
    fi
    return 1
  fi
  # 2>/dev/null before the redirect, so the shell's own complaint about a file
  # it could not fill goes nowhere and the founder reads the sentence below.
  if ! ge_index_build "$gx_home" 2>/dev/null > "$gx_tmp"; then
    rm -f "$gx_tmp" 2>/dev/null
    ge_index_no_build "$gx_home"
    return 1
  fi

  # THE TABLE IS TAKEN OFF THE WORKING FILE, HERE, AND FOR TWO REASONS.
  #
  # The first is that this is where it is proved whole. A printf that runs out of
  # room on the disk hands back a failure, and only the last one in a function
  # decides what the function hands back, so a table that stopped in the middle
  # arrived here looking like a table that finished. It was then moved into
  # place, ge printed it and said where it had written, and a skill read a
  # founder's gates off half their files. The build ends on the people row every
  # single time, so a working file that does not is one that did not finish.
  #
  # The second is that what a founder sees is read before their own permissions
  # go onto the file and before it moves. A table they had set to owner write
  # only could not be read back afterwards, so the founder got the shell's own
  # complaint about sed above the line saying where ge had written. These are the
  # bytes that land, so showing them says the same thing and says it cleanly.
  gx_table=$(sed -n '/^| file |/,$p' "$gx_tmp" 2>/dev/null)
  case $(printf '%s\n' "$gx_table" | sed -n '$p') in
    '| people/ |'*) : ;;
    *)
      rm -f "$gx_tmp" 2>/dev/null
      ge_index_no_build "$gx_home"
      return 1 ;;
  esac

  # The founder's own permissions go across first. The file that lands is one ge
  # built, so without this it arrives carrying whatever the umask gave it, and a
  # table somebody had set to owner only came back readable by everybody while
  # ge printed it and said where it had written.
  ge_keep_mode "$gx_home/.state/index.md" "$gx_tmp"
  # 2>/dev/null and a tidy up, because a target file a founder has locked
  # otherwise answers with a raw rename line naming the working file, ahead of
  # the sentence written for them, and then leaves that file in the .state
  # folder for good.
  if ! mv "$gx_tmp" "$gx_home/.state/index.md" 2>/dev/null; then
    rm -f "$gx_tmp" 2>/dev/null
    printf 'FAIL  could not replace %s/.state/index.md, so the table is the one from last time.\n' "$gx_home" >&2
    printf '      This says whether the folder can be written to.\n' >&2
    printf '      → run: ge check\n' >&2
    return 1
  fi

  # Read off the working file above, before it moved, and printed only now that
  # it has landed. Nothing is said about a write until the write has happened.
  printf '%s\n' "$gx_table"
  printf '\nWritten to %s/.state/index.md\n' "$gx_home"
}

ge_index_main "$@"
