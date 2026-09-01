#!/bin/sh
# 31-permission-modes.sh: the same refusal at every permission a folder can be in.
#
# WHY IT EXISTS: every permission case in this suite before today took the write
#                bit off with chmod a-w. On a folder at 755 that leaves 555, and
#                555 KEEPS THE SEARCH BIT. A folder that can still be entered is
#                the one shape where "chmod u+w" happens to be enough, so the
#                whole family of ways out that hand back half of what was taken
#                was invisible to six thousand checks. The file half is the same
#                accident the other way round: chmod a-r on a file at 644 leaves
#                200, which KEEPS THE WRITE BIT, and 200 is the one file mode
#                where "chmod u+r" happens to be enough.
#
#                A sync client does not stop at 555. iCloud Drive and OneDrive
#                both hand a folder back with no search bit while they reconcile,
#                and a founder who has been told to protect a file holding real
#                people's names types chmod 000 and not chmod 444. So this case
#                drives four folder modes and three file modes:
#
#                  555  read and search, no write   the old fixture, and the easy one
#                  500  the same again for the owner
#                  400  read only, no search        names can be listed, nothing opened
#                  000  nothing at all
#                  444  a file that reads and will not take a write
#                  200  a file that writes and will not open to read
#                  000  a file that does neither
#
#                and it does to each of them what 30-recovery-runs does well: it
#                takes the command out of the last line, runs it the way a
#                founder pastes it, and then runs the command that failed again
#                and requires it to go through. A SECOND REFUSAL IS A DEFECT.
# CALLED BY:     tests/run.sh
# READS:         nothing              WRITES: tests/.work/<shell>/31-permission-modes/
# POSTURE:       fail-closed. The machine is asked, first, whether all four bits
#                mean anything here, and the case ends outright if any of them
#                does not: a run as root, or a Windows drive under Git Bash,
#                proves none of this, and a suite that goes green on checks it
#                never ran is worth less than no suite. Every path then proves
#                its own condition is really there before it reads a word of the
#                answer, so no path can pass on a chmod that quietly did nothing.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. No arrays, no local. The
#                permissions are put back after every path, and put back with
#                u+rwX rather than u+w, because u+w on a folder with no search
#                bit cannot be applied to what is inside it and leaves a sandbox
#                that nothing can delete.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
#
# WHY THE FOLDER IS NAMED THE WAY IT IS. Half the folders in this programme are
# named after a business, so they carry a space, and the other three characters
# here are one keystroke away from it. Every line this case reads names a folder,
# so naming the sandbox plainly would prove the quoting only in the conditions
# where quoting cannot go wrong. That was one of the two accidents this case
# exists to stop repeating.
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
. "$TESTS/lib/recovery.sh"

t_start 31-permission-modes
rl_setup "$SANDBOX/.ge-bin"

# A backslash built from a variable rather than typed with an escape, so one
# backslash is what reaches the filesystem under every shell that reads this file.
PM_BS='\'
PM_ROOT="$SANDBOX/Ana's [own] back${PM_BS}slash folder"
PM_DRIVEN=0
PM_FEED=/dev/null

rl_watch "$PM_ROOT"

# One line a founder would type, for the verb that reads what is typed at it.
# Made here, before anything is driven, because a path that reads it runs long
# before the report section at the foot of this file.
printf 'saw your reel about slow mornings\n' > "$CASEWORK/typed-line.txt" \
  || t_die "the file standing in for what a founder types could not be made." "chmod u+w $CASEWORK"

# ---------------------------------------------------------------- putting it back

# pm_open: every permission in the sandbox handed back.
#
# u+rwX and not u+w. chmod walks a tree by entering each folder, so adding the
# write bit alone to a folder at 000 gives it 200, chmod itself cannot then read
# what is inside, and rm has the same problem afterwards. The sandbox is left
# behind and nothing on the machine can remove it. Proved rather than assumed:
# chmod -R u+w over a tree holding a folder at 000 reports Permission denied and
# rm -rf then fails on the same folder. X adds the search bit to folders and
# leaves ordinary files alone, which is exactly the difference.
pm_open() {
  chmod -R u+rwX "$PM_ROOT" 2>/dev/null
  return 0
}

# pm_die: the case cannot produce a result. The permissions go back first, or a
# case that ends here leaves a folder the suite cannot clean up.
pm_die() {                              # <what went wrong> <the command that fixes it>
  pm_open
  t_die "$1" "$2"
}

# ---------------------------------------------------------- does this machine bite

# Four questions, and every path below rests on all four. Asked once, here, and
# answered by trying rather than by reading a mode back, because the mode reads
# the same on a machine that ignores it. A run as root ignores all four. A drive
# that does not carry permissions ignores all four. On either of those this case
# is not testing anything, and saying so is the only honest answer.
PM_PROBE="$SANDBOX/probe"
rm -rf "$PM_PROBE"
mkdir -p "$PM_PROBE/inside" || t_die "the folder that checks this machine could not be made." \
  "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
printf 'x\n' > "$PM_PROBE/inside/file.md" || t_die "the file that checks this machine could not be made." \
  "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"

pm_probe_die() {                        # <which bit meant nothing>
  chmod -R u+rwX "$PM_PROBE" 2>/dev/null
  rm -rf "$PM_PROBE"
  t_die "$1, so nothing in this case can be proved on this machine." \
        "sh tests/run.sh as your own user, on a drive that carries permissions"
}

