# check.sh: the doctor. One line per check: the verdict, the evidence, the fix. Sourced by ge.sh.
#
# WHY IT EXISTS: a folder that is quietly broken looks exactly like a folder
#                that is fine, right up to the session where a skill writes into
#                the wrong place or refuses to run. Every leg here proves its
#                claim from something on disk and prints what it saw, so a
#                founder can tell the difference themselves instead of taking
#                a green tick on trust.
# CALLED BY:     ge check, the setup skill, humans before a session
# READS:         growth-engine/, .state/HOME, .state/index.md, .state/log.bytes,
#                .state/snapshots/, .state/receipt.md, ops-log.md, people/,
#                and the founder files ge writes into: memory.md, ledger.md,
#                dm-openers.md and every people/*.md
# WRITES:        one canary file in growth-engine/, in .state/, in people/ and in
#                the backup folder, each read back where it can be and each
#                removed again in the same run. A folder that will not let one go
#                is said out loud rather than passed over, because the file left
#                behind is named after a process id and the founder cannot tell
#                whose it is. Also removes any working copy of ge's own that a
#                save which stopped part way left behind
# POSTURE:       fail-closed. No folder is a FAIL with a fix, never a silent pass.
#                Every line goes to stdout so the whole report can be copied in one go
# VERDICTS:      FAIL is something broken. NOTE is true and worth a look but
#                nothing is broken by it, and it never turns the report red. A
#                doctor that went red every time a founder wrote a file trained
#                them to skip the legs that matter. SKIP is a question this leg
#                could not answer, either because there is nothing to check yet
#                or because another leg names the same fault and the command
#                that clears it. The dividing line for FAIL is whether a write is
#                refused. What ge lint reports is warn only by design and is a
#                NOTE, and this file does not describe those warnings for the
#                linter: some of them are about the shape of a file and some are
#                about what is in one, and calling the second sort cosmetic is
#                how a founder leaves somebody they stopped on the outreach
#                sheet. Three things stop every write into a file for ever, and
#                those are a FAIL, because the closing line reads "Nothing is
#                broken" off the failure count and would otherwise say it over a
#                file that nothing can ever write to again
# RECOVERY LINES: two forms, and the difference is the whole point.
#                "→ run: " means everything after it is ONE command a founder can
#                select, paste and run. Nothing else goes on that line: an
#                English clause after the command is pasted with it, so "ge init,
#                from here" becomes a command called "init," and ge answers that
#                it has no such thing. A plain "→ " means the line is an
#                instruction and not a command, so nobody pastes it expecting it
#                to run. Where a fault is cleared by something outside a shell,
#                closing a sync client or freeing a disk, that instruction goes
#                in the leg's own sentence and the arrow carries the command that
#                shows the founder where they stand. Every path in one goes
#                through ge_quote, because half the folders in this programme are
#                named after a business and carry a space. And a line has to
#                CLEAR the thing it was printed for: naming a command that
#                refuses leaves the founder running the doctor, running the line,
#                and reading the same line again, for ever. So a leg that names
#                one asks first whether it will work, and picks by the answer
# PORTABILITY:   POSIX sh. No bash/python/node/jq. BSD+GNU date via lib/date_compat.sh.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").

GE_CK_RUN=0
GE_CK_FAILED=0
GE_CK_NOTED=0
GE_CK_HOME=''

# Loaded for ge_snap_names and ge_snap_is_stamp, so the ring is counted by the
# same code that fills it. A doctor with its own enumeration is a doctor
# reporting on a folder nothing else can see, which is how it came to say there
# were no backups while backups sat there.
GE_SNAPSHOT_LIB_ONLY=1
[ -f "$GE_HOME_DIR/scripts/cmd/snapshot.sh" ] && . "$GE_HOME_DIR/scripts/cmd/snapshot.sh"

ge_ck_line() {
  GE_CK_RUN=$((GE_CK_RUN + 1))
  [ "$1" = FAIL ] && GE_CK_FAILED=$((GE_CK_FAILED + 1))
  [ "$1" = NOTE ] && GE_CK_NOTED=$((GE_CK_NOTED + 1))
  printf '%-4s  %-9s %s\n' "$1" "$2" "$3"
}

ge_ck_fix() {
  printf '      → run: %s\n' "$1"
}

# ge_ck_fix_action <text>: the other arrow, for the lines that are not a command.
#
# One leg here has no command to give: a marker line a founder deleted out of one
# of their own files can only be put back by them, in their editor, and only they
# know where their own section stops. That instruction used to go out behind the
# words "run:", which told a founder to paste something that is not a program.
# Pasted, "the same command again, once ..." comes back as a not found on the
# word "the", and the punctuation in a marker is a redirection to a shell, so the
# line could also make a file rather than say anything.
#
# So the arrow without "run:" is the form that means read this and do it. It is
# visibly different on the page, and it keeps the promise that everything after
# "run:" is safe to select and paste.
ge_ck_fix_action() {                    # <what the founder has to do>
  printf '      → %s\n' "$1"
}

# "1 backups of 1 files" is the kind of line that costs a founder confidence in
# every other line in the report. The third argument is for the words that do
# not take a plain s: one entry, two entries.
ge_ck_plural() {                        # <count> <singular> [plural]
  if [ "$1" -eq 1 ]; then
    printf '%s %s' "$1" "$2"
  else
    printf '%s %s' "$1" "${3:-$2s}"
  fi
}

# 20260823T141530Z is evidence, but it is not a date a founder reads at a glance.
# The ring adds a -002 tie-breaker when two snapshots land in the same second.
ge_ck_stamp_pretty() {
  case "$1" in
    ????????T??????Z|????????T??????Z-*) ;;
    *) printf '%s' "$1"; return 0 ;;
  esac
  printf '%s-%s-%s %s:%s UTC' \
    "$(printf '%s' "$1" | cut -c1-4)" \
    "$(printf '%s' "$1" | cut -c5-6)" \
    "$(printf '%s' "$1" | cut -c7-8)" \
    "$(printf '%s' "$1" | cut -c10-11)" \
    "$(printf '%s' "$1" | cut -c12-13)"
}

# date_compat gives us epoch from a date. This is the other direction, needed
# once, to name the day a token stops working rather than saying "soon".
ge_ck_day_after() {
  ge_ck_ep=$(( $1 + ($2 * 86400) ))
  if [ "$GE_DATE" = gnu ]; then
    date -u -d "@$ge_ck_ep" +%Y-%m-%d 2>/dev/null
  else
    date -u -r "$ge_ck_ep" +%Y-%m-%d 2>/dev/null
  fi
}

# ge_ck_blocked <leg> <folder> <what it means>: why a write into that folder was
# refused, from what can be proved rather than guessed. The permission bits
# first, then the free space on the disk the folder sits on.
#
# It used to say the same thing either way. A founder whose laptop was full was
# sent to change permissions that were already right, and ge check is the
# command every other refusal in this toolkit hands them, so that was the end of
# the road. The three answers name three different next moves.
ge_ck_blocked() {
  # BOTH bits a folder needs, asked together. A folder takes a new file only when
  # it is writable AND searchable, and this asked about the write bit alone. A
  # folder with the search bit off is what a Windows permission translated into a
  # Unix mode produces, and it is writable by that test, on a disk with room on
  # it, so it fell through to the last answer here: "refused a write and it is
  # not read only", answered with df. df shows a disk that is fine, the founder
  # runs the doctor again, and the same two lines come back for ever.
  #
  # Named together rather than one after the other, so the single command puts
  # back whichever are missing. Asked apart, a folder with neither bit was handed
  # chmod u+w, which leaves it refusing exactly as before.
  ge_ck_bits=''
  [ -w "$2" ] || ge_ck_bits=w
  [ -x "$2" ] || ge_ck_bits="${ge_ck_bits}x"
  if [ -n "$ge_ck_bits" ]; then
    case $ge_ck_bits in
      w) ge_ck_line FAIL "$1" "$2 is read only, so $3" ;;
      x) ge_ck_line FAIL "$1" "$2 cannot be opened, so $3" ;;
      *) ge_ck_line FAIL "$1" "$2 is read only and cannot be opened, so $3" ;;
    esac
    ge_ck_fix "chmod u+$ge_ck_bits $(ge_quote "$2")"
    return 0
  fi
  ge_ck_free=$(df -P -k "$2" 2>/dev/null | sed -n '2p' | awk '{ print $4 }')
  case ${ge_ck_free:-x} in
    ''|*[!0-9]*) ge_ck_free='' ;;
  esac
  if [ -n "$ge_ck_free" ] && [ "$ge_ck_free" -eq 0 ]; then
    # Deliberate: there is no command ge can hand a founder that frees a disk,
    # so the thing to do is said in the sentence and the arrow carries the one
    # command that shows them the disk. A recovery line naming ge check again
    # would have sent them straight back to this same line.
    ge_ck_line FAIL "$1" "the disk that holds $2 has no room left, so $3. Delete something from that disk, then run ge check again"
    ge_ck_fix "df -h $(ge_quote "$2")"
    return 0
  fi
  ge_ck_line FAIL "$1" "$2 refused a write and it is not read only, so $3"
  ge_ck_fix "df -h $(ge_quote "$2")"
}

# ge_ck_probe_gone <folder>: true when no test file of ge's own is left in it.
#
# Every leg that proves a folder by writing into it sweeps first and removes
# after, and both go through rm -f with the error thrown away, so an unlink the
# folder refuses is silent. A sync client holding a file open does exactly that,
# and it left three of the four legs reporting the folder sound with a file
# named after a process id sitting in it. The top leg already asked this
# question; the others assumed the answer.
#
# The name is never printed. It means nothing to a founder and it is not theirs
# to act on. What the leg says instead is that the folder would not let it go.
ge_ck_probe_gone() {                    # <folder>
  # A pattern that matches nothing is left standing as itself, which -e drops.
  for ge_ck_pg in "$1"/.ge-write-probe.* "$1"/.ge-ring-probe.*; do
    [ -e "$ge_ck_pg" ] || continue
    ge_ck_pgb=${ge_ck_pg##*/}
    # This run's own probe is the plain question: it was removed a moment ago,
    # so finding it here means the folder refused to let it go.
    case $ge_ck_pgb in
      *.$$) return 1 ;;
    esac
    # Another run's probe, with that run still going, is not debris. A founder
    # with two Claude windows on one folder has one in here legitimately, and
    # calling it debris would fail a folder that is perfectly sound. Same test
    # the working copies get further down.
    ge_ck_live "$ge_ck_pgb" && continue
    return 1
  done
  return 0
}

