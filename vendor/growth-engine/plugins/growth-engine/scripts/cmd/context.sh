# context.sh: the fifteen lines a session opens with. Sourced by ge.sh.
#
# WHY IT EXISTS: five weeks pass between sessions and none of the last one is in
#                the window. Without this the founder re-explains where they are,
#                or worse, works in the wrong folder for an hour. It is also the
#                one thing a hook runs unattended, so it can never be the reason
#                a session will not start: for a hook, no folder means silence
#                and exit 0, not an error the founder has to get past.
# CALLED BY:     ge context, hooks/hooks.json SessionStart, the status skill
# READS:         .state/HOME, .state/index.md, .state/receipt.md,
#                founder-brain.md, memory.md
# WRITES:        nothing, ever. It is the one read-only subcommand
# POSTURE:       fail-open. Nothing it says may claim more than the file it read
#                proves, and where it cannot read a file it says which line it
#                has left out and why. Leaving one out in silence is the same
#                promise broken the other way round: the gate counts vanishing
#                without a word reads as "you have written nothing", which is a
#                different thing from "nothing here counted"
# RECOVERY LINES: everything after the arrow is one command a founder can select,
#                paste and run, with no English clause riding on the end of it.
#                Pasted whole, "ge context, or ge context --hook from a hook" is
#                ge context with four arguments, which is the refusal that
#                printed the line, so a founder following it went round for ever
# EXIT STATUS:   --hook is 0 whatever happens, and that is the whole reason the
#                flag exists: a hook runs before the founder has typed anything
#                and must never be why a session will not start. Typed by a
#                person the status is the ordinary one. Having no folder yet is
#                not a fault, so that stays 0 and prints no FAIL. More than one
#                folder IS a refusal: ge has declined to say which folder is
#                theirs, and the thirteen other verbs answer that with 1.
#                It used to print the FAIL banner and hand back 0, so a skill or
#                a hook reading the status alone read a scattered folder as a
#                healthy one, which is the one thing this file exists to catch.
#                The banner and the status now say the same thing. Do not put
#                the 0 back on the typed path without changing the banner too.
#                The refusal stays on standard output, like everything else here,
#                so a session hook keeps saying all of it on one stream.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. BSD+GNU date via lib/date_compat.sh.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").

GE_CTX_MAX=15
GE_CTX_LINES=''
GE_CTX_N=0
GE_CTX_HOME=''
GE_CTX_HOOK=no
GE_CTX_GONE=''

# Two numbers per candidate line: where it reads, and what it is worth. They are
# different orders. The anchor verdict and the Flags outrank everything, because
# a founder in the wrong folder needs that before they need the gate counts, but
# the anchor still reads first and the memory lines still read last.
ge_ctx_add() {
  GE_CTX_N=$((GE_CTX_N + 1))
  GE_CTX_LINES="${GE_CTX_LINES}$(printf '%04d %04d %s' "$GE_CTX_N" "$1" "$2")
"
}

# The first line of every session, so a sentence that is wrong here is wrong in
# front of the founder more often than any other line in the toolkit.
#
# The two names are resolved before they are compared. A Mac reaches /tmp/x as
# /private/tmp/x, and a founder working through an alias or a mapped drive
# reaches one folder by two names, so comparing the text opened every session
# with "Wrong folder" about the folder they were already in. Nothing was wrong,
# so nothing they did made it stop.
ge_ctx_anchor() {
  ge_ctx_hf="$GE_CTX_HOME/.state/HOME"
  # Asked before the file is read, and this is the one line in this file that
  # reached a founder as raw shell output. The read below does not guard its
  # error, so an anchor a sync client had shut put the shell's own complaint at
  # the very top of the session, naming a file inside this toolkit and the line
  # number inside it, which is the one thing no founder may ever be shown. Under
  # dash it named two of them.
  #
  # It left the reading empty as well, and empty is read four lines down as "the
  # anchor agrees", so the session then opened on the ordinary folder line: the
  # single sentence that says you are working in the right place, printed from a
  # file that nothing could open. ge check says this on its own anchor leg and
  # names the same command.
  if [ ! -r "$ge_ctx_hf" ]; then
    ge_ctx_add 1 "This folder is at $GE_CTX_HOME. The file recording where your work was made cannot be opened, so nothing here can tell this folder from a copy of it."
    ge_ctx_add 2 "→ run: chmod u+r $(ge_quote "$ge_ctx_hf")"
    return 0
  fi
  # Guarded as well as asked about, because the answer to the question above can
  # change between the test and the read, and because a name that is neither a
  # readable file nor an unreadable one still has to leave this file silent.
  ge_ctx_said=$(ge_anchor "$GE_CTX_HOME" 2>/dev/null)
  if [ -n "$ge_ctx_said" ] && ! ge_same_dir "$ge_ctx_said" "$GE_CTX_HOME"; then
    # Whether anything is at that path is asked before it is named as the place
    # the work is. The anchor proves what the file says, and nothing more: a
    # founder who dragged the folder to the Desktop was told their work was
    # still in Downloads, where there was by then nothing at all, and the one
    # thing they could act on was a path that no longer opened.
    if [ -d "$ge_ctx_said" ]; then
      ge_ctx_add 1 "Wrong folder. Your work is at $ge_ctx_said, this one is at $GE_CTX_HOME."
    else
      # "no folder there" rather than "nothing there", because a file can be
      # sitting at that path and the sentence has to be true either way.
      ge_ctx_add 1 "Wrong folder. This one says your work is at $ge_ctx_said, and there is no folder there now, so it has been moved or renamed."
    fi
    ge_ctx_add 2 "→ run: ge check"
    return 0
  fi
  ge_ctx_add 1 "Working folder: $GE_CTX_HOME"
}