chmod 555 "$PM_PROBE/inside" || t_die "a folder here would not change permissions." "ls -ld $PM_PROBE/inside"
if { true > "$PM_PROBE/inside/probe-a"; } 2>/dev/null; then
  rm -f "$PM_PROBE/inside/probe-a"
  pm_probe_die "this machine still writes into a folder with the write bit off"
fi
t_pass

chmod 400 "$PM_PROBE/inside" || t_die "a folder here would not change permissions." "ls -ld $PM_PROBE/inside"
# The search bit, and not the read bit. Entering a folder is what a rename into
# it and a read of a file inside it both need, and 555 leaves it on.
if ( cd "$PM_PROBE/inside" ) 2>/dev/null; then
  pm_probe_die "this machine still enters a folder with the search bit off"
fi
t_pass

chmod 755 "$PM_PROBE/inside" || t_die "a folder here would not change permissions." "ls -ld $PM_PROBE/inside"
chmod 000 "$PM_PROBE/inside/file.md" || t_die "a file here would not change permissions." "ls -l $PM_PROBE/inside/file.md"
if { cat "$PM_PROBE/inside/file.md"; } > /dev/null 2>&1; then
  pm_probe_die "this machine still reads a file with the read bit off"
fi
t_pass

chmod 444 "$PM_PROBE/inside/file.md" || t_die "a file here would not change permissions." "ls -l $PM_PROBE/inside/file.md"
if { printf 'y\n' >> "$PM_PROBE/inside/file.md"; } 2>/dev/null; then
  pm_probe_die "this machine still writes to a file with the write bit off"
fi
t_pass

chmod -R u+rwX "$PM_PROBE" 2>/dev/null
rm -rf "$PM_PROBE"

# ---------------------------------------------------------------- the folder

# One founder's folder, built once and copied back before every path, because
# running a recovery line changes it and the next path has to start from the
# same place. The anchor inside the copy already names the folder it is copied
# into, so nothing has to be rewritten afterwards.
pm_build() {
  mkdir -p "$PM_ROOT/work" || pm_die "the sandbox folder could not be made." \
    "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
  cd "$PM_ROOT/work" || pm_die "the work folder is not there." "sh tests/run.sh again"
  HOME="$PM_ROOT/work"
  export HOME
  sh "$GE" init > /dev/null 2>&1 || pm_die "ge init failed inside the sandbox." "sh tests/run.sh again"
  sh "$GE" person add prospect sam@northfield.io "Sam Carter" > /dev/null 2>&1 \
    || pm_die "the prospect could not be added." "sh tests/run.sh again"
  sh "$GE" person add target ig helen.makes "Helen Okafor" > /dev/null 2>&1 \
    || pm_die "the target could not be added." "sh tests/run.sh again"
  sh "$GE" ledger add-content 1 1 short-post text > /dev/null 2>&1 \
    || pm_die "the content piece could not be added." "sh tests/run.sh again"
  printf 'C1 short-post\n\nThe first line of the first post.\n' > growth-engine/content-30.md \
    || pm_die "the words file could not be written." "chmod u+w $PM_ROOT/work"
  # One backup, so the backup folder has something in it and ge restore has
  # something to find once that folder can be opened again.
  sh "$GE" snapshot memory.md > /dev/null 2>&1 \
    || pm_die "memory.md could not be backed up." "sh tests/run.sh again"
  sh "$GE" index > /dev/null 2>&1 || pm_die "the index could not be built." "sh tests/run.sh again"
  cd "$PM_ROOT" || pm_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$PM_ROOT/tmpl"
  mkdir -p "$PM_ROOT/tmpl" || pm_die "the copy folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cp -Rp "$PM_ROOT/work/growth-engine" "$PM_ROOT/tmpl/growth-engine" \
    || pm_die "the copy this case starts every path from could not be made." \
              "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
}

pm_stage() {
  pm_open
  cd "$PM_ROOT" || pm_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$PM_ROOT/work"
  mkdir -p "$PM_ROOT/work" || pm_die "the work folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cp -Rp "$PM_ROOT/tmpl/growth-engine" "$PM_ROOT/work/growth-engine" \
    || pm_die "the folder could not be put back for the next path." "df -h ${TMPDIR:-/tmp}"
  cd "$PM_ROOT/work" || pm_die "the work folder is not there." "sh tests/run.sh again"
  HOME="$PM_ROOT/work"
  export HOME
}

# ------------------------------------------------------- the condition is really on