# The one wording for one fault, so a founder who has both a locked .state and a
# locked people folder is not reading two different sentences about one cause.
#
# Both of these are cleared by something outside a shell: closing the folder in
# another program, or taking it off cloud sync. So that instruction is in the
# sentence, and the arrow carries the command that says whether it worked.
ge_ck_stuck_probe() {                   # <leg> <what the folder is>
  ge_ck_line FAIL "$1" "$2 let a test file be written and would not let it be removed. Close that folder in every other program, and move it off cloud sync"
  ge_ck_fix "ge check"
}

# The other half of the same fault: a folder that takes a write and hands back
# something else, which is what a synced folder mid conflict does. One wording,
# in one place, for the three legs that write a test file and read it back.
ge_ck_bad_readback() {                  # <leg> <what the folder is>
  ge_ck_line FAIL "$1" "$2 let a test file be written and read it back with something else in it. Close that folder in every other program, and move it off cloud sync"
  ge_ck_fix "ge check"
}

# ge_ck_reinit: the command that runs ge init against THIS folder, from wherever
# the founder happens to be standing.
#
# ge init works on the folder you are in when that folder is called
# growth-engine, and on <where you are>/growth-engine otherwise. So a bare ge
# init lands on this folder from exactly two places and from nowhere else: from
# anywhere else it would refuse, or make a second folder. The line this replaced
# named the folder in English after a comma, and pasted whole that is a command
# called "init," which ge answers by pointing at ge help.
ge_ck_reinit() {
  ge_ck_ri_up=$(dirname -- "$GE_CK_HOME")
  # A folder ge cannot name is not the folder the anchor points at, so a failure
  # here must not read as "you are somewhere else".
  ge_ck_ri_at=$(ge_here) || { printf 'ge check\n'; return 0; }
  if ge_same_dir "$ge_ck_ri_at" "$GE_CK_HOME" || ge_same_dir "$ge_ck_ri_at" "$ge_ck_ri_up"; then
    printf 'ge init\n'
    return 0
  fi
  printf 'cd %s && ge init\n' "$(ge_quote "$ge_ck_ri_up")"
}

# ge_ck_not_a_file <leg> <path> <what it costs>: 0 when a folder is sitting on
# the name of a file, and it has said so. 1 when nothing is in the way.
#
# Every leg that looks for a file asked whether one was there, and read a folder
# on that name as nothing at all. So the report called the file missing and
# handed over the line that makes a missing file: ge index, ge restore, ge init.
# None of them can write a file where a folder already is. ge index says
# "Written to" and hands back success without having written anything, so a
# founder ran the line they were given, was told it worked, ran the doctor again
# and got the identical sentence, for ever.
#
# One wording and one move, here rather than in each leg, so a founder is not
# reading three sentences about one thing. The move is the same one the people
# leg makes: it deletes nothing, so putting the name back is one more paste, and
# running the doctor again then names what to do next from what is really there.
ge_ck_not_a_file() {                    # <leg> <path> <what it costs>
  [ -d "$2" ] || return 1
  ge_ck_nf_rel=${2#"$GE_CK_HOME"/}
  ge_ck_line FAIL "$1" "$ge_ck_nf_rel is a folder and not a file, so $3"
  ge_ck_fix "mv $(ge_quote "$2") $(ge_quote "$2-old")"
  return 0
}

ge_ck_anchor() {
  # A file that cannot be opened is not an empty file, and the two need
  # different fixes. Read as empty, an anchor locked by a sync client sent the
  # founder to ge init, which cannot open it either.
  if [ ! -r "$GE_CK_HOME/.state/HOME" ]; then
    ge_ck_line FAIL anchor ".state/HOME cannot be opened, so nothing can tell this folder from a copy of it"
    ge_ck_fix "chmod u+r $(ge_quote "$GE_CK_HOME/.state/HOME")"
    return 0
  fi
  ge_ck_said=$(ge_anchor "$GE_CK_HOME")
  if [ -z "$ge_ck_said" ]; then
    ge_ck_line FAIL anchor ".state/HOME is empty, so nothing can tell this folder from a copy of it"
    ge_ck_fix "$(ge_ck_reinit)"
    return 0
  fi
  if [ "$ge_ck_said" = "$GE_CK_HOME" ]; then
    ge_ck_line PASS anchor "this folder is at $GE_CK_HOME and .state/HOME says the same"
    return 0
  fi
  # One folder reached by two names is not a folder that moved. A Mac reaches
  # /tmp/x as /private/tmp/x, and a founder working through an alias or a mapped
  # drive reaches the same folder by two names every day. Compared as text this
  # reported a move that had not happened; ge init then re-anchored to whichever
  # name was in use, and coming back the other way reported it again, for ever.
  # ge_same_dir resolves both names before it answers.
  if ge_same_dir "$ge_ck_said" "$GE_CK_HOME"; then
    ge_ck_line PASS anchor "this folder is at $GE_CK_HOME, and .state/HOME names the same folder by another route"
    return 0
  fi
  # A folder that MOVED and a folder that was COPIED look identical from inside,
  # and ge init treats them differently: it re-anchors the first and refuses the
  # second, by design, because re-anchoring a copy quietly makes the copy the
  # real one. What tells them apart is whether the place the anchor names still
  # holds a growth-engine, and this leg never asked. So a founder who had copied
  # their folder was told to run ge init, ge init refused with a different
  # sentence, and the doctor printed this same line again, for ever. The doctor
  # was claiming a re-anchor would work on evidence it had not gathered.
  # ge context makes the related distinction where it says the same thing.
  if [ -f "$ge_ck_said/.state/HOME" ]; then
    ge_ck_line FAIL anchor "this folder is at $GE_CK_HOME and .state/HOME says it was made at $ge_ck_said, where there is still a folder, so one of the two is a copy and both hold work"
    if [ ! -e "$ge_ck_said-old" ]; then
      ge_ck_fix "mv $(ge_quote "$ge_ck_said") $(ge_quote "$ge_ck_said-old") && $(ge_ck_reinit)"
    else
      # Deliberate: there is no one command here. ge will not choose between two
      # copies of a founder's work, the name it would move the other one to is
      # taken already, and inventing a second name gives them one more thing to
      # keep track of. So the arrow opens the other folder, which is the step
      # that lets them decide, and the sentence above says what to decide.
      ge_ck_fix "cd $(ge_quote "$ge_ck_said")"
    fi
    return 0
  fi
  ge_ck_line FAIL anchor ".state/HOME says $ge_ck_said but this folder is at $GE_CK_HOME"
  ge_ck_fix "$(ge_ck_reinit)"
}

# ge_ck_live <bare name>: true while the run that made a working file is still
# going. Every one of these names ends in the process id of the run that wrote
# it, so a founder with two Claude windows on one folder does not have a save
# that is happening right now read as one that stopped. A number that names no
# running process, and a name that ends in anything else, is litter.
ge_ck_live() {                          # <bare file name>
  ge_ck_pid=${1##*.}
  # 0 is left out on purpose: kill -0 0 asks about a whole process group and
  # answers yes, which would make a file called something.0 look alive for ever.
  case ${ge_ck_pid:-x} in
    ''|0|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$ge_ck_pid" 2>/dev/null
}

# ge_ck_owner <name inside the folder>: sets ge_ck_own to the founder's own file
# a working copy was made from, or to nothing when the copy belongs to ge's own
# records rather than to something the founder wrote.
ge_ck_owner() {                         # <name relative to GE_CK_HOME>
  ge_ck_own=''
  ge_ck_ow=${1%.*}                      # the process id off the end
  case $ge_ck_ow in
    *.ge-tmp) ge_ck_ow=${ge_ck_ow%.ge-tmp} ;;
    *.ge-body) ge_ck_ow=${ge_ck_ow%.ge-body} ;;
    *) return 0 ;;
  esac
  case $ge_ck_ow in
    .*) return 0 ;;
  esac
  [ -f "$GE_CK_HOME/$ge_ck_ow" ] || return 0
  ge_ck_own=$ge_ck_ow
}