# The files the index counts as written that are not in the folder any more, one
# a line. A row already marked missing is the index telling the truth.
ge_ctx_missing() {                      # <index file>
  tr -d '\r' 2>/dev/null < "$1" | awk -F'|' '
    NF > 4 {
      f = $2; s = $4
      gsub(/^ +| +$/, "", f)
      gsub(/^ +| +$/, "", s)
      if (f == "" || f == "file") next
      if (f ~ /^-+$/) next
      if (s != "ok" && s != "empty") next
      print f
    }
  ' | while IFS= read -r ge_ctx_row; do
    [ -n "$ge_ctx_row" ] || continue
    [ -e "$GE_CTX_HOME/$ge_ctx_row" ] || printf '%s\n' "$ge_ctx_row"
  done
}

# The files the table has a row for that have changed since it was built, and
# the ones it calls missing that are in the folder now. Either way the counts
# below were worked out from something that is no longer what is on disk.
#
# One question, asked of the same rows the counting reads, so this cannot drift
# from what the gate lines are made of. find -newer and not test -nt, because
# -nt is not in POSIX test and Git Bash is the floor. Rows whose file is absent
# both in the table and in the folder are the table telling the truth and are
# not staleness, and a row the table calls written whose file has since gone is
# not staleness either: that one is taken off the count by GE_CTX_GONE below and
# said out loud on its own line.
#
# One letter, a space, then the row's file name, so the two come back down the
# pipe together without a second field separator to argue about. A file name can
# carry a space and the split below keeps it whole.
ge_ctx_stale() {                        # <index file>
  tr -d '\r' 2>/dev/null < "$1" | awk -F'|' '
    NF > 4 {
      f = $2; s = $4
      gsub(/^ +| +$/, "", f)
      gsub(/^ +| +$/, "", s)
      if (f == "" || f == "file") next
      if (f ~ /^-+$/) next
      if (f ~ /\/$/) next
      print (s == "missing" ? "m " : "h ") f
    }
  ' | while IFS= read -r ge_ctx_row; do
    ge_ctx_rf=${ge_ctx_row#* }
    [ -n "$ge_ctx_rf" ] || continue
    case $ge_ctx_row in
      # The table says the file is not there and it is. That is a founder who
      # has written the thing and not rebuilt the table, which is the case this
      # whole function exists for.
      'm '*) [ -e "$GE_CTX_HOME/$ge_ctx_rf" ] && printf 'x\n' ;;
      *)
        [ -f "$GE_CTX_HOME/$ge_ctx_rf" ] || continue
        [ -n "$(find "$GE_CTX_HOME/$ge_ctx_rf" -newer "$1" 2>/dev/null)" ] && printf 'x\n' ;;
    esac
    # Nothing stops early on the first hit. Closing this pipe part way makes awk
    # write into a pipe nobody is reading, and awk's own complaint about that
    # would land in the middle of a founder's session summary.
    continue
  done
}