# pm_bit_gone <path> <mode>: the thing this path is built on is actually true of
# this folder or this file, right now.
#
# WHY EVERY PATH ASKS AND NOT ONLY THE MACHINE PROBE ABOVE. A chmod that silently
# did nothing, a mode written wrongly in the list below, or an argument naming a
# path that is not the one meant, would each leave the command succeeding and the
# path reporting a pass for a refusal that never happened. The probe at the top
# says the machine can hold a permission. This says this path is holding one.
#
# A folder and a file are asked different questions, because they lose different
# things, and asking a file whether it takes a new file inside it would be a
# check claiming more than it examined.
pm_bit_gone() {                         # <path> <mode>
  if [ -d "$1" ]; then
    if { true > "$1/.ge-test-probe"; } 2>/dev/null; then
      rm -f "$1/.ge-test-probe"
      pm_die "$1 still takes a new file at mode $2, so this path is not testing what it says." \
             "ls -ld $1"
    fi
    t_pass
    case $2 in
      400|000)
        # The half chmod a-w never took away, and the half every second refusal
        # in this family turned on.
        if ( cd "$1" ) 2>/dev/null; then
          pm_die "$1 can still be entered at mode $2, so this path is not testing what it says." \
                 "ls -ld $1"
        fi
        t_pass ;;
    esac
    return 0
  fi
  case $2 in
    444|000)
      if { printf 'x\n' >> "$1"; } 2>/dev/null; then
        pm_die "$1 still takes a write at mode $2, so this path is not testing what it says." \
               "ls -l $1"
      fi
      t_pass ;;
  esac
  case $2 in
    200|000)
      if { cat "$1"; } > /dev/null 2>&1; then
        pm_die "$1 can still be opened to read at mode $2, so this path is not testing what it says." \
               "ls -l $1"
      fi
      t_pass ;;
  esac
  return 0
}

# ---------------------------------------------------------------- the driver

# pm_drive <clears|unblocks> <what to change> <mode> <label> <ge arguments...>
#
#   clears    the command refuses, the line in the last row is run, and the same
#             command is then run again and has to go through. This is the whole
#             promise: one refusal, one line, done.
#   unblocks  the same, except the command still has nothing to do afterwards for
#             a reason that is not a permission. What is proved there is that the
#             refusal that comes back is a different one, so the founder is not
#             reading the same wall twice.
#
# PM_FEED names the file the command reads, for the verbs that read what a
# founder types. It is put back to /dev/null after every call, so it can never
# leak into the next path, and it is never the terminal, so a line that waits for
# typing ends rather than wedging the run.
pm_drive() {                            # <kind> <target> <mode> <label> <ge arguments...>
  pm_kind=$1
  pm_tgt=$2
  pm_mode=$3
  pm_label=$4
  shift 4
  case $pm_kind in
    clears|unblocks) true ;;
    *) pm_die "31-permission-modes was given a kind it does not know: $pm_kind." \
              "grep -n pm_drive tests/cases/31-permission-modes.sh" ;;
  esac
  pm_feed=$PM_FEED
  PM_FEED=/dev/null
  PM_DRIVEN=$((PM_DRIVEN + 1))

  pm_stage
  pm_path="$PM_ROOT/work/growth-engine"
  [ "$pm_tgt" = . ] || pm_path="$pm_path/$pm_tgt"
  [ -e "$pm_path" ] || pm_die "$pm_label names $pm_path and there is nothing there." \
    "grep -n pm_drive tests/cases/31-permission-modes.sh"
  chmod "$pm_mode" "$pm_path" || pm_die "$pm_path would not change to mode $pm_mode." \
    "ls -ld $pm_path"
  pm_bit_gone "$pm_path" "$pm_mode"

  sh "$GE" "$@" < "$pm_feed" > "$CASEWORK/out" 2>&1
  pm_rc=$?
  pm_first=$(rl_first_line "$CASEWORK/out")
  pm_last=$(rl_last_line "$CASEWORK/out")

  # It refuses. A path that quietly starts succeeding is a path that proves
  # nothing from here down, and it would leave this case passing on one fewer
  # piece of evidence every time.
  if [ "$pm_rc" -eq 0 ]; then
    t_note "$pm_label: it did not fail"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$pm_label: exited 0, so this path no longer refuses"
    pm_open
    return 0
  fi
  t_pass

  # Every arrow in the message, each held to the rule for the shape it is, and
  # then the last line, which is the one a founder's eye lands on.
  rl_every_arrow "$CASEWORK/out" "$pm_label"
  rl_arrow "$pm_last"
  if [ "$RL_FORM" != run ]; then
    t_note "$pm_label: a permission was taken away and no command was offered"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    printf 'ge can name the chmod that hands this back, so a bare arrow here leaves\n' \
      >> "$CASEWORK/diff.txt"
    printf 'the founder to work the command out for themselves\n' >> "$CASEWORK/diff.txt"
    t_fail "$pm_label: ends [$pm_last]"
    pm_open
    return 0
  fi
  t_pass

  # The folder name comes back in one piece, and nothing but the command is on
  # the line a founder selects.
  rl_quoted "$RL_AFTER" "$pm_label"
  rl_tail_free "$RL_AFTER" "$pm_label"
  pm_cmd=$(rl_part cmd "$RL_AFTER")

  # Run it, here, the way a founder pastes it.
  rl_exec "$pm_cmd" /dev/null
  if [ "$RL_RC" -ne 0 ] || grep -q '^FAIL' "$CASEWORK/recovery.out"; then
    t_note "$pm_label: the way out does not run"
    printf 'the refusal opened:\n  %s\n' "$pm_first" >> "$CASEWORK/diff.txt"
    printf 'and ended:\n  → run: %s\n' "$RL_AFTER" >> "$CASEWORK/diff.txt"
    printf 'the command in it:\n  %s\n' "$pm_cmd" >> "$CASEWORK/diff.txt"
    printf 'running that exited %s and said:\n' "$RL_RC" >> "$CASEWORK/diff.txt"
    sed 's/^/  /' "$CASEWORK/recovery.out" >> "$CASEWORK/diff.txt"
    # AND TO THE LOG, WHICH IS THE ONLY PLACE THAT SURVIVES A RUNNER.
    #
    # Everything above goes into diff.txt, and on GitHub that file is gone before
    # the artifact step looks for it: the run of 1 September reported "No files
    # were found with the provided path: tests/.work/" while the failure line was
    # telling a reader to cat a file inside it. So the log said this case failed
    # and would not say why, three times, on every push since 29 August.
    #
    # The three lines below are the whole diagnosis: what ge offered the founder,
    # what happened when it ran, and what it said. Cheap, and only ever printed on
    # a failure that is already stopping the build.
    printf '      the way out ge printed: %s\n' "$pm_cmd" >&2
    printf '      running it exited %s and it said:\n' "$RL_RC" >&2
    sed 's/^/        /' "$CASEWORK/recovery.out" >&2
    printf '      HOME was: %s\n' "${HOME:-<unset>}" >&2
    t_fail "$pm_label: the way out exits $RL_RC"
    pm_open
    return 0
  fi
  t_pass

  sh "$GE" "$@" < "$pm_feed" > "$CASEWORK/again.out" 2>&1
  pm_again=$?
  pm_again_first=$(rl_first_line "$CASEWORK/again.out")
  if [ "$pm_kind" = clears ]; then
    if [ "$pm_again" -eq 0 ]; then
      t_pass
    else
      t_note "$pm_label: the way out ran and the founder is refused a second time"
      printf 'the mode was    : %s on %s\n' "$pm_mode" "$pm_path" >> "$CASEWORK/diff.txt"
      printf 'it first said   : %s\n' "$pm_first" >> "$CASEWORK/diff.txt"
      printf 'the way out was : %s\n' "$pm_cmd" >> "$CASEWORK/diff.txt"
      printf 'and the same command then exited %s and said:\n' "$pm_again" >> "$CASEWORK/diff.txt"
      sed 's/^/  /' "$CASEWORK/again.out" >> "$CASEWORK/diff.txt"
      t_fail "$pm_label: a second refusal, and the same command still exits $pm_again"
    fi
  else
    if [ "$pm_again_first" != "$pm_first" ]; then
      t_pass
    else
      t_note "$pm_label: the way out ran and the same refusal came back"
      printf 'the mode was    : %s on %s\n' "$pm_mode" "$pm_path" >> "$CASEWORK/diff.txt"
      printf 'both times      : %s\n' "$pm_first" >> "$CASEWORK/diff.txt"
      printf 'the way out was : %s\n' "$pm_cmd" >> "$CASEWORK/diff.txt"
      t_fail "$pm_label: the same refusal comes back word for word"
    fi
  fi

  pm_open
  return 0
}