# ge_ck_leftovers: the working copies ge writes beside a file while it replaces
# one. ge writes the copy, then moves it into place in a single step, so a copy
# still sitting in the folder is a save that stopped part way: the founder's own
# file was left exactly as it was, and whatever was being written never landed.
#
# They are taken away rather than named. Nothing in ge ever reads one back, so
# there is nothing in one for a founder to recover, and the name carries a
# process id that means nothing to them and would be the only thing they could
# act on. What the report says instead is what it meant: a save did not finish.
#
# Counts what it found in ge_ck_left_n, what would not go in ge_ck_left_stuck,
# and the first founder file it can name in ge_ck_left_name.
ge_ck_leftovers() {
  ge_ck_left_n=0
  ge_ck_left_stuck=0
  ge_ck_left_dir=''
  ge_ck_left_name=''
  # Every temporary name the tree writes, in every folder it writes one in. A
  # glob that matches nothing comes back as itself, which the -f test drops.
  for ge_ck_lf in \
    "$GE_CK_HOME"/*.ge-tmp.* "$GE_CK_HOME"/*.ge-body.* "$GE_CK_HOME"/.ge-restore-tmp.* \
    "$GE_CK_HOME"/*/*.ge-tmp.* "$GE_CK_HOME"/*/*.ge-body.* "$GE_CK_HOME"/*/.ge-restore-tmp.* \
    "$GE_CK_HOME"/.state/*.ge-tmp.* "$GE_CK_HOME"/.state/remember.src.* \
    "$GE_CK_HOME"/.state/.ge-restore-tmp.* \
    "$GE_CK_HOME"/.state/snapshots/.ge-snapshot-tmp.*
  do
    [ -f "$ge_ck_lf" ] || continue
    ge_ck_lb=${ge_ck_lf##*/}
    ge_ck_live "$ge_ck_lb" && continue
    ge_ck_left_n=$((ge_ck_left_n + 1))
    if [ -z "$ge_ck_left_name" ]; then
      ge_ck_owner "${ge_ck_lf#"$GE_CK_HOME"/}"
      ge_ck_left_name=$ge_ck_own
    fi
    rm -f "$ge_ck_lf" 2>/dev/null
    [ -e "$ge_ck_lf" ] || continue
    ge_ck_left_stuck=$((ge_ck_left_stuck + 1))
    [ -n "$ge_ck_left_dir" ] || ge_ck_left_dir=${ge_ck_lf%/*}
  done
}

# Reading back what was written is the point. A folder that accepts a write and
# returns something else is a synced folder mid-conflict, and that is a real case.
#
# The name of the file this writes is never printed. It carries a process id so
# two runs cannot collide, and a founder shown that has been handed a name that
# means nothing and will not be there when they look.
ge_ck_write() {
  # Swept before the probe, not only after it. A probe that could not be deleted
  # on an earlier run carries that run's process id, so nothing would ever go
  # back for it and it would sit in the folder the founder opens every day.
  rm -f "$GE_CK_HOME"/.ge-write-probe.* 2>/dev/null
  ge_ck_canary="$GE_CK_HOME/.ge-write-probe.$$"
  ge_ck_body="ge write probe $$"
  # The group carries the 2>/dev/null, because a failing > redirection is
  # reported by the shell before that command's own redirections are applied.
  if ! { printf '%s\n' "$ge_ck_body" > "$ge_ck_canary"; } 2>/dev/null; then
    ge_ck_blocked write "$GE_CK_HOME" "nothing can be saved into it"
    return 0
  fi
  ge_ck_back=$(cat "$ge_ck_canary" 2>/dev/null)
  if [ "$ge_ck_back" != "$ge_ck_body" ]; then
    rm -f "$ge_ck_canary" 2>/dev/null
    ge_ck_bad_readback write "$GE_CK_HOME"
    return 0
  fi
  rm -f "$ge_ck_canary" 2>/dev/null
  # Asked of the whole folder and not of this run's file alone. A probe an
  # earlier run could not remove carries that run's process id, so the sweep
  # above is the only thing that would ever go back for it, and the sweep is
  # just as silent when the unlink is refused.
  if ! ge_ck_probe_gone "$GE_CK_HOME"; then
    ge_ck_stuck_probe write "$GE_CK_HOME"
    return 0
  fi

  # .state holds the index, the mark on the ops log, the setup receipt and the
  # scratch file ge remember writes. A folder that takes a write while .state
  # refuses one leaves ge index, ge log and ge remember all refusing, and this
  # leg used to report that folder as sound because it only ever wrote up here.
  ge_ck_state="$GE_CK_HOME/.state"
  rm -f "$ge_ck_state"/.ge-write-probe.* 2>/dev/null
  ge_ck_canary="$ge_ck_state/.ge-write-probe.$$"
  if ! { printf '%s\n' "$ge_ck_body" > "$ge_ck_canary"; } 2>/dev/null; then
    ge_ck_blocked write "$ge_ck_state" "ge index, ge log and ge remember cannot save anything"
    return 0
  fi
  # Read back and confirmed gone, the same two questions the folder above was
  # asked. This used to write and walk away, so the line at the end of this leg
  # claimed .state had been read back and deleted on the strength of neither.
  ge_ck_back=$(cat "$ge_ck_canary" 2>/dev/null)
  rm -f "$ge_ck_canary" 2>/dev/null
  if [ "$ge_ck_back" != "$ge_ck_body" ]; then
    ge_ck_bad_readback write ".state"
    return 0
  fi
  if ! ge_ck_probe_gone "$ge_ck_state"; then
    ge_ck_stuck_probe write ".state"
    return 0
  fi

  # A working copy left in the folder is the one piece of evidence that a save
  # stopped part way, and it was the one thing nothing in this toolkit looked at.
  ge_ck_leftovers
  if [ "$ge_ck_left_stuck" -gt 0 ]; then
    ge_ck_blocked write "$ge_ck_left_dir" \
      "a copy left behind by a save that stopped part way cannot be taken out of it"
    return 0
  fi
  if [ "$ge_ck_left_n" -gt 0 ] && [ -n "$ge_ck_left_name" ]; then
    ge_ck_line NOTE write "a save into $ge_ck_left_name stopped part way, so $ge_ck_left_name was left as it was and what was being written did not go into it. Read it, and write that entry again if it is not in there. The copy it left behind has been cleared away"
    ge_ck_fix "cat $(ge_quote "$GE_CK_HOME/$ge_ck_left_name")"
    return 0
  fi
  if [ "$ge_ck_left_n" -gt 0 ]; then
    ge_ck_line NOTE write "a save into this folder stopped part way, so what was being written did not go in. The copy it left behind has been cleared away"
    ge_ck_fix "ge index"
    return 0
  fi
  ge_ck_line PASS write "a test file was created in the folder and in .state, read back and deleted"
}

# ge_ck_index_rows <index file>: how many files the table actually lists.
#
# Read the same way ge_ck_index_gone reads it, so a row this counts is a row that
# one can look for. The header line and the row of dashes under it are not rows.
ge_ck_index_rows() {                    # <index file>
  tr -d '\r' 2>/dev/null < "$1" | awk -F'|' '
    NF > 4 {
      f = $2
      gsub(/^ +| +$/, "", f)
      if (f == "" || f == "file") next
      if (f ~ /^-+$/) next
      n = n + 1
    }
    END { print n + 0 }
  '
}

# ge_ck_index_gone: the files the index says are in the folder that are not
# there now, one a line. Rows already marked missing are the index telling the
# truth. The people row ends in a slash and has its own leg, so it is left out
# of this one rather than reported twice.
ge_ck_index_gone() {                    # <index file>
  tr -d '\r' 2>/dev/null < "$1" | awk -F'|' '
    NF > 4 {
      f = $2; s = $4
      gsub(/^ +| +$/, "", f)
      gsub(/^ +| +$/, "", s)
      if (f == "" || f == "file") next
      if (f ~ /^-+$/) next
      if (s == "missing" || s == "status") next
      if (f ~ /\/$/) next
      print f
    }
  ' | while IFS= read -r ge_ck_row; do
    [ -n "$ge_ck_row" ] || continue
    [ -e "$GE_CK_HOME/$ge_ck_row" ] || printf '%s\n' "$ge_ck_row"
  done
}

# ge_ck_backup_state <path relative to GE_CK_HOME>: whether the ring holds a
# backup of that file. THREE answers, in the exit status:
#
#   0  the ring can be read and it holds at least one backup of that file
#   1  the ring can be read and it holds none
#   2  nothing here can say, because the ring cannot be listed or this build has
#      no snapshot library in it
#
# Asked through snapshot.sh's own listing, so the doctor and ge restore read the
# same ring by the same code. A doctor with an enumeration of its own is a doctor
# reporting on a folder nothing else can see.
#
# WHY THE THIRD ANSWER EXISTS. This used to answer "none" to all three, on the
# reading that none is the safe direction. It is not, because the sentence built
# on it tells the founder "There is no backup of it, so ge cannot put it back",
# and a folder whose contents cannot be listed comes back empty in exactly the
# way an empty one does. With backups sitting in it, a founder was told their own
# copy was the only way back, and handed the command that stops the table
# counting the file at all. That is a check claiming more than it examined, over
# the one folder that exists so that work is never lost.
#
# A ring that is missing, or a file sitting on its name, genuinely holds no
# backups, so that is "none" and not "cannot say". The snapshots leg names that
# folder and the command that puts it back.
ge_ck_backup_state() {                  # <relative path>
  command -v ge_snap_stamps >/dev/null 2>&1 || return 2
  ge_ck_bs_dir="$GE_CK_HOME/.state/snapshots"
  [ -d "$ge_ck_bs_dir" ] || return 1
  # Listed needs the read bit, and reaching what is listed needs the search bit.
  # With either off the listing is silently empty, which is why it is asked of
  # the folder rather than read off the silence.
  if [ ! -r "$ge_ck_bs_dir" ] || [ ! -x "$ge_ck_bs_dir" ]; then
    return 2
  fi
  ge_ck_bs=$(ge_snap_stamps "$ge_ck_bs_dir" "$(ge_snap_flat "$1")" | sed -n '1p')
  [ -n "$ge_ck_bs" ] || return 1
  return 0
}

# The one command that lets the ring be read again, for the legs that have to say
# they could not tell. In one place, because two legs print it.
ge_ck_ring_open() {
  printf 'chmod u+rx %s\n' "$(ge_quote "$GE_CK_HOME/.state/snapshots")"
}

ge_ck_index() {
  ge_ck_idx="$GE_CK_HOME/.state/index.md"
  # Asked before "is it there", because a folder on that name answers no to that
  # question and the answer sends the founder to ge index, which cannot clear it.
  ge_ck_not_a_file index "$ge_ck_idx" "nothing here knows which files you have" && return 0
  if [ ! -f "$ge_ck_idx" ]; then
    if [ ! -f "$GE_HOME_DIR/scripts/cmd/index.sh" ]; then
      ge_ck_line SKIP index "this build has no ge index yet, so there is no index to age"
      return 0
    fi
    ge_ck_line FAIL index "there is no .state/index.md, so nothing knows which files you have"
    ge_ck_fix "ge index"
    return 0
  fi

  # An index that cannot be opened told the founder nothing was missing, because
  # every row it could not read is a row it could not miss. The shell said why on
  # its own line, naming a file inside this toolkit, and the leg below it read
  # PASS. Both ends of that are wrong, and this is the one that matters.
  if [ ! -r "$ge_ck_idx" ]; then
    ge_ck_line FAIL index ".state/index.md cannot be opened, so nothing here knows which files you have"
    # u+rw and not u+r, for the reason ge_may_replace gives for the same choice.
    # On the common shape, a file at 444, the two do the same thing. On a file
    # at 000, u+r hands back half of it, the write test below then refuses on
    # the next run, and the founder pastes twice for one file.
    ge_ck_fix "chmod u+rw $(ge_quote "$ge_ck_idx")"
    return 0
  fi

  # Asked HERE, above every branch below it, because three of them hand over
  # ge index and a read only table refuses all three. ge index writes a new
  # table beside the old one and moves it over the top, and a file set read only
  # refuses that move, so the founder read a line, pasted it, was refused, ran
  # the doctor and read the identical line again, for ever. Nothing else in ge
  # writes this file, so the leg can say exactly what stops and nothing more.
  #
  # The log leg asks the same question of ops-log.md in the same position and
  # for the same reason. What this leg would have said about the rows is a run
  # behind now, and it is said as soon as the table can be written again.
  if [ ! -w "$ge_ck_idx" ]; then
    ge_ck_line FAIL index ".state/index.md is read only, so ge index cannot write the table again and the list of your files cannot be brought up to date"
    ge_ck_fix "chmod u+w $(ge_quote "$ge_ck_idx")"
    return 0
  fi

  # Counted before anything at all is read out of the table.
  #
  # Every other question this leg asks is asked of rows, and a table with no rows
  # answers all of them with nothing: no file it lists is missing, none of them
  # changed, and the line at the end of this leg then read "the index is newer
  # than all of your 7 files" over a file that listed none of them. The report
  # ended on "Nothing to fix", and ge context, which counts the founder's gates
  # off these same rows, printed no gate lines at all.
  #
  # No row is never the ordinary state. ge init writes a table with a row for
  # every file the programme expects, before the founder has written one of them,
  # so an empty table is a save that stopped part way, a sync client that
  # truncated the file, or a hand edit. Rebuilding it is one command.
  ge_ck_rows=$(ge_ck_index_rows "$ge_ck_idx")
  case ${ge_ck_rows:-x} in ''|*[!0-9]*) ge_ck_rows=0 ;; esac
  if [ "$ge_ck_rows" -eq 0 ]; then
    ge_ck_line FAIL index ".state/index.md lists no files at all, so nothing here knows which files you have"
    ge_ck_fix "ge index"
    return 0
  fi

  # Asked first of the rows, because it is the one that lies in the dangerous
  # direction. The leg used to ask only whether a file that still exists is newer
  # than the index, so a Brain that a sync client or a tidy-up removed left the
  # index still calling it done, the session summary still counting the gate, and
  # every leg green.
  ge_ck_gone=$(ge_ck_index_gone "$ge_ck_idx" | sed '/^$/d')
  ge_ck_gone_n=$(printf '%s' "$ge_ck_gone" | grep -c '')
  if [ "$ge_ck_gone_n" -gt 0 ]; then
    ge_ck_first=$(printf '%s\n' "$ge_ck_gone" | sed -n '1p')
    # The ring is asked BEFORE a restore is named, never after.
    #
    # This leg used to hand over "ge restore <file>" for any file the index lists
    # and the folder no longer holds, without once asking whether there was
    # anything to restore. ge makes a backup when it CHANGES a file, so a file
    # ge has never written, a Brain or a content file the founder typed
    # themselves, has none. For those, ge restore refuses with "there are no
    # backups of it", this leg prints the identical line again, and the two go
    # round for ever. The doctor was claiming a restore would work on evidence it
    # had not gathered, which is the same fault the anchor leg was repaired for.
    #
    # ASKED OF EVERY FILE THAT WENT, not of the first one only. Where three files
    # are gone and the second has a backup, asking about the first alone reported
    # that nothing could be put back and handed over ge index, which takes all
    # three rows off the table. The founder then never learns the second one was
    # sitting in the ring the whole time. The loop stops at the first file it can
    # offer a way back for, so a long list costs one answer and not a listing.
    ge_ck_back_have=''
    ge_ck_back_tell=yes
    # Split on the newline the list is held with, with pathname expansion off: a
    # file a founder named with a bracket would otherwise be rewritten into
    # whatever the folder happens to hold before it was ever looked up.
    ge_ck_ifs=$IFS
    ge_ck_glob=''
    case $- in *f*) ge_ck_glob=1 ;; esac
    set -f
    IFS='
'
    for ge_ck_gf in $ge_ck_gone; do
      [ -n "$ge_ck_gf" ] || continue
      ge_ck_backup_state "$ge_ck_gf"
      case $? in
        0) ge_ck_back_have=$ge_ck_gf; break ;;
        2) ge_ck_back_tell=no; break ;;
      esac
    done
    IFS=$ge_ck_ifs
    [ -n "$ge_ck_glob" ] || set +f
    # The answer decides all three ways. With a backup the way back is the
    # restore. With none, ge cannot put the file back at all and saying so is the
    # honest sentence: the founder's own copy is the only thing that can, and
    # where they have none, ge index takes the row off the table and clears this.
    # Where the ring could not be listed nothing is claimed about it either way,
    # and the arrow is the one command that makes the next answer possible.
    if [ "$ge_ck_back_tell" = no ]; then
      # No "of it": this branch is printed over one gone file and over several,
      # and "it" after a list of three names reads as a remark about the last one.
      ge_ck_back_say="Nothing here can say whether there is a backup, because the backup folder cannot be listed. This opens that folder, and the next run of the doctor says whether there is a copy to put back"
      ge_ck_back_do=$(ge_ck_ring_open)
    elif [ -n "$ge_ck_back_have" ]; then
      ge_ck_back_say="There is a backup of $ge_ck_back_have, so ge restore puts that copy back. If you meant to remove it, run ge index instead and the table will stop counting it"
      # The path is quoted, like every other path this file prints, because a
      # file name a founder chose can carry a space and an unquoted one splits
      # in two.
      ge_ck_back_do="ge restore $(ge_quote "$ge_ck_back_have")"
    elif [ "$ge_ck_gone_n" -eq 1 ]; then
      ge_ck_back_say="There is no backup of $ge_ck_first, so ge cannot put it back. If you have a copy of your own, put it there. If you meant to remove it, ge index stops the table counting it"
      ge_ck_back_do="ge index"
    else
      # Every one of them was asked about, so this says so rather than naming the
      # first and letting a founder read it as a remark about that one file.
      ge_ck_back_say="Not one of them has a backup, so ge cannot put them back. If you have copies of your own, put them there. If you meant to remove them, ge index stops the table counting them"
      ge_ck_back_do="ge index"
    fi
    if [ "$ge_ck_gone_n" -eq 1 ]; then
      ge_ck_line FAIL index "the index says $ge_ck_first is in the folder, and it is not there now. $ge_ck_back_say"
    else
      ge_ck_names=$(printf '%s\n' "$ge_ck_gone" | sed -n '1,3p' | tr '\n' ' ' | sed 's/  *$//')
      ge_ck_line FAIL index "the index names $ge_ck_gone_n files that are not in the folder now: $ge_ck_names. $ge_ck_back_say"
    fi
    ge_ck_fix "$ge_ck_back_do"
    return 0
  fi

  # A folder whose contents cannot be listed comes back as no contents at all,
  # and the count below then read "the index is newer than all of your 0 files"
  # where a moment before it said 5. This is what an ACL, or a Windows
  # permission translated into a Unix mode, produces: the read bit off and the
  # execute bit on, so every file can still be opened by name and none of them
  # can be found by looking. The people leg and the ring leg both ask this of
  # their own folder, with comments saying why. Nothing had ever asked it of the
  # folder every one of the founder's own files sits in.
  if [ ! -r "$GE_CK_HOME" ]; then
    ge_ck_line FAIL index "your growth-engine folder cannot be listed, so nothing here can say which files are in it"
    ge_ck_fix "chmod u+rx $(ge_quote "$GE_CK_HOME")"
    return 0
  fi
  # The other folder this leg counts from. A SKIP and not a FAIL, because the
  # people leg below names this same folder and the command that clears it, and
  # one fault answered twice is a founder working down a list where two of the
  # lines are the same line. What must not happen is the count going out as
  # though it had seen the people files, which is how sixty prospects vanish
  # from a number a founder reads to find out whether their folder is sound.
  if [ -d "$GE_CK_HOME/people" ] && [ ! -r "$GE_CK_HOME/people" ]; then
    ge_ck_line SKIP index "the people folder cannot be listed, so your files could not be counted"
    return 0
  fi

  ge_ck_seen=0
  ge_ck_stale=''
  ge_ck_stale_n=0
  for ge_ck_f in "$GE_CK_HOME"/*.md "$GE_CK_HOME"/*.csv "$GE_CK_HOME"/people/*.md; do
    [ -e "$ge_ck_f" ] || continue
    case "${ge_ck_f##*/}" in README.md) continue ;; esac
    ge_ck_seen=$((ge_ck_seen + 1))
    # find -newer, not test -nt: -nt is not in POSIX test and Git Bash is the floor.
    [ -n "$(find "$ge_ck_f" -newer "$ge_ck_idx" 2>/dev/null)" ] || continue
    ge_ck_stale_n=$((ge_ck_stale_n + 1))
    # Named with the folder, because people/sofia.md and sofia.md trim to the
    # same word and a founder cannot go and look at a file this does not place.
    [ "$ge_ck_stale_n" -le 3 ] && ge_ck_stale="$ge_ck_stale ${ge_ck_f#"$GE_CK_HOME"/}"
  done
  if [ "$ge_ck_stale_n" -eq 0 ]; then
    ge_ck_line PASS index "the index is newer than all of your $(ge_ck_plural "$ge_ck_seen" file)"
    return 0
  fi
  # Every ge log, ge remember, ge person and ge ledger writes a file the index
  # lists, so an index older than a file is the resting state of a folder
  # somebody is working in. Reported as a failure it made red the normal colour
  # of a healthy folder, which is how a founder learns to stop reading the report.
  if [ "$ge_ck_stale_n" -le 3 ]; then
    ge_ck_line NOTE index "$ge_ck_stale_n of $(ge_ck_plural "$ge_ck_seen" file) changed after the index was built:$ge_ck_stale"
    ge_ck_fix "ge index"
    return 0
  fi
  # The list is cut at three above, and the cut is now SAID. This used to print
  # the full count against the shortened list with nothing to mark it: "5 of 7
  # files changed after the index was built: founder-brain.md ledger.md
  # memory.md". A founder read the three, went and looked at them, and two files
  # they were never told about stayed out of date. Three is still the cap,
  # because somebody working a list of sixty people would otherwise get sixty
  # names in one line, and the one command below takes in every one of them
  # either way.
  ge_ck_more=$((ge_ck_stale_n - 3))
  ge_ck_line NOTE index "$ge_ck_stale_n of $(ge_ck_plural "$ge_ck_seen" file) changed after the index was built. Three of them are:$ge_ck_stale. That leaves $(ge_ck_plural "$ge_ck_more" file) this line does not name, and ge index takes in all $ge_ck_stale_n"
  ge_ck_fix "ge index"
}