ge_ctx_gates() {
  ge_ctx_idx="$GE_CTX_HOME/.state/index.md"

  # Said, rather than left out. A founder with no table, or one nothing can
  # open, used to get a session that opened with the folder and then simply
  # stopped: no gate lines, and nothing at all to say why they had gone. Read as
  # silence that is "you have written nothing", which is a different thing from
  # "nothing here counted".
  #
  # A folder sitting on the name of the table reads to -f exactly as a table that
  # was never built does, and this said the second sentence about both and handed
  # over ge index. ge index cannot write a file where a folder already is: it
  # reports "Written to" and hands back success without having written anything,
  # so the founder pasted the line, was told it worked, opened the next session
  # and read the identical sentence, for ever. Told apart the way ge check tells
  # them apart, and answered with the same command it uses, which deletes nothing
  # and so leaves putting the name back one more paste.
  if [ -d "$ge_ctx_idx" ]; then
    ge_ctx_add 295 "There is a folder where the table of your files belongs, so this cannot count your gates."
    ge_ctx_add 296 "→ run: mv $(ge_quote "$ge_ctx_idx") $(ge_quote "$ge_ctx_idx-old")"
    return 0
  fi
  # A table that is there and will not open is told apart from one that was
  # never built. They take the same command and they are not the same fact, and
  # a founder who has run ge index every week reads "none has been built yet"
  # as ge having lost the lot.
  if [ ! -f "$ge_ctx_idx" ]; then
    ge_ctx_add 295 "No table of your files has been built yet, so this cannot count your gates."
    ge_ctx_add 296 "→ run: ge index"
    return 0
  fi
  if [ ! -r "$ge_ctx_idx" ]; then
    ge_ctx_add 295 "The table of your files cannot be opened, so this cannot count your gates."
    ge_ctx_add 296 "→ run: ge index"
    return 0
  fi

  # The counts below are read off a table, and a table is only as true as the
  # day it was built on. A founder who had written their Brain and their thirty
  # pieces and had not run ge index opened every session on "gate A: 0 of 1 file
  # written", which is false, and the gate label forks on the track column of
  # that same table, so a stale one also gives the wrong track and the wrong
  # gate C denominator. Nothing said a word about it.
  #
  # The numbers are not printed at all when the table is out of date. A wrong
  # number at the top of a session is worse than no number: it is read, believed
  # and acted on, where a missing one sends the founder to the line below it.
  if [ -n "$(ge_ctx_stale "$ge_ctx_idx")" ]; then
    ge_ctx_add 295 "Your files have changed since the table of them was built, so the gate counts would be wrong and are left out."
    ge_ctx_add 296 "→ run: ge index"
    return 0
  fi

  # Worked out before the counting, because a file the index still calls written
  # that somebody has since removed used to be counted as done. A founder whose
  # Brain a sync client took away opened a session and was told the gate was
  # complete. Handed to awk through the environment, never through -v, which
  # would read a backslash in a file name as an escape.
  GE_CTX_GONE=$(ge_ctx_missing "$ge_ctx_idx" | sed '/^$/d')
  export GE_CTX_GONE

  # "written" and not "ready": what the index proves is that the file is there
  # and has something in it. Whether the words in it are any good is a thing no
  # table can know, and a founder told a gate was ready stops looking at it.
  ge_ctx_g=$(tr -d '\r' 2>/dev/null < "$ge_ctx_idx" | awk -F'|' '
    BEGIN { gone = "\n" ENVIRON["GE_CTX_GONE"] "\n" }
    NF > 4 {
      f = $2; g = $3; s = $4
      gsub(/^ +| +$/, "", f)
      gsub(/^ +| +$/, "", g)
      gsub(/^ +| +$/, "", s)
      if (g == "" || g == "gate") next
      if (g ~ /^-+$/) next
      if (!(g in tot)) { n = n + 1; order[n] = g }
      tot[g] = tot[g] + 1
      if (s == "ok" && index(gone, "\n" f "\n") == 0) done[g] = done[g] + 1
    }
    END {
      for (i = 1; i <= n; i = i + 1)
        printf "%s: %d of %d %s written\n", order[i], done[order[i]] + 0, tot[order[i]],
               (tot[order[i]] == 1 ? "file" : "files")
    }
  ')
  ge_ctx_g=$(printf '%s\n' "$ge_ctx_g" | sed '/^$/d')
  # Said, rather than left out, and this is the last way the gate lines could go
  # missing without a word. A table that is there, opens, and holds no rows
  # answers every question above with nothing: no file it lists is missing, none
  # of them has changed since it was built, and no gate comes out of it. The
  # founder's session then opened on the folder, their flags, and no gate counts
  # at all, which reads as having written nothing. ge init writes a row for every
  # file the programme expects before any of them exists, so a table with no rows
  # in it is a save that stopped part way or a file somebody cut, and rebuilding
  # it is the same one command the three branches above name.
  if [ -z "$ge_ctx_g" ]; then
    ge_ctx_add 295 "The table of your files lists nothing, so this cannot count your gates."
    ge_ctx_add 296 "→ run: ge index"
  fi
  if [ -n "$ge_ctx_g" ]; then
    ge_ctx_gn=$(printf '%s\n' "$ge_ctx_g" | grep -c '')
    ge_ctx_i=1
    while [ "$ge_ctx_i" -le "$ge_ctx_gn" ]; do
      # The first three gate lines sit above the memory lines. Any beyond that
      # drop below them, so a long index cannot push out the newest decision.
      if [ "$ge_ctx_i" -le 3 ]; then
        ge_ctx_rank=$((299 + ge_ctx_i))
      else
        ge_ctx_rank=$((700 + ge_ctx_i))
      fi
      ge_ctx_add "$ge_ctx_rank" "$(printf '%s\n' "$ge_ctx_g" | sed -n "${ge_ctx_i}p")"
      ge_ctx_i=$((ge_ctx_i + 1))
    done
  fi

  # Said out loud as well as taken off the count. A lower number on its own is
  # not something a founder notices, and this is their own work going missing.
  [ -n "$GE_CTX_GONE" ] || return 0
  ge_ctx_mn=$(printf '%s' "$GE_CTX_GONE" | grep -c '')
  ge_ctx_names=$(printf '%s\n' "$GE_CTX_GONE" | sed -n '1,2p' | tr '\n' ' ' | sed 's/  *$//')
  if [ "$ge_ctx_mn" -eq 1 ]; then
    ge_ctx_add 210 "$ge_ctx_names is counted as written and is not in your folder now."
  else
    ge_ctx_add 210 "$ge_ctx_mn of your files are counted as written and are not in the folder now: $ge_ctx_names"
  fi
  ge_ctx_add 211 "→ run: ge check"
  return 0
}

# Only bullets count. The template sentence under the heading is guidance, not a
# flag, and surfacing it every session would train founders to ignore the line.
ge_ctx_flags() {
  ge_ctx_brain="$GE_CTX_HOME/founder-brain.md"
  [ -f "$ge_ctx_brain" ] || return 0
  # Said, rather than left out. The read below throws its error away, so a Brain
  # that is there and will not open came back as no flags at all and every Flag
  # line simply stopped appearing, with nothing to say why. A founder reads that
  # as having no flags, which is the opposite of what happened: they have flags
  # and nothing here could see them. The gate lines were repaired for exactly
  # this and the flags were left as they were.
  if [ ! -r "$ge_ctx_brain" ]; then
    ge_ctx_add 108 "founder-brain.md cannot be opened, so any flags you wrote in it are left out of this."
    ge_ctx_add 109 "→ run: chmod u+r $(ge_quote "$ge_ctx_brain")"
    return 0
  fi
  ge_ctx_f=$(tr -d '\r' 2>/dev/null < "$ge_ctx_brain" | awk '
    /^## / { inflags = ($0 ~ /^## Flags/) ? 1 : 0; next }
    inflags == 1 {
      line = $0
      if (line !~ /^[-*] /) next
      if (line ~ /^[-*] \[x\]/) next
      if (tolower(line) ~ /resolved/) next
      sub(/^[-*] +/, "", line)
      if (line != "") print line
    }
  ')
  ge_ctx_f=$(printf '%s\n' "$ge_ctx_f" | sed '/^$/d')
  [ -n "$ge_ctx_f" ] || return 0
  ge_ctx_fn=$(printf '%s\n' "$ge_ctx_f" | grep -c '')
  ge_ctx_i=1
  while [ "$ge_ctx_i" -le "$ge_ctx_fn" ] && [ "$ge_ctx_i" -le 6 ]; do
    ge_ctx_add $((100 + ge_ctx_i)) "Flag: $(printf '%s\n' "$ge_ctx_f" | sed -n "${ge_ctx_i}p")"
    ge_ctx_i=$((ge_ctx_i + 1))
  done
  # Never drop a flag silently. The seventh line accounts for the rest.
  [ "$ge_ctx_fn" -gt 6 ] && ge_ctx_add 107 "Flag: and $((ge_ctx_fn - 6)) more in founder-brain.md"
  return 0
}

ge_ctx_token() {
  ge_ctx_r="$GE_CTX_HOME/.state/receipt.md"
  [ -f "$ge_ctx_r" ] || return 0

  # Said, rather than left out. Both reads below throw their errors away, so a
  # receipt that is there and will not open came back as no recorded failure and
  # no day, and every line about the GoHighLevel token stopped appearing. That
  # includes the one saying the token has already stopped working, which is the
  # sharpest line this file prints. ge check says the same thing on its own token
  # leg rather than passing over it.
  if [ ! -r "$ge_ctx_r" ]; then
    ge_ctx_add 202 "The record of your setup cannot be opened, so nothing here can say when your GoHighLevel token runs out."
    ge_ctx_add 203 "→ run: chmod u+r $(ge_quote "$ge_ctx_r")"
    return 0
  fi

  # A recorded failure outranks the age. A token the setup checks could not use
  # is already broken whatever day it was made on, and until now the one place
  # that verdict was ever shown was ge receipt show.
  ge_ctx_bad=$(tr -d '\r' 2>/dev/null < "$ge_ctx_r" | awk '$1 == "token" && $2 == "FAIL" { print "yes"; exit }')
  if [ -n "$ge_ctx_bad" ]; then
    ge_ctx_add 198 "Your setup recorded the GoHighLevel token as failing."
    ge_ctx_add 199 "→ take the doctor step next"
  fi

  ge_ctx_pit=$(tr -d '\r' 2>/dev/null < "$ge_ctx_r" | sed -n 's/^pit_created  *//p' | sed -n '1p' | sed 's/  *$//')
  [ -n "$ge_ctx_pit" ] || return 0
  ge_ctx_pe=$(iso_to_epoch "$ge_ctx_pit")
  [ -n "$ge_ctx_pe" ] || return 0
  ge_ctx_now=$(now_epoch)
  ge_ctx_age=$(( (ge_ctx_now - ge_ctx_pe) / 86400 ))

  # A day that has not happened yet is a mistyped year, and while it stands the
  # 90 day warning can never fire. Silence about that is silence about the one
  # thing this line exists for.
  if [ "$ge_ctx_age" -lt 0 ]; then
    ge_ctx_add 200 "The day recorded for your GoHighLevel token is $ge_ctx_pit, which has not happened yet."
    ge_ctx_add 201 "→ run: ge receipt set pit-created <the day you really made it>"
    return 0
  fi

  [ "$ge_ctx_age" -gt 80 ] || return 0
  # Past 90 this used to read "Nothing is broken yet", which is the opposite of
  # the truth and is read at the start of every session.
  if [ "$ge_ctx_age" -gt 90 ]; then
    ge_ctx_add 200 "Your GoHighLevel token is $ge_ctx_age days old. They stop working at 90, so this one has stopped."
  else
    ge_ctx_add 200 "Your GoHighLevel token is $ge_ctx_age days old. Nothing is broken yet, they stop working at 90."
  fi
  ge_ctx_add 201 "→ take the doctor step next"
  return 0
}

ge_ctx_entry() {
  printf '%s' "${1#- }"
}

ge_ctx_memory() {
  ge_ctx_mem="$GE_CTX_HOME/memory.md"
  [ -f "$ge_ctx_mem" ] || return 0
  # Said, rather than left out. block_read below is read with its error thrown
  # away, so a memory file that is there and will not open came back empty and
  # the last decision and the open thread stopped appearing, with nothing to say
  # why. Five weeks pass between sessions: a founder reads that as ge having kept
  # nothing, which is a worse thing to believe than the truth.
  if [ ! -r "$ge_ctx_mem" ]; then
    ge_ctx_add 402 "memory.md cannot be opened, so your last decision and your open thread are left out of this."
    ge_ctx_add 403 "→ run: chmod u+r $(ge_quote "$ge_ctx_mem")"
    return 0
  fi
  # Entries are appended oldest first, so the last line in a block is the newest.
  ge_ctx_dec=$(block_read "$ge_ctx_mem" DECISIONS 2>/dev/null | sed '/^$/d' | sed -n '$p')
  [ -n "$ge_ctx_dec" ] && ge_ctx_add 400 "Last decision: $(ge_ctx_entry "$ge_ctx_dec")"
  ge_ctx_thr=$(block_read "$ge_ctx_mem" THREADS 2>/dev/null | sed '/^$/d' | sed -n '$p')
  [ -n "$ge_ctx_thr" ] && ge_ctx_add 401 "Open thread: $(ge_ctx_entry "$ge_ctx_thr")"
  return 0
}

# Keep by worth, print by position. Anything past the ceiling is dropped, and
# what is dropped is always the least useful thing, never the last thing added.
ge_ctx_print() {
  [ -n "$GE_CTX_LINES" ] || return 0
  # Handed over through the environment, not through awk -v. awk -v reads escape
  # sequences in the value it is given, and a value going into awk that way is
  # what emptied founders' memory.md while reporting that it had been saved. The
  # ceiling is a plain number set at the top of this file, so nothing is at risk
  # today; the point is that the rule holds everywhere, so widening this variable
  # later cannot quietly reintroduce that.
  export GE_CTX_MAX
  printf '%s' "$GE_CTX_LINES" | awk '
    BEGIN { max = ENVIRON["GE_CTX_MAX"] + 0 }
    {
      d = substr($0, 1, 4) + 0
      p = substr($0, 6, 4) + 0
      text[d] = substr($0, 11)
      slot[p] = d
      if (d > maxd) maxd = d
      if (p > maxp) maxp = p
    }
    END {
      kept = 0
      for (i = 1; i <= maxp; i = i + 1)
        if (i in slot && kept < max) { keep[slot[i]] = 1; kept = kept + 1 }
      for (i = 1; i <= maxd; i = i + 1)
        if (i in keep) print text[i]
    }
  '
}

ge_ctx_main() {
  # Two passes. The harness decides the order it hands arguments over, so a
  # single pass would make the complaint depend on whether --hook came first,
  # and a hook that wedges the session over its own argument order is the one
  # thing this file exists to prevent.
  for ge_ctx_a in "$@"; do
    case "$ge_ctx_a" in
      --hook) GE_CTX_HOOK=yes ;;
    esac
  done
  for ge_ctx_a in "$@"; do
    case "$ge_ctx_a" in
      --hook) ;;
      *)
        # A hook passes whatever the harness gives it and must never wedge the
        # session over it. A person typing it deserves to be told.
        [ "$GE_CTX_HOOK" = yes ] && continue
        printf 'FAIL  ge context does not take "%s".\n' "$ge_ctx_a" >&2
        printf '      → run: ge context\n' >&2
        return 1 ;;
    esac
  done

  ge_ctx_home_list=$(ge_find_home 2>/dev/null)
  ge_ctx_rc=$?

  # Fail-open, and this is the whole reason the flag exists. A hook runs before
  # the founder has typed anything, and having no folder yet is the normal state
  # before ge init rather than a fault, so a hook gets silence and exit 0.
  #
  # A person who typed the command asked a question, so they get an answer. A
  # blank line and success reads as "nothing to report", which is the opposite
  # of what happened.
  #
  # The words are the shared ones from lib/paths.sh, so this says what the other
  # twelve verbs say about the same state. It asks for the plain reading rather
  # than the FAIL one: a founder who has not run ge init yet has no folder, and
  # that is the ordinary state at the start of the programme rather than a
  # fault. The status stays 0 for the same reason.
  if [ "$ge_ctx_rc" -eq 1 ]; then
    [ "$GE_CTX_HOOK" = yes ] && return 0
    ge_nofolder_refusal plain
    return 0
  fi

  # The shared refusal, so this says what every other verb says, and so the one
  # move that always clears it is the one named. It used to send the founder to
  # run ge check from inside the folder they wanted, which is where they were
  # already standing, and the same lines came back every session.
  #
  # The status says the same thing the banner says. A hook keeps its 0, because
  # it must never be the reason a session will not start, and it has the banner
  # in front of the founder either way. A person who typed it gets the 1 that a
  # printed refusal means everywhere else in ge: something branching on the
  # status alone read this state as a folder with nothing wrong with it.
  if [ "$ge_ctx_rc" -eq 2 ]; then
    ge_scatter_refusal "$ge_ctx_home_list"
    [ "$GE_CTX_HOOK" = yes ] && return 0
    return 1
  fi

  GE_CTX_HOME=$ge_ctx_home_list
  ge_ctx_anchor
  ge_ctx_gates
  ge_ctx_flags
  ge_ctx_token
  ge_ctx_memory
  ge_ctx_print
  return 0
}

ge_ctx_main "$@"