pm_build

# ------------------------------------------------- the people folder, four modes
#
# The folder a sync client takes away, and the one 13-readonly-people has always
# driven at 555 and nowhere else. Six verbs write into it and three read out of
# it, and every one of them has to say the same thing about the same folder.
for PM_M in 555 500 400 000; do
  pm_drive clears people "$PM_M" "person note, people at $PM_M" \
    person note sam@northfield.io "they replied on LinkedIn"
  pm_drive clears people "$PM_M" "person add, people at $PM_M" \
    person add prospect kit@brightops.co.uk "Kit Alvarez"
  pm_drive clears people "$PM_M" "person set, people at $PM_M" \
    person set sam@northfield.io company "Northfield"
  pm_drive clears people "$PM_M" "person touch, people at $PM_M" \
    person touch sam@northfield.io email out "sent the opener"
  PM_FEED=$CASEWORK/typed-line.txt
  pm_drive clears people "$PM_M" "person opener, people at $PM_M" \
    person opener ig:helen.makes -
  pm_drive clears people "$PM_M" "person remove, people at $PM_M" \
    person remove sam@northfield.io
done

# The three that only read. At 555 and 500 they work, because reading a folder
# needs the two bits those modes keep, so there is no refusal to drive there and
# a path that pretended otherwise would prove nothing.
for PM_M in 400 000; do
  pm_drive clears people "$PM_M" "person get, people at $PM_M"    person get sam@northfield.io
  pm_drive clears people "$PM_M" "person list, people at $PM_M"   person list
  pm_drive clears people "$PM_M" "person export, people at $PM_M" person export firstlines
done

# ---------------------------------------------- the whole folder, four modes
for PM_M in 555 500 400 000; do
  pm_drive clears . "$PM_M" "log note, the folder at $PM_M"   log note "day one, picked the b2b track"
  pm_drive clears . "$PM_M" "remember, the folder at $PM_M"   remember decision "picked b2b, my buyers are agencies"
  pm_drive clears . "$PM_M" "ledger add, the folder at $PM_M" ledger add-content 2 1 short-post text
done
# The three that reach the folder through something inside it, so they only
# notice once the search bit is gone.
for PM_M in 400 000; do
  pm_drive clears . "$PM_M" "index, the folder at $PM_M"       index
  pm_drive clears . "$PM_M" "person add, the folder at $PM_M"  person add prospect kit@brightops.co.uk "Kit Alvarez"
  pm_drive clears . "$PM_M" "person note, the folder at $PM_M" person note sam@northfield.io "they replied on LinkedIn"
done