# The folder every prospect and every target lives in. ge person refuses outright
# without it, so a doctor that does not look at it calls a folder healthy that
# cannot hold a single person.
ge_ck_people() {
  ge_ck_pdir="$GE_CK_HOME/people"
  if [ -d "$ge_ck_pdir" ]; then
    # A folder whose contents cannot be listed comes back as no contents at all,
    # and the count below then reported an empty people folder to a founder with
    # sixty prospects in it, on the line they read to find out whether their
    # folder is sound. The backup leg asks this before counting for the same
    # reason. Asked before the write probe, so a folder that can be neither read
    # nor written is one fault with one fix rather than two lines to work down.
    if [ ! -r "$ge_ck_pdir" ]; then
      ge_ck_line FAIL people "the people folder cannot be opened, so nothing here can say who is in it"
      ge_ck_fix "chmod u+rx $(ge_quote "$ge_ck_pdir")"
      return 0
    fi
    # Proved by writing, the way the folder above it is. This leg used to report
    # a people folder that refuses every write as sound, and the refusal ge
    # person prints is "run: ge check", so a founder whose people folder had gone
    # read only was sent to the one line that told them nothing was wrong.
    rm -f "$ge_ck_pdir"/.ge-write-probe.* 2>/dev/null
    ge_ck_pprobe="$ge_ck_pdir/.ge-write-probe.$$"
    ge_ck_pbody="ge people probe $$"
    if ! { printf '%s\n' "$ge_ck_pbody" > "$ge_ck_pprobe"; } 2>/dev/null; then
      ge_ck_blocked people "$ge_ck_pdir" "ge person cannot add anyone or write anything down about them"
      return 0
    fi
    # Read back before it is removed, the way the write leg reads its own two
    # canaries back. This leg used to write and walk away, which is the exact
    # fault the write leg was repaired for, and it was unguarded on the folder
    # that holds the prospect list. A folder that accepts a write and hands back
    # something else is a synced folder mid conflict, and that is a real case.
    ge_ck_pback=$(cat "$ge_ck_pprobe" 2>/dev/null)
    rm -f "$ge_ck_pprobe" 2>/dev/null
    if [ "$ge_ck_pback" != "$ge_ck_pbody" ]; then
      ge_ck_bad_readback people "the people folder"
      return 0
    fi
    if ! ge_ck_probe_gone "$ge_ck_pdir"; then
      ge_ck_stuck_probe people "the people folder"
      return 0
    fi
    # TWO numbers out of one pass, because a name in this folder is not the same
    # thing as a person file. This counted every name it could see and called
    # them all files, so with one of three person files at mode 000 it read
    # "holding 3 files" while the lint line in the same report, one line down and
    # written in the same second, named that very file as one that cannot be
    # opened. One report cannot say both. A folder sitting on the name of a
    # person is counted the same way here for the same reason: it holds nobody
    # this leg can read.
    ge_ck_pn=0
    ge_ck_pn_shut=0
    for ge_ck_pf in "$ge_ck_pdir"/*.md; do
      [ -e "$ge_ck_pf" ] || continue
      case "${ge_ck_pf##*/}" in README.md) continue ;; esac
      if [ -f "$ge_ck_pf" ] && [ -r "$ge_ck_pf" ]; then
        ge_ck_pn=$((ge_ck_pn + 1))
      else
        ge_ck_pn_shut=$((ge_ck_pn_shut + 1))
      fi
    done
    # SKIP, and with no arrow of its own, the way the two SKIPs about this same
    # folder further up are written. The lint leg asks the identical question of
    # every person file and names one of them with the command that opens it, so
    # a FAIL here would be a founder working down a list where two of the lines
    # are the same line. What this leg must not do is what it was doing, which is
    # put a count in front of the founder that includes files nothing here could
    # open.
    if [ "$ge_ck_pn_shut" -gt 0 ]; then
      ge_ck_line SKIP people "the people folder is there, and $(ge_ck_plural "$ge_ck_pn_shut" name) in it cannot be opened, so nothing here can say how many people are in it"
      return 0
    fi
    if [ "$ge_ck_pn" -eq 0 ]; then
      ge_ck_line PASS people "the people folder is there and nobody is in it yet"
    else
      ge_ck_line PASS people "the people folder is there, holding $(ge_ck_plural "$ge_ck_pn" file)"
    fi
    return 0
  fi
  if [ -e "$ge_ck_pdir" ]; then
    ge_ck_line FAIL people "people is a file and not a folder, so ge person has nowhere to keep anyone"
    # Named as a command rather than described. "Rename that file" is a sentence
    # a founder has to work out; this is a line they can paste, and it deletes
    # nothing, so putting the name back is one more paste.
    ge_ck_fix "mv $(ge_quote "$ge_ck_pdir") $(ge_quote "$ge_ck_pdir-old") && $(ge_ck_reinit)"
    return 0
  fi
  ge_ck_line FAIL people "there is no people folder, so ge person cannot add or list anyone. ge init makes it again and changes nothing else"
  ge_ck_fix "$(ge_ck_reinit)"
}

# The two things ge lint reports that are not about shape at all.
#
# WHY THEY ARE PULLED OUT: the linter has one voice for everything it finds, and
# this leg turned that whole voice into a NOTE. Nearly all of it deserves that. A
# Track typed in capitals, a date written the wrong way round, a memory file over
# its budget: every one of those is worth a minute and none of them stops
# anything. Three of them are not like that. A marked section that no longer has
# one start line above one end line, a file that will not open, and a file that
# will not take a write, are all three refused by every write that touches them,
# and they stay refused until somebody changes the file. A founder whose worked
# section had lost its end line was told nine checks ran, none failed, and
# nothing is broken, and ge remember then threw away every entry they tried to
# put in it, that day and every day after.
#
# The verdict comes from lib/blocks.sh, which is the code the write itself
# refuses in, and not from the words the linter chose. So the doctor and the
# refusal cannot drift apart, and a build with no ge lint in it still cannot
# report a folder ge can no longer write into as sound.
GE_CK_WB_PATH=''
GE_CK_WB_REL=''
GE_CK_WB_NAME=''
GE_CK_WB_WHY=''

# ge_ck_block_file <path>: 0 when ge can no longer write into that file, with the
# four fields above set to say which part of it and why. 1 when it is writable.
ge_ck_block_file() {                    # <path inside GE_CK_HOME>
  ge_ck_bf_rel=${1#"$GE_CK_HOME"/}
  # A folder sitting on the name of one of the founder's files is not something
  # ge can write into, and not something it can read either. This leg used to
  # pass over anything that was not a plain file, so a folder called memory.md
  # read as no structural warnings while ge remember refused every entry.
  #
  # Only a folder is named. Anything else that is not a plain file is still
  # passed over on purpose: reading a pipe with that name would stop the doctor
  # where it stands and never come back.
  if [ -d "$1" ]; then
    GE_CK_WB_PATH=$1
    GE_CK_WB_REL=$ge_ck_bf_rel
    GE_CK_WB_NAME=''
    GE_CK_WB_WHY=folder
    return 0
  fi
  [ -f "$1" ] || return 1
  # Asked before anything is read out of it. A file that will not open is a file
  # nothing can scan, and every write into it is refused before a marker is ever
  # looked at, so this is the fault and the marker question is not.
  if [ ! -r "$1" ]; then
    GE_CK_WB_PATH=$1
    GE_CK_WB_REL=$ge_ck_bf_rel
    GE_CK_WB_NAME=''
    GE_CK_WB_WHY=unreadable
    return 0
  fi
  # Asked of the FILE, not of the folder around it, and asked before the marker
  # shape. Both ways ge writes into one of these are refused by a read only file:
  # when the marked section is not there ge appends a whole one, and an append
  # into a read only file is refused whatever the folder allows; when it is
  # there ge finishes the rewrite by moving the new copy over the old one, which
  # goes through on a Mac and on Linux and does NOT go through on Git Bash,
  # where half the cohort is. Either way the refusal a founder gets says to run
  # ge check, and ge check looked at the folder, at the marker shape and never
  # once at whether the file itself would take a write.
  if [ ! -w "$1" ]; then
    GE_CK_WB_PATH=$1
    GE_CK_WB_REL=$ge_ck_bf_rel
    GE_CK_WB_NAME=''
    GE_CK_WB_WHY=unwritable
    return 0
  fi
  # Every name that has a start line OR an end line, the way ge lint collects
  # them: taken from start lines alone, a file whose start line was the one
  # deleted has no name to look up, and the shape ge refuses to write to is the
  # shape nothing can see. Two sed expressions rather than one alternation,
  # because \| is a GNU extension and BSD sed is the sed on every Mac in the
  # room. A name is letters, digits and underscores, so the split below cannot
  # break on one and no name can carry a pattern character.
  ge_ck_bf_names=$(tr -d '\r' 2>/dev/null < "$1" | sed -n \
    -e 's/.*<!-- GE:\([A-Za-z0-9_]*\):START -->.*/\1/p' \
    -e 's/.*<!-- GE:\([A-Za-z0-9_]*\):END -->.*/\1/p' | LC_ALL=C sort -u)
  for ge_ck_bf_n in $ge_ck_bf_names; do
    # One pass, and both answers come out of it: whether ge refuses this shape,
    # and which shape it is. The shape is kept because a file that stopped being
    # readable between the test above and this line must not be handed the
    # marker repair, whose recovery line would send the founder to ge check.
    ge_ck_bf_out=$(block_scan "$1" "$ge_ck_bf_n")
    [ $? -eq 2 ] || continue
    GE_CK_WB_PATH=$1
    GE_CK_WB_REL=$ge_ck_bf_rel
    GE_CK_WB_NAME=$ge_ck_bf_n
    case ${ge_ck_bf_out%% *} in
      unreadable) GE_CK_WB_WHY=unreadable ;;
      *)          GE_CK_WB_WHY=block ;;
    esac
    return 0
  done
  return 1
}

# ge_ck_blocked_file: the first file ge writes into that it can no longer write
# into. ops-log.md is left out because the log leg reads it, asks the same three
# questions of it and would say the same thing twice. founder-brain.md is left
# out because ge never writes it.
#
# Named one at a time rather than looped over a list, because a founder folder on
# a Desktop called "My Business" carries a space and a list would split on it.
ge_ck_blocked_file() {
  GE_CK_WB_PATH=''
  GE_CK_WB_REL=''
  GE_CK_WB_NAME=''
  GE_CK_WB_WHY=''
  ge_ck_block_file "$GE_CK_HOME/memory.md" && return 0
  ge_ck_block_file "$GE_CK_HOME/ledger.md" && return 0
  ge_ck_block_file "$GE_CK_HOME/dm-openers.md" && return 0
  # -e and not -f, so a folder named after a person reaches the test above that
  # names it. A pattern that matches nothing is left standing as itself, which
  # -e drops.
  for ge_ck_bd_p in "$GE_CK_HOME"/people/*.md; do
    [ -e "$ge_ck_bd_p" ] || continue
    case "${ge_ck_bd_p##*/}" in README.md) continue ;; esac
    ge_ck_block_file "$ge_ck_bd_p" && return 0
  done
  return 1
}