# ---------------------------------------------- the state folder, four modes
for PM_M in 555 500 400 000; do
  pm_drive clears .state "$PM_M" "index, the state folder at $PM_M"       index
  pm_drive clears .state "$PM_M" "receipt set, the state folder at $PM_M" receipt set plugin PASS "ok"
done

# ---------------------------------------------- the backup folder, four modes
#
# Where every write in the toolkit puts a copy before it changes anything, so a
# folder nothing can write into is a folder where no write is safe. ge snapshot
# is the one that says so out loud.
for PM_M in 555 500 400 000; do
  pm_drive clears .state/snapshots "$PM_M" "snapshot, the backup folder at $PM_M" snapshot memory.md
done
# Reading the backups needs the two bits 555 keeps, so restore only refuses on
# the two modes that take the search bit away.
for PM_M in 400 000; do
  pm_drive clears .state/snapshots "$PM_M" "restore, the backup folder at $PM_M" restore memory.md
done

# ------------------------------------------------------ one file, three modes
#
# 444 is the file a founder set to read only on purpose, and ge keeps that
# setting rather than taking it off. 200 is the shape chmod a-r leaves behind and
# the only file mode this suite has ever driven. 000 is a founder protecting a
# file that holds real people's names and addresses, and it is the one where a
# line handing back the read bit alone leaves the write bit still gone.
for PM_M in 444 200 000; do
  pm_drive clears memory.md "$PM_M" "remember, memory.md at $PM_M" \
    remember decision "picked b2b, my buyers are agencies"
  pm_drive clears ledger.md "$PM_M" "ledger add, ledger.md at $PM_M" \
    ledger add-content 2 1 short-post text
  pm_drive clears people/sam-northfield-io.md "$PM_M" "person note, their file at $PM_M" \
    person note sam@northfield.io "they replied on LinkedIn"
done
pm_drive clears people/sam-northfield-io.md 000 "person set, their file at 000" \
  person set sam@northfield.io company "Northfield"
for PM_M in 444 000; do
  pm_drive clears ops-log.md "$PM_M" "log note, ops-log.md at $PM_M"       log note "day one, picked the b2b track"
  pm_drive clears .state/index.md "$PM_M" "index, the index file at $PM_M" index
done