ge_ck_lint() {
  # Asked before ge lint is run, and answered without it. A folder ge cannot
  # write into is broken whether or not this build has a linter to describe it,
  # and the SKIP below used to be enough to hide that.
  if ge_ck_blocked_file; then
    # THE HALF OF THIS LEG THAT DID NOT HAPPEN, SAID OUT LOUD.
    #
    # Every branch below this one ends the leg, so ge lint is never run once a
    # blocked file is found. That is right: a file ge can no longer write into
    # is the thing to fix first, and a warning list underneath it is noise. What
    # was wrong is that nothing said so. On one folder ge check read "9 checks
    # ran. 1 failed, 1 to look at" while ge lint on the same folder in the same
    # second had twenty things to look at, and the founder had no way to tell
    # that the linter had not been near their files. The SKIP branch further
    # down says it for the people folder; these four did not say it at all.
    #
    # One clause, joined to all four, so the four sentences cannot drift apart.
    # It goes in the leg's own sentence, above the arrow, because everything
    # after "run: " is the command and nothing else.
    ge_ck_lnot="and ge lint has not run, so nothing here has checked the rest of your files"
    # Through the shared helper, so a folder on the name of one of the founder's
    # files reads the same as a folder on the name of one of ge's own.
    if [ "$GE_CK_WB_WHY" = folder ]; then
      ge_ck_not_a_file lint "$GE_CK_WB_PATH" "nothing can be saved into it, $ge_ck_lnot"
      return 0
    fi
    if [ "$GE_CK_WB_WHY" = unreadable ]; then
      ge_ck_line FAIL lint "$GE_CK_WB_REL cannot be opened, so nothing can be read out of it and nothing can be saved into it, $ge_ck_lnot"
      # u+rw. A person file at 000 was handed u+r, came back on the next run as
      # the read only branch below with u+w, and the founder pasted twice for one
      # file. The sentence above says both halves are shut, so the line hands
      # both back. ge_may_replace makes the same choice in the same words.
      ge_ck_fix "chmod u+rw $(ge_quote "$GE_CK_WB_PATH")"
      return 0
    fi
    if [ "$GE_CK_WB_WHY" = unwritable ]; then
      ge_ck_line FAIL lint "$GE_CK_WB_REL is read only, so nothing can be saved into it, $ge_ck_lnot"
      ge_ck_fix "chmod u+w $(ge_quote "$GE_CK_WB_PATH")"
      return 0
    fi
    # What is wrong, and what to do about it, both come from lib/blocks.sh, the
    # way ge remember and ge person take them. So the doctor names the fault in
    # the same words as the refusal the founder gets from the write itself,
    # rather than in a second wording they have to match up by hand.
    ge_ck_shape=$(block_problem "$GE_CK_WB_PATH" "$GE_CK_WB_NAME")
    ge_ck_line FAIL lint "$GE_CK_WB_REL ${ge_ck_shape%.}, so nothing can be saved into that section, $ge_ck_lnot"
    # WHICH ARROW, asked rather than assumed. Five of the seven shapes blocks.sh
    # knows have no command behind them: a marker line the founder deleted can
    # only be put back by them, in their editor, because only they know where
    # their own section stops. This leg used to print all seven behind "run:", so
    # the doctor's own report told a founder to paste "the same command again,
    # once ... is back on its own line in ...", which is not a program, and whose
    # marker punctuation a shell reads as a redirection. block_fix_kind exists to
    # tell the two apart, and it is the code that wrote the words, so this cannot
    # drift from them.
    ge_ck_bkind=$(block_fix_kind "$GE_CK_WB_PATH" "$GE_CK_WB_NAME")
    ge_ck_bfix=$(block_fix "$GE_CK_WB_PATH" "$GE_CK_WB_NAME")
    if [ "$ge_ck_bkind" = action ]; then
      ge_ck_fix_action "$ge_ck_bfix"
    else
      ge_ck_fix "$ge_ck_bfix"
    fi
    return 0
  fi
  # Asked after the three files above, which are opened by name and so are still
  # read here, and before ge lint is run at all.
  #
  # Most of what ge lint reports is about the people folder, and a folder whose
  # contents cannot be listed comes back as no contents. A person file that had
  # gone read only is a FAIL on this leg when the folder can be listed, and when
  # it cannot the same folder produced a NOTE about a warning count instead, with
  # the read only file nowhere in it. Worse, on a clean folder this leg then read
  # "ge lint ran and had no warnings about your files", which is a claim about
  # files it never saw. A SKIP and not a FAIL, because the people leg above names
  # this same folder and the command that clears it, and one fault answered twice
  # is a founder working down a list where two of the lines are the same line.
  if [ -d "$GE_CK_HOME/people" ] && { [ ! -r "$GE_CK_HOME/people" ] || [ ! -x "$GE_CK_HOME/people" ]; }; then
    ge_ck_line SKIP lint "the people folder cannot be listed, so your files could not be checked"
    return 0
  fi
  if [ ! -f "$GE_HOME_DIR/scripts/cmd/lint.sh" ]; then
    ge_ck_line SKIP lint "this build has no ge lint yet"
    return 0
  fi
  ge_ck_lout=$(sh "$GE_HOME_DIR/scripts/ge.sh" lint 2>/dev/null)
  ge_ck_lrc=$?
  # Lint exits non-zero only when it could not run at all. Counting warnings in
  # output that was never produced would report "no structural warnings" from no
  # evidence, which is a green tick over a check that did not happen.
  if [ "$ge_ck_lrc" -ne 0 ]; then
    ge_ck_line FAIL lint "ge lint could not run, so none of your files have been checked at all. Running it prints the reason it stopped"
    ge_ck_fix "ge lint"
    return 0
  fi
  # Anchored to the start of the line, because a warning is two lines and the
  # second one quotes the founder's own text back at them. A prospect called
  # WARNER, or a note about a warning, put an extra count on a number this leg
  # prints as evidence.
  ge_ck_warn=$(printf '%s\n' "$ge_ck_lout" | grep -c '^WARN')
  if [ "$ge_ck_warn" -eq 0 ]; then
    ge_ck_line PASS lint "ge lint ran and had no warnings about your files"
    return 0
  fi
  # Everything that reaches here is warn-only by design, so a warning count is
  # not a failure. It is not a pass either: this line used to read PASS and the
  # report ended two lines later on "Nothing to fix", with seven warnings sitting
  # between them.
  #
  # It counts them and says nothing about what they are. It used to call all of
  # them warnings about the shape of the founder's files, which is true of most
  # and not of all: ge lint also reports what is IN a file, and the sharpest of
  # those is somebody the founder stopped who is still on the outreach sheet.
  # Told that was shape, a founder reads cosmetic and emails them on the Monday.
  # This leg has not read the warnings, so it does not describe them.
  ge_ck_line NOTE lint "ge lint has $(ge_ck_plural "$ge_ck_warn" warning) about your files"
  ge_ck_fix "ge lint"
}

# One name from the ring, printed as "<stamp> <flat name>" when it is a backup
# and dropped when it is not. A name that is not <file>.<stamp> is not a backup
# of anything: a copy that stopped halfway leaves .ge-snapshot-tmp behind, and
# counting that would put a number in front of the founder that no restore can
# match. It is a function and not four lines inside the loop below, because bash
# 3.2 cannot parse a case statement inside $( ), and Git Bash still ships it.
ge_ck_pair() {                          # <bare name in the ring>
  case $1 in
    *.*) ;;
    *) return 0 ;;
  esac
  ge_ck_st=${1##*.}
  ge_ck_base=${1%.*}
  [ -n "$ge_ck_base" ] || return 0
  ge_snap_is_stamp "$ge_ck_st" || return 0
  printf '%s %s\n' "$ge_ck_st" "$ge_ck_base"
}

ge_ck_ring() {
  ge_ck_snap="$GE_CK_HOME/.state/snapshots"
  # A file sitting on that name is not a missing folder, and the two take
  # different moves. Both used to be answered with ge init, and ge init cannot
  # make a folder where a file already is: it stopped on something else
  # entirely, this leg said the same sentence again, and every write that needs
  # a backup refused the whole time and sent the founder back here. Told apart
  # the way the people leg tells them apart, and answered with a line they can
  # paste that deletes nothing, so putting the name back is one more paste.
  if [ ! -d "$ge_ck_snap" ] && [ -e "$ge_ck_snap" ]; then
    ge_ck_line FAIL snapshots ".state/snapshots is a file and not a folder, so the next rewrite has nowhere to back up to"
    ge_ck_fix "mv $(ge_quote "$ge_ck_snap") $(ge_quote "$ge_ck_snap-old") && $(ge_ck_reinit)"
    return 0
  fi
  if [ ! -d "$ge_ck_snap" ]; then
    ge_ck_line FAIL snapshots "there is no .state/snapshots folder, so the next rewrite has nowhere to back up to. ge init creates it and clobbers nothing"
    ge_ck_fix "$(ge_ck_reinit)"
    return 0
  fi
  # A folder whose contents cannot be listed comes back as no contents at all,
  # and this leg then said there were no backups, which is the sentence a founder
  # reads before deciding whether they can undo something. It said it with
  # backups sitting in the folder.
  if [ ! -r "$ge_ck_snap" ]; then
    ge_ck_line FAIL snapshots "the backup folder cannot be opened, so nothing here can say what has been backed up"
    ge_ck_fix "chmod u+rx $(ge_quote "$ge_ck_snap")"
    return 0
  fi
  # Same sweep as the write leg, for the same reason: the name carries the
  # process id of the run that made it, so nothing else would ever clear it.
  rm -f "$ge_ck_snap"/.ge-ring-probe.* 2>/dev/null
  ge_ck_probe="$ge_ck_snap/.ge-ring-probe.$$"
  ge_ck_rbody="ge ring probe $$"
  if ! { printf '%s\n' "$ge_ck_rbody" > "$ge_ck_probe"; } 2>/dev/null; then
    ge_ck_blocked snapshots "$ge_ck_snap" "every write that needs a backup will be refused"
    return 0
  fi
  # Read back before it is removed, the way the write leg reads its own two
  # canaries back. This leg used to write and walk away, which is the fault the
  # write leg was repaired for, and it was unguarded on the folder that holds
  # every backup a founder would ever restore from.
  ge_ck_rback=$(cat "$ge_ck_probe" 2>/dev/null)
  rm -f "$ge_ck_probe" 2>/dev/null
  if [ "$ge_ck_rback" != "$ge_ck_rbody" ]; then
    ge_ck_bad_readback snapshots "the backup folder"
    return 0
  fi
  if ! ge_ck_probe_gone "$ge_ck_snap"; then
    ge_ck_stuck_probe snapshots "the backup folder"
    return 0
  fi

  if ! command -v ge_snap_names >/dev/null 2>&1; then
    ge_ck_line FAIL snapshots "the backup folder is there and ge cannot read it, so this says nothing about what is in it. ge snapshot fails with the reason when the ring cannot be read"
    ge_ck_fix "ge snapshot ops-log.md"
    return 0
  fi

  # One line per backup, "<stamp> <flat name>", from snapshot.sh's own listing.
  ge_ck_pairs=$(ge_snap_names "$ge_ck_snap" | while IFS= read -r ge_ck_b; do
    ge_ck_pair "$ge_ck_b"
  done)
  ge_ck_pairs=$(printf '%s\n' "$ge_ck_pairs" | sed '/^$/d')
  ge_ck_total=$(printf '%s' "$ge_ck_pairs" | grep -c '')
  # Field 2 to the end, because a backed up file can have a space in its name
  # and only the stamp is guaranteed not to.
  ge_ck_bases=$(printf '%s\n' "$ge_ck_pairs" | cut -d' ' -f2- | sed '/^$/d')
  ge_ck_stamps=$(printf '%s\n' "$ge_ck_pairs" | cut -d' ' -f1 | sed '/^$/d')
  if [ "$ge_ck_total" -eq 0 ]; then
    # What it says is about the folder it just read, and nothing else. It used to
    # end "which means nothing of yours has been overwritten", which is a claim
    # about everything that has ever happened to the founder's files, made from
    # an empty folder. Where somebody had emptied the ring by hand it was flatly
    # untrue, and it is the sentence a founder reads before deciding whether they
    # can go back. What they can act on is the half this leg can prove.
    ge_ck_line PASS snapshots "the backup folder works and holds nothing yet, so there is nothing to go back to"
    return 0
  fi
  # LC_ALL=C on both, like every other ordering in this toolkit. uniq only
  # collapses neighbours, so it is only as good as the sort in front of it, and
  # the newest stamp is picked by taking the last line of a sorted list. Neither
  # is safe to leave reading whatever collation the machine happens to be set
  # to: these two were the last orderings in the tree still doing that, and the
  # answer a founder reads in the doctor is a count and a date.
  ge_ck_files=$(printf '%s' "$ge_ck_bases" | sed '/^$/d' | LC_ALL=C sort | LC_ALL=C uniq | grep -c '')
  ge_ck_new=$(printf '%s' "$ge_ck_stamps" | sed '/^$/d' | LC_ALL=C sort | sed -n '$p')
  ge_ck_line PASS snapshots "$(ge_ck_plural "$ge_ck_total" backup) of $(ge_ck_plural "$ge_ck_files" file), newest $(ge_ck_stamp_pretty "$ge_ck_new")"
}

ge_ck_log() {
  ge_ck_log_f="$GE_CK_HOME/ops-log.md"
  ge_ck_mark_f="$GE_CK_HOME/.state/log.bytes"
  # Asked before "is it there". A folder on that name reads as a missing log,
  # and the line for a missing log is a restore, which cannot write over it.
  ge_ck_not_a_file log "$ge_ck_log_f" "nothing can be added to your ops log" && return 0
  if [ ! -f "$ge_ck_log_f" ]; then
    # The ring is asked BEFORE a restore is named, the way the index leg asks it.
    #
    # ge only ever ADDS to the ops log, so it takes no backup of it: ge log says
    # exactly that itself when it finds the file has shrunk. So on almost every
    # folder there is nothing at all to restore, and this leg named ge restore
    # ops-log.md every time. The founder ran the doctor, ran the line, was told
    # there are no backups of it, ran the doctor and read the same line again,
    # for ever. The one way a backup of it exists is a founder who ran ge
    # snapshot ops-log.md by hand, so the ring is asked rather than assumed in
    # either direction.
    ge_ck_backup_state ops-log.md
    ge_ck_lbk=$?
    if [ "$ge_ck_lbk" -eq 0 ]; then
      ge_ck_line FAIL log "ops-log.md is missing, and it is the only full record of what you did. There is a backup of it, so ge restore puts that copy back"
      ge_ck_fix "ge restore ops-log.md"
      return 0
    fi
    if [ "$ge_ck_lbk" -eq 2 ]; then
      ge_ck_line FAIL log "ops-log.md is missing, and it is the only full record of what you did. Nothing here can say whether there is a backup of it, because the backup folder cannot be listed"
      ge_ck_fix "$(ge_ck_ring_open)"
      return 0
    fi
    ge_ck_line FAIL log "ops-log.md is missing, and it is the only full record of what you did. ge only adds to the log, so it keeps no backup of it, and what was in it is gone unless you have a copy of your own. ge init writes an empty one and changes nothing else"
    ge_ck_fix "$(ge_ck_reinit)"
    return 0
  fi
  # The only file ge adds to rather than replaces, so it is the one place where
  # the file's own permission, and not the folder's, decides whether an entry
  # can be written. ge log refuses every entry into a read only ops log and
  # names this same chmod, and this leg used to measure the size and the mark
  # and report PASS over it, three lines above "Nothing to fix". Nothing else in
  # the doctor asks whether any of the founder's own FILES can be written: the
  # write leg probes the two folders, and a folder that takes a write says
  # nothing at all about a file inside it that will not.
  if [ ! -w "$ge_ck_log_f" ]; then
    ge_ck_line FAIL log "ops-log.md is read only, so ge log cannot add anything to it and every entry you write is refused"
    # u+rw. On a log at 444 this is the same command. On one at 000, u+w handed
    # the write bit back and the size read two lines down then refused with
    # u+r, so the founder pasted twice and ran the doctor three times over one
    # file. ge_may_replace makes the same choice for the same reason.
    ge_ck_fix "chmod u+rw $(ge_quote "$ge_ck_log_f")"
    return 0
  fi
  # Guarded the same way the mark below is. A log that is there and cannot be
  # opened gives an empty count, which makes the shortening test a comparison on
  # a value that is not a number, so the test is skipped and the leg ends on a
  # PASS that names no size at all. Read raw first for exactly that reason: a
  # count taken through a pipe reads as zero when the file could not be opened.
  ge_ck_raw_b=$(wc -c 2>/dev/null < "$ge_ck_log_f" | tr -d ' ')
  case ${ge_ck_raw_b:-x} in
    ''|*[!0-9]*)
      ge_ck_line FAIL log "ops-log.md is there and its size could not be read, so nothing here can tell you whether it has been shortened"
      ge_ck_fix "chmod u+r $(ge_quote "$ge_ck_log_f")"
      return 0 ;;
  esac
  # Counted the way ge log writes the mark, which leaves carriage returns out.
  # Two different counts compared against each other is not a measurement, and
  # the answer it gave was that the founder's only full record had been cut.
  ge_ck_now_b=$(tr -d '\r' 2>/dev/null < "$ge_ck_log_f" | wc -c | tr -d ' ')
  case ${ge_ck_now_b:-x} in
    ''|*[!0-9]*) ge_ck_now_b=$ge_ck_raw_b ;;
  esac
  # Asked before "is the mark there", for the same reason the log file itself is.
  # A folder sitting on the name of the mark reads as no mark at all to the test
  # below, and that line then promises ge log will write one on the first entry.
  # ge log cannot write a file where a folder already is: it goes on adding
  # entries and reporting success, the mark never lands, and the shortening test
  # further down, which is the only reason this leg exists, is switched off for
  # ever while the report says it is about to start.
  ge_ck_not_a_file log "$ge_ck_mark_f" "nothing here can tell you whether your ops log has been shortened" && return 0
  if [ ! -f "$ge_ck_mark_f" ]; then
    ge_ck_line SKIP log "ops-log.md is $ge_ck_now_b bytes and has no mark yet, ge log writes one on the first entry"
    return 0
  fi
  # Guarded like the two reads above it. A mark that cannot be opened must not
  # put the shell's own sentence, naming a file inside this toolkit, in the
  # middle of the report; the case below reads it as unreadable and says so.
  ge_ck_mark_b=$(tr -d '\r' 2>/dev/null < "$ge_ck_mark_f" | sed -n '1p' | tr -d ' ')
  case "$ge_ck_mark_b" in
    ''|*[!0-9]*)
      ge_ck_line FAIL log ".state/log.bytes reads \"$ge_ck_mark_b\", which is not a byte count, so ops-log.md cannot be checked. One more entry writes a fresh mark"
      ge_ck_fix "ge log note \"checked the log\""
      return 0 ;;
  esac
  if [ "$ge_ck_now_b" -lt "$ge_ck_mark_b" ]; then
    ge_ck_entries=$(grep -c '^- ' "$ge_ck_log_f" 2>/dev/null | tr -d ' ')
    case ${ge_ck_entries:-x} in ''|*[!0-9]*) ge_ck_entries=0 ;; esac
    ge_ck_ln=$(grep -c '' "$ge_ck_log_f" 2>/dev/null | tr -d ' ')
    case ${ge_ck_ln:-x} in ''|*[!0-9]*) ge_ck_ln=0 ;; esac
    # A mark written by an older build counted the carriage returns, so a file
    # that has since lost one off the end of every line reads smaller by a byte
    # a line while holding every word it held before. That was called a
    # shortened log and answered with a restore, which would have replaced the
    # log with an older copy and destroyed the entries written since.
    if [ $((ge_ck_now_b + ge_ck_ln)) -ge "$ge_ck_mark_b" ]; then
      ge_ck_line NOTE log "ops-log.md is $ge_ck_now_b bytes and the mark says $ge_ck_mark_b, a gap the line endings alone can account for, and it still holds $(ge_ck_plural "$ge_ck_entries" entry entries). One more entry writes a fresh mark"
      ge_ck_fix "ge log note \"checked the log\""
      return 0
    fi
    # The same question the missing branch asks, for the same reason. ge keeps no
    # backup of a file it only adds to, so on almost every folder ge restore
    # ops-log.md refuses and this line came back unchanged run after run. The
    # sentence and the arrow are picked from the answer together, so what a
    # founder reads and what they paste can never say two different things.
    ge_ck_backup_state ops-log.md
    ge_ck_lbk=$?
    ge_ck_short="ops-log.md is $ge_ck_now_b bytes and the mark says $ge_ck_mark_b, so the log has been shortened. It holds $(ge_ck_plural "$ge_ck_entries" entry entries) now"
    if [ "$ge_ck_lbk" -eq 0 ]; then
      ge_ck_line FAIL log "$ge_ck_short. There is a backup of it, so ge restore puts that copy back"
      ge_ck_fix "ge restore ops-log.md"
      return 0
    fi
    if [ "$ge_ck_lbk" -eq 2 ]; then
      ge_ck_line FAIL log "$ge_ck_short. Nothing here can say whether there is a backup of it, because the backup folder cannot be listed"
      ge_ck_fix "$(ge_ck_ring_open)"
      return 0
    fi
    # Nothing ge has can put the words back, so the line says so and then names
    # the only thing ge can do about it: mark the size the file is now, which is
    # what stops this being reported every day over a log the founder trimmed
    # themselves. Their own copy comes first in the sentence, because pasting the
    # line settles for the shorter file.
    ge_ck_line FAIL log "$ge_ck_short. ge only adds to the log, so it keeps no backup of it to put back. If you have a copy of your own, put it there first. This marks the size it is now"
    ge_ck_fix "ge log note \"trimmed the log\""
    return 0
  fi
  ge_ck_line PASS log "ops-log.md is $ge_ck_now_b bytes, never below the $ge_ck_mark_b it was marked at"
}