# ------------------------------------ no folder yet, and this one will not take one
#
# THE SECOND FIXTURE THAT ONLY EVER PRODUCED THE INPUT WHERE THE CODE WORKS.
# 30-recovery-runs drives sixteen paths from a folder with no growth-engine in
# it, and every one of them ends on "→ run: ge init". Every one of those sixteen
# is driven inside a folder that ge can write to, which is the one state where
# ge init works, so "ge init" has always been proved as a way out and never once
# as a way out from where the founder actually is.
#
# Where they actually are: the sync client has the folder they opened Claude Code
# in, or they opened one that is not theirs to write to. ge init cannot make a
# folder there, so the line every one of those refusals hands back is a second
# refusal waiting to happen.
#
# Two of the four modes go further. With the search bit gone, the shell cannot
# say what folder it is standing in at all, so the founder is shown the shell's
# own words about getcwd, and ge, reading an empty answer for the current folder,
# names / instead. The line it hands a founder is then a chmod on the root of
# their disk. Neither of those may reach anybody, and the second one is why this
# section checks the words of the command and not only whether it runs.
pm_nofolder() {                         # <mode> <clears|settles> <label> <ge arguments...>
  pm_n_m=$1
  pm_n_kind=$2
  pm_n_lbl=$3
  shift 3
  PM_DRIVEN=$((PM_DRIVEN + 1))
  pm_open
  cd "$PM_ROOT" || pm_die "the sandbox root is not there." "sh tests/run.sh again"
  rm -rf "$PM_ROOT/away"
  mkdir -p "$PM_ROOT/away" || pm_die "the empty folder could not be made." "df -h ${TMPDIR:-/tmp}"
  cd "$PM_ROOT/away" || pm_die "the empty folder is not there." "sh tests/run.sh again"
  # HOME is a readable folder that holds no growth-engine, and NOT the folder
  # about to be locked. It used to be "away" itself, which made "cd ~" expand to
  # the one folder the founder cannot enter, so the way out ge printed could
  # never run. That is the sandbox describing a founder whose home folder is the
  # thing the sync client took, which is not the case under test here and is not
  # a state any recovery line could answer. It still holds no growth-engine, so
  # the home half of ge's search finds nothing and the folder really is the empty
  # one the label says it is.
  rm -rf "$PM_ROOT/elsewhere"
  mkdir -p "$PM_ROOT/elsewhere" \
    || pm_die "the home folder for this case could not be made." "df -h ${TMPDIR:-/tmp}"
  HOME="$PM_ROOT/elsewhere"
  export HOME
  chmod "$pm_n_m" "$PM_ROOT/away" \
    || pm_die "the empty folder would not change to mode $pm_n_m." "ls -ld $PM_ROOT/away"
  pm_bit_gone "$PM_ROOT/away" "$pm_n_m"

  sh "$GE" "$@" < /dev/null > "$CASEWORK/nf.out" 2>&1
  pm_n_rc=$?
  # Out of the shut folder before anything else runs, or the harness's own tools
  # start answering about a folder they cannot name either.
  cd "$PM_ROOT" || pm_die "the sandbox root is not there." "sh tests/run.sh again"
  pm_open

  if [ "$pm_n_rc" -eq 0 ]; then
    t_note "$pm_n_lbl: it did not fail"
    cat "$CASEWORK/nf.out" >> "$CASEWORK/diff.txt"
    t_fail "$pm_n_lbl: exited 0, so this path no longer refuses"
    return 0
  fi
  t_pass

  # The shell's own words about the folder it cannot name, asked of GE'S OWN
  # OUTPUT and not of the whole stream.
  #
  # SCOPE, and why this is narrower than it first was: the shell prints that line
  # while it is STARTING UP, before the first line of any script it is given runs.
  # Proved rather than assumed: in a folder at 400, `sh -c 'true'` prints
  # "shell-init: error retrieving current directory: getcwd: ..." and so does a
  # script whose entire body is `exit 0`. ge is reached through `sh bin/ge`, which
  # execs `sh scripts/ge.sh`, so two shells start and each says it once. No line
  # ge could contain would stop either. Holding ge to it made this case demand
  # something no program can do, which is a case that can never go green rather
  # than a fault anybody can fix.
  #
  # What ge IS held to is everything ge itself writes, which is every line from
  # its own FAIL banner onward, and that is what is checked here. ge naming the
  # root of the disk, or offering "chmod u+w /", would still be caught: both were
  # in ge's own output, and both are what this block was written for.
  sed -n '/^FAIL /,$p' "$CASEWORK/nf.out" > "$CASEWORK/nf.ge.out"
  assert_lacks_pattern "$CASEWORK/nf.ge.out" 'getcwd' \
    "$pm_n_lbl: the shell's own words about getcwd are not repeated by ge"
  assert_lacks_pattern "$CASEWORK/nf.ge.out" 'error retrieving current directory' \
    "$pm_n_lbl: nor the other spelling of them"
  assert_lacks_pattern "$CASEWORK/nf.ge.out" 'Permission denied' \
    "$pm_n_lbl: nor the system's own words for a permission"

  rl_every_arrow "$CASEWORK/nf.out" "$pm_n_lbl"
  pm_n_last=$(rl_last_line "$CASEWORK/nf.out")
  rl_arrow "$pm_n_last"
  if [ "$RL_FORM" = none ]; then
    t_note "$pm_n_lbl: the last line is not a way out"
    cat "$CASEWORK/nf.out" >> "$CASEWORK/diff.txt"
    t_fail "$pm_n_lbl: ends [$pm_n_last]"
    return 0
  fi
  t_pass

  if [ "$RL_FORM" != run ]; then
    # A bare arrow is honest here for the two modes where ge cannot name the
    # folder at all, so it is read and it stops there.
    return 0
  fi

  # NOT A CHMOD ON THE ROOT OF THEIR DISK. ge works out which folder to name from
  # what the shell says the current one is, and the shell says nothing at all
  # when the search bit is gone. An empty answer read as a folder name leaves /,
  # and the line handed to a founder then acts on the root of their machine.
  # Checked by the words of the command, because that is the harm: whether it
  # would have run is a different and much smaller question.
  rl_words "$RL_AFTER" "$CASEWORK/nf.words"
  if grep -q -F -x -e '/' "$CASEWORK/nf.words"; then
    t_note "$pm_n_lbl: the way out acts on the root of the disk"
    cat "$CASEWORK/nf.out" >> "$CASEWORK/diff.txt"
    printf 'the command a founder would paste:\n  %s\n' "$RL_AFTER" >> "$CASEWORK/diff.txt"
    printf 'and one of its words is /, which is the root of their machine\n' >> "$CASEWORK/diff.txt"
    t_fail "$pm_n_lbl: the line names / as the folder to change"
    return 0
  fi
  t_pass

  rl_quoted "$RL_AFTER" "$pm_n_lbl"
  pm_n_cmd=$(rl_part cmd "$RL_AFTER")
  # Put back the state the message was written in, then paste the line into it.
  # Standing in the folder first and shutting it afterwards, because a folder
  # with no search bit cannot be entered, and the founder this is about was
  # already standing in it when the sync client took it.
  cd "$PM_ROOT/away" || pm_die "the empty folder is not there." "sh tests/run.sh again"
  chmod "$pm_n_m" "$PM_ROOT/away" 2>/dev/null
  rl_exec "$pm_n_cmd" /dev/null
  pm_n_wrc=$RL_RC
  if [ "$pm_n_kind" = clears ]; then
    sh "$GE" "$@" < /dev/null > "$CASEWORK/nf-again.out" 2>&1
    pm_n_again=$?
  else
    pm_n_again=0
  fi
  cd "$PM_ROOT" || pm_die "the sandbox root is not there." "sh tests/run.sh again"
  pm_open

  if [ "$pm_n_wrc" -eq 0 ] && ! grep -q '^FAIL' "$CASEWORK/recovery.out"; then
    t_pass
  else
    t_note "$pm_n_lbl: the way out does not run"
    printf 'the command in it:\n  %s\n' "$pm_n_cmd" >> "$CASEWORK/diff.txt"
    printf 'running that exited %s and said:\n' "$pm_n_wrc" >> "$CASEWORK/diff.txt"
    sed 's/^/  /' "$CASEWORK/recovery.out" >> "$CASEWORK/diff.txt"
    # AND TO THE LOG. See the same block in pm_drive: diff.txt does not survive to
    # the artifact step on a runner, so a failure that only writes there says
    # nothing to whoever reads the log.
    #
    # THIS IS THE FUNCTION THAT ACTUALLY FAILS, and the first attempt instrumented
    # pm_drive instead, because the two have near identical branches and only one
    # was read. The failing labels all say "with nothing in it", which is this one.
    printf '      the way out ge printed: %s\n' "$pm_n_cmd" >&2
    printf '      running it exited %s and it said:\n' "$pm_n_wrc" >&2
    sed 's/^/        /' "$CASEWORK/recovery.out" >&2
    printf '      HOME was: %s\n' "${HOME:-<unset>}" >&2
    printf '      the refusal in full:\n' >&2
    sed 's/^/        /' "$CASEWORK/nofolder.out" >&2 2>/dev/null || true
    t_fail "$pm_n_lbl: the way out exits $pm_n_wrc"
    return 0
  fi

  [ "$pm_n_kind" = clears ] || return 0
  if [ "$pm_n_again" -eq 0 ]; then
    t_pass
  else
    t_note "$pm_n_lbl: the way out ran and the founder is refused a second time"
    printf 'the way out was : %s\n' "$pm_n_cmd" >> "$CASEWORK/diff.txt"
    printf 'and the same command then exited %s and said:\n' "$pm_n_again" >> "$CASEWORK/diff.txt"
    sed 's/^/  /' "$CASEWORK/nf-again.out" >> "$CASEWORK/diff.txt"
    t_fail "$pm_n_lbl: a second refusal, and the same command still exits $pm_n_again"
  fi
  return 0
}