# The setup receipt records PASS, FAIL or SKIP for every check the setup skill
# ran. Nothing anywhere read those words, so a receipt saying the GoHighLevel
# token had been rejected sat beside a report saying the token was good for
# another three months.
ge_ck_receipt() {
  ge_ck_r="$GE_CK_HOME/.state/receipt.md"
  # Asked before "is it there", and this is the one where reading it as absent
  # was worst: absent is a SKIP, so a folder on that name left ge receipt set
  # refusing every result while the report ended on "Nothing to fix".
  ge_ck_not_a_file receipt "$ge_ck_r" "nothing can record what your setup checks found" && return 0
  if [ ! -f "$ge_ck_r" ]; then
    ge_ck_line SKIP receipt "no setup receipt yet, so nothing has recorded what your setup checks found"
    return 0
  fi
  # A receipt that cannot be opened has no results this can read, which is not
  # the same as having none. Read as none, a receipt recording a rejected
  # GoHighLevel token was reported as a receipt with nothing in it yet.
  if [ ! -r "$ge_ck_r" ]; then
    ge_ck_line FAIL receipt "the setup receipt cannot be opened, so nothing here can tell you what your setup checks found"
    # u+rw, so a receipt at 000 takes one paste and not two. The write test
    # below would otherwise refuse on the next run, over the same file.
    ge_ck_fix "chmod u+rw $(ge_quote "$ge_ck_r")"
    return 0
  fi
  # Asked before a single result is counted out of it. ge receipt set writes a
  # new receipt beside the old one and moves it over the top, and a file set read
  # only refuses that move, so the setup skill can record nothing at all. This
  # leg read the results that were already in the file, found none of them
  # failing and printed PASS over a receipt nothing can ever write to again, and
  # the closing line then read "Nothing to fix". The log leg asks this same
  # question of ops-log.md in the same position. What is written in the receipt
  # is reported as soon as the file can be written again.
  if [ ! -w "$ge_ck_r" ]; then
    ge_ck_line FAIL receipt "the setup receipt is read only, so ge receipt set cannot write to it and nothing your setup checks find can be recorded"
    ge_ck_fix "chmod u+w $(ge_quote "$ge_ck_r")"
    return 0
  fi
  # A result is a name, then one of the three words. The sentences in the file's
  # own header start with a word and carry on with prose, so none of them can be
  # read as a result by accident.
  ge_ck_all_n=$(tr -d '\r' 2>/dev/null < "$ge_ck_r" | awk '
    $1 ~ /^[A-Za-z0-9_.-]+$/ && ($2 == "PASS" || $2 == "FAIL" || $2 == "SKIP") { n = n + 1 }
    END { print n + 0 }
  ')
  case ${ge_ck_all_n:-x} in ''|*[!0-9]*) ge_ck_all_n=0 ;; esac
  if [ "$ge_ck_all_n" -eq 0 ]; then
    ge_ck_line SKIP receipt "the setup receipt has no results in it yet"
    return 0
  fi
  ge_ck_bad=$(tr -d '\r' 2>/dev/null < "$ge_ck_r" | awk '
    $1 ~ /^[A-Za-z0-9_.-]+$/ && $2 == "FAIL" { print $1 }
  ' | sed '/^$/d')
  ge_ck_bad_n=$(printf '%s' "$ge_ck_bad" | grep -c '')
  if [ "$ge_ck_bad_n" -gt 0 ]; then
    ge_ck_bad_names=$(printf '%s\n' "$ge_ck_bad" | sed -n '1,3p' | tr '\n' ' ' | sed 's/  *$//')
    ge_ck_line FAIL receipt "your setup recorded $(ge_ck_plural "$ge_ck_bad_n" check) as failing: $ge_ck_bad_names. Running your setup again runs those checks and records what it finds"
    ge_ck_fix_action "take the setup step again"
    return 0
  fi
  ge_ck_line PASS receipt "$(ge_ck_plural "$ge_ck_all_n" result) recorded, none of them a failure"
}

ge_ck_token() {
  ge_ck_r="$GE_CK_HOME/.state/receipt.md"
  if [ ! -f "$ge_ck_r" ]; then
    # Something on that name that is not a plain file is not the same fact as no
    # receipt at all, and this said the same sentence about both. Over a folder
    # sitting on the name it read "no day has been recorded", which is a
    # statement about what is written in a file nothing here ever opened. The
    # receipt leg above names that folder and the command that moves it aside, so
    # this one says only the part it can stand behind.
    if [ -e "$ge_ck_r" ]; then
      ge_ck_line SKIP token "nothing here can say when your GoHighLevel token runs out until the setup receipt is a file again"
      return 0
    fi
    ge_ck_line SKIP token "no day has been recorded for your GoHighLevel token yet"
    return 0
  fi
  # The receipt leg above carries the fix for a receipt that will not open, so
  # this one says what it cannot answer and leaves it at that. One problem gets
  # one fix, or a founder is working down a list where two lines are the same line.
  if [ ! -r "$ge_ck_r" ]; then
    ge_ck_line SKIP token "nothing here can say when your token runs out until the setup receipt can be opened"
    return 0
  fi
  # Trailing spaces go, inner ones stay: the evidence has to quote what the
  # file actually says, or a founder cannot find the line being complained about.
  ge_ck_pit=$(tr -d '\r' 2>/dev/null < "$ge_ck_r" | sed -n 's/^pit_created  *//p' | sed -n '1p' | sed 's/  *$//')
  if [ -z "$ge_ck_pit" ]; then
    ge_ck_line SKIP token "the receipt does not say which day your GoHighLevel token was made"
    return 0
  fi
  ge_ck_pe=$(iso_to_epoch "$ge_ck_pit")
  if [ -z "$ge_ck_pe" ]; then
    ge_ck_line FAIL token "the receipt says the token was made on $ge_ck_pit, which is not a date this can read"
    # A gap in angle brackets, the way every other line in this toolkit marks
    # one, rather than an English clause after the command: only the founder
    # knows the day, and a made up example day would be a wrong date written
    # into their receipt by a line ge told them to paste.
    ge_ck_fix "ge receipt set pit-created <the day you made the token>"
    return 0
  fi
  ge_ck_age=$(( ($(now_epoch) - ge_ck_pe) / 86400 ))
  ge_ck_end=$(ge_ck_day_after "$ge_ck_pe" 90)
  # A day that has not happened yet is a mistyped year, and it holds the 90 day
  # warning off for as long as the mistake stands. It used to be a pass reading
  # "-1223 days ago", which is both a lie and a number that means nothing.
  if [ "$ge_ck_age" -lt 0 ]; then
    ge_ck_line FAIL token "the receipt says the token was made on $ge_ck_pit, which has not happened yet, so nothing here can say when it runs out"
    ge_ck_fix "ge receipt set pit-created <the day you really made it>"
    return 0
  fi
  # Past ninety the token has already stopped. Said in the present tense it read
  # as a warning about something still to come, on a date months behind us.
  if [ "$ge_ck_age" -gt 90 ]; then
    ge_ck_line FAIL token "your GoHighLevel token was made on $ge_ck_pit, $ge_ck_age days ago. They last 90 days, so this one stopped working on $ge_ck_end. The doctor step makes a new one and records the new day"
    ge_ck_fix_action "take the doctor step next"
    return 0
  fi
  if [ "$ge_ck_age" -gt 80 ]; then
    ge_ck_line FAIL token "your GoHighLevel token was made on $ge_ck_pit, $ge_ck_age days ago, and it stops working on $ge_ck_end. The doctor step makes a new one and records the new day"
    ge_ck_fix_action "take the doctor step next"
    return 0
  fi
  ge_ck_line PASS token "made on $ge_ck_pit, $ge_ck_age days ago, and the 90 days run out on $ge_ck_end"
}

ge_ck_main() {
  if [ "$#" -gt 0 ]; then
    printf 'FAIL  ge check takes no arguments, and it was given "%s".\n' "$1" >&2
    printf '      → run: ge check\n' >&2
    return 1
  fi

  ge_ck_home_list=$(ge_find_home)
  ge_ck_rc=$?
  # The shared refusal in lib/paths.sh, not one written here, for the same
  # reason the scatter one below is shared: thirteen verbs had six sentences
  # between them for this single state, and most of them named a search
  # narrower than the one ge_find_home actually runs.
  if [ "$ge_ck_rc" -eq 1 ]; then
    ge_nofolder_refusal fail
    return 1
  fi
  # The shared refusal, so this says what every other verb says. It used to send
  # the founder to run ge check from inside the folder they wanted, which is
  # where they already were, and the same message came back for ever.
  if [ "$ge_ck_rc" -eq 2 ]; then
    ge_scatter_refusal "$ge_ck_home_list"
    return 1
  fi
  GE_CK_HOME=$ge_ck_home_list

  printf 'Your Launchhouse folder, checked\n\n'

  ge_ck_anchor
  ge_ck_write
  ge_ck_index
  ge_ck_people
  ge_ck_lint
  ge_ck_ring
  ge_ck_log
  ge_ck_receipt
  ge_ck_token

  printf '\n%s checks ran. %s failed' "$GE_CK_RUN" "$GE_CK_FAILED"
  [ "$GE_CK_NOTED" -gt 0 ] && printf ', %s to look at' "$GE_CK_NOTED"
  printf '.\n'
  if [ "$GE_CK_FAILED" -gt 0 ]; then
    printf 'Work down the fixes in order. The first one often clears the rest.\n'
    return 1
  fi
  if [ "$GE_CK_NOTED" -gt 0 ]; then
    printf 'Nothing is broken. The lines marked NOTE are worth a minute when you have one.\n'
    return 0
  fi
  printf 'Nothing to fix.\n'
}

ge_ck_main "$@"