# 555 and 500: ge can still read the folder and name it, so it can name the chmod
# too, and one line has to be enough.
for PM_M in 555 500; do
  pm_nofolder "$PM_M" clears "init in a folder at $PM_M with nothing in it"     init
  pm_nofolder "$PM_M" clears "log note in a folder at $PM_M with nothing in it" log note "day one, picked the b2b track"
  pm_nofolder "$PM_M" clears "check in a folder at $PM_M with nothing in it"    check
done
# 400 and 000: the search bit is gone, so nothing can say which folder this is.
# What is asked here is not that a line clears it. It is that the founder is not
# shown the shell's own words, and is not handed a command that acts on the root
# of their disk. Which line is right when ge cannot name the folder is ge's call,
# and this holds whichever it picks to being safe and to running.
for PM_M in 400 000; do
  pm_nofolder "$PM_M" settles "init in a folder at $PM_M with nothing in it"     init
  pm_nofolder "$PM_M" settles "log note in a folder at $PM_M with nothing in it" log note "day one, picked the b2b track"
  pm_nofolder "$PM_M" settles "check in a folder at $PM_M with nothing in it"    check
done

# --------------------------------------------- the report that reads the folder
#
# ge lint reads the people folder, and it reads the outreach sheet beside it. The
# two legs ask different questions of the same folder. The folder leg says out
# loud that it could not open it and that the report says nothing about the
# people inside. The sheet leg walks the same folder, and a folder that cannot be
# opened hands it no names at all, which is not the same thing as there being
# nobody there.
#
# WHY IT MATTERS TO A FOUNDER. They open the sheet on a Monday morning with two
# live prospects on it, and lint tells them both rows are for people who were cut
# or taken out. The line it hands back is ge person export firstlines, which
# refuses on the same folder, so the way out is not one. AN EMPTY ANSWER FROM A
# FOLDER YOU COULD NOT READ IS NOT PROOF IT IS EMPTY.
#
# Held as a count and not only as a phrase. Asking only that one sentence is
# absent would pass the moment the sentence is reworded while the claim stays,
# so what is asked is that the folder is the ONE thing this report has to say.
pm_lint() {                             # <mode>
  pm_l_m=$1
  pm_stage
  sh "$GE" person export firstlines > /dev/null 2>&1 \
    || pm_die "the outreach sheet could not be written." "sh tests/run.sh again"
  sh "$GE" lint > "$CASEWORK/lint-open.out" 2>&1
  # Said out loud rather than assumed. If this folder already had something to
  # report, the count below would be measuring that instead, and the whole check
  # would prove nothing.
  assert_contains "$CASEWORK/lint-open.out" 'Nothing to report' \
    "with the people folder open, lint has nothing to say about this folder"

  chmod "$pm_l_m" "$PM_ROOT/work/growth-engine/people" \
    || pm_die "the people folder would not change to mode $pm_l_m." \
              "ls -ld $PM_ROOT/work/growth-engine/people"
  pm_bit_gone "$PM_ROOT/work/growth-engine/people" "$pm_l_m"
  sh "$GE" lint > "$CASEWORK/lint-shut.out" 2>&1
  pm_open

  # It says the folder could not be opened. This half is already right, and it is
  # held here so a repair to the half below cannot quietly take it away.
  assert_contains "$CASEWORK/lint-shut.out" 'the people folder cannot be opened' \
    "lint with the people folder at $pm_l_m says the folder could not be opened"
  assert_contains "$CASEWORK/lint-shut.out" 'this report says nothing about them' \
    "and says the report is silent about the people inside"

  # And that is the whole of it. One fault, one warning. Anything else in this
  # report is a claim about people nothing read.
  pm_l_warns=$(grep -c '^WARN ' "$CASEWORK/lint-shut.out")
  if [ "$pm_l_warns" = 1 ]; then
    t_pass
  else
    t_note "lint with the people folder at $pm_l_m: it reported more than the folder"
    printf 'the people folder was at %s, so nobody in it was read\n' "$pm_l_m" >> "$CASEWORK/diff.txt"
    printf 'anything said about the outreach sheet here is said about people nothing opened\n' \
      >> "$CASEWORK/diff.txt"
    cat "$CASEWORK/lint-shut.out" >> "$CASEWORK/diff.txt"
    t_fail "lint with the people folder at $pm_l_m: $pm_l_warns warnings, and only the folder can be one"
  fi
  assert_lacks "$CASEWORK/lint-shut.out" 'cut or taken out' \
    "lint with the people folder at $pm_l_m does not call the people on the sheet cut or taken out"

  # Every arrow it printed, held to the rule for the shape it is. A lint report
  # ends on its count line rather than on an arrow, so the line a founder's eye
  # lands on is the last ARROW and not the last line, and that is the one taken
  # below.
  rl_every_arrow "$CASEWORK/lint-shut.out" "lint with the people folder at $pm_l_m"

  # The last way out this report offers, run from the state the report was
  # written in. A founder who reads one line reads that one, and it has to work
  # on its own rather than only after somebody has worked down the whole report.
  pm_l_last=$(sed -n '$p' "$CASEWORK/arrows")
  rl_arrow "$pm_l_last"
  if [ "$RL_FORM" != run ]; then
    t_note "lint with the people folder at $pm_l_m: the last way out offers no command"
    cat "$CASEWORK/lint-shut.out" >> "$CASEWORK/diff.txt"
    t_fail "lint with the people folder at $pm_l_m: the last arrow is [$pm_l_last]"
  else
    t_pass
    rl_quoted "$RL_AFTER" "lint with the people folder at $pm_l_m"
    pm_l_cmd=$(rl_part cmd "$RL_AFTER")
    chmod "$pm_l_m" "$PM_ROOT/work/growth-engine/people" 2>/dev/null
    rl_exec "$pm_l_cmd" /dev/null
    pm_l_rc=$RL_RC
    pm_open
    if [ "$pm_l_rc" -eq 0 ] && ! grep -q '^FAIL' "$CASEWORK/recovery.out"; then
      t_pass
    else
      t_note "lint with the people folder at $pm_l_m: its last way out does not run"
      printf 'the command was:\n  %s\n' "$pm_l_cmd" >> "$CASEWORK/diff.txt"
      printf 'running it exited %s and said:\n' "$pm_l_rc" >> "$CASEWORK/diff.txt"
      sed 's/^/  /' "$CASEWORK/recovery.out" >> "$CASEWORK/diff.txt"
      t_fail "lint with the people folder at $pm_l_m: the last way out exits $pm_l_rc"
    fi
  fi

  # And the whole report worked down in order, the way a founder reads one. lint
  # never writes, so its way out is the chmod that lets it read, and afterwards
  # the same report has to come back without the folder warning on it.
  chmod "$pm_l_m" "$PM_ROOT/work/growth-engine/people" 2>/dev/null
  pm_l_bad=0
  while IFS= read -r pm_l_line; do
    rl_arrow "$pm_l_line"
    [ "$RL_FORM" = run ] || continue
    rl_exec "$(rl_part cmd "$RL_AFTER")" /dev/null
    [ "$RL_RC" -eq 0 ] || pm_l_bad=$((pm_l_bad + 1))
  done < "$CASEWORK/arrows"
  sh "$GE" lint > "$CASEWORK/lint-again.out" 2>&1
  pm_open
  assert_equals 0 "$pm_l_bad" "every way out lint offers at $pm_l_m runs when the report is worked down in order"
  assert_lacks "$CASEWORK/lint-again.out" 'the people folder cannot be opened' \
    "and afterwards lint can open the people folder"
  return 0
}

pm_lint 400
pm_lint 000

# ---------------------------------------------------------------- what was driven

cd "$SANDBOX" || pm_die "the sandbox is not there." "sh tests/run.sh again"
pm_open

# The count, so a path cannot go missing without somebody saying why. It is a
# floor and never a target: it goes up when a mode or a verb is added, and it is
# never lowered to reach green.
[ "$PM_DRIVEN" -ge 85 ] && t_pass || \
  t_fail "this case drove only $PM_DRIVEN permission paths, and it is meant to drive at least 85"

# And a folder in the state these paths leave behind can still be removed. This
# is the other half of the promise in the header, and it is the thing that put
# the suite's own cleanup wrong: a red case must never leave a folder nothing can
# delete, and every mode above takes away the bit that rm needs to get inside.
PM_GONE="$SANDBOX/removable"
rm -rf "$PM_GONE"
mkdir -p "$PM_GONE/shut" || pm_die "the folder to prove removal with could not be made." \
  "df -h ${TMPDIR:-/tmp}"
printf 'x\n' > "$PM_GONE/shut/file.md" || pm_die "that folder could not be filled." \
  "df -h ${TMPDIR:-/tmp}"
chmod 000 "$PM_GONE/shut" || pm_die "that folder would not change permissions." "ls -ld $PM_GONE/shut"
chmod -R u+rwX "$PM_GONE" 2>/dev/null
rm -rf "$PM_GONE"
assert_absent "$PM_GONE" "a tree holding a folder at 000 comes away after chmod -R u+rwX"

t_done
