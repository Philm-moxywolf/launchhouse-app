#!/bin/sh
# assert.sh — the checks a golden case is written out of.
#
# WHY IT EXISTS: ge writes the founder's only copy of their work, and the ways
#                it can go wrong are byte level: a carriage return a Windows
#                editor added, a trailing newline BSD sed adds and GNU sed does
#                not, a snapshot that silently did not happen. An exit code
#                cannot see any of those, so every check here compares whole
#                files rather than statuses, and every failure writes the
#                difference to a file the reader can open.
# CALLED BY:     tests/cases/*.sh
# READS:         tests/fixtures/**   WRITES: tests/.work/<shell>/<case>/diff.txt
# POSTURE:       fail-closed. Any difference fails the case. A check that cannot
#                run, because a file it needed is not there, fails too and never
#                passes quietly.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. No arrays, no local.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

T_CHECKS=0
T_FAILS=0

# Snapshot files are stamped with the second they were taken, so ten of them
# scrub to ten copies of one name and cannot be held as ten files in a fixture.
# The tree comparison therefore lists the folder and stops there, and every case
# that writes asserts the count of what is inside it by hand. Stated here once,
# so no case has to explain it again.
T_SNAP_PRUNE='^\./growth-engine/\.state/snapshots/.'

# The folder ge init makes carries its own .gitignore, holding the two lines that
# keep 130 people's prospect lists and machine state out of any repository the
# founder forks. Committed inside a fixture that same file makes git skip the
# people/ and .state/ folders sitting beside it, so half of every expected tree
# would go missing from the checkout and the suite would be green on a machine
# that had never seen those files. It is therefore left out of the tree
# comparison and held against its own fixture in tests/cases/03-init.sh instead,
# which is the one place its exact bytes actually matter.

t_pass() {
  T_CHECKS=$((T_CHECKS + 1))
}

# One line per failed check, and the detail goes in the diff file rather than
# down the terminal, so a case with a large difference stays readable.
t_fail() {                              # <label>
  T_CHECKS=$((T_CHECKS + 1))
  T_FAILS=$((T_FAILS + 1))
  printf '      %s\n      → run: cat %s\n' "$1" "$CASEWORK/diff.txt" >&2
}

t_note() {                              # <heading> : opens a section in the diff file
  printf '\n=== %s\n' "$1" >> "$CASEWORK/diff.txt"
}

# t_die: the case itself cannot continue. Different from a failed check, which
# is a result. This is the harness being unable to produce one.
t_die() {                               # <what went wrong> <the command that fixes it>
  printf 'FAIL  %s\n      → run: %s\n' "$1" "$2" >&2
  exit 1
}

# t_start <case name>: the sandbox, the working folder and the fixture paths.
# The sandbox lives outside the repository, because ge walks up from the working
# directory looking for a growth-engine folder and would otherwise find one
# belonging to whoever is running the suite.
t_start() {                             # <case name>
  CASE=$1
  SANDBOX="$WORKROOT/$CASE"
  CASEWORK="$WORK/$CASE"
  FIX="$TESTS/fixtures/$CASE"
  # The permissions come back before the old sandbox is removed. A case that
  # takes the search bit off a folder and then stops early leaves one that rm
  # cannot get inside, and the next run would fail on the leftovers rather than
  # on anything to do with ge. u+rwX and not u+w: the write bit alone leaves a
  # folder at 200, which chmod cannot descend into either.
  [ -d "$SANDBOX" ] && chmod -R u+rwX "$SANDBOX" 2>/dev/null
  rm -rf "$SANDBOX" "$CASEWORK"
  mkdir -p "$SANDBOX" "$CASEWORK" || t_die "the sandbox for $CASE could not be made." \
    "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
  true > "$CASEWORK/diff.txt" || t_die "the notes file for $CASE could not be made." \
    "chmod u+w $WORK"
  scrub_roots "$SANDBOX"
  # ge reads HOME when it looks for the folder. Pointing it at the sandbox is
  # what stops the suite finding the folder of the person running it.
  HOME=$SANDBOX
  export HOME
  [ -d "$FIX/in" ] && { cp -R "$FIX/in/." "$SANDBOX/" || t_die "fixture in/ for $CASE would not copy." "ls -l $FIX/in"; }
  return 0
}

# t_seed: the files a case wants inside growth-engine, put there after ge init.
# They cannot live in in/, because .state/HOME holds an absolute path and no
# absolute path can be committed to a fixture.
t_seed() {
  [ -d "$FIX/seed" ] || return 0
  cp -R "$FIX/seed/." "$SANDBOX/growth-engine/" || t_die "fixture seed/ for $CASE would not copy." \
    "ls -l $FIX/seed"
}

t_done() {
  printf '%s\n' "$T_CHECKS" > "$CASEWORK/checks"
  [ "$T_FAILS" -eq 0 ] || exit 1
  exit 0
}

# ---------------------------------------------------------------- simple checks

assert_exit() {                         # <wanted> <got> <label>
  if [ "$1" = "$2" ]; then t_pass; return 0; fi
  t_note "$3"
  printf 'wanted exit %s, got exit %s\n' "$1" "$2" >> "$CASEWORK/diff.txt"
  t_fail "$3: wanted exit $1, got $2"
  return 1
}

assert_equals() {                       # <wanted> <got> <label>
  if [ "$1" = "$2" ]; then t_pass; return 0; fi
  t_note "$3"
  printf 'wanted [%s]\ngot    [%s]\n' "$1" "$2" >> "$CASEWORK/diff.txt"
  t_fail "$3: wanted [$1], got [$2]"
  return 1
}

assert_contains() {                     # <file> <text> <label>
  if [ -f "$1" ] && grep -q -F -e "$2" -- "$1"; then t_pass; return 0; fi
  t_note "$3"
  printf 'looked for: %s\nin: %s\n' "$2" "$1" >> "$CASEWORK/diff.txt"
  [ -f "$1" ] && cat "$1" >> "$CASEWORK/diff.txt"
  t_fail "$3: text not found"
  return 1
}


# The other half of assert_contains. Some of what this toolkit promises is that
# something never appears: a raw shell error, a source line number, an internal
# temp filename, "1 lines are". Those can only be tested by their absence.
assert_lacks() {                        # <file> <text> <label>
  if [ ! -f "$1" ] || ! grep -q -F -e "$2" -- "$1"; then t_pass; return 0; fi
  t_note "$3"
  printf 'should not appear: %s\nbut it is in: %s\n' "$2" "$1" >> "$CASEWORK/diff.txt"
  cat "$1" >> "$CASEWORK/diff.txt"
  t_fail "$3: text present and should not be"
  return 1
}
# The same again for something whose exact spelling changes with the shell. A
# shell naming the line it stopped on writes "file.sh: line 94:" under bash and
# "file.sh: 114:" under dash, so the thing that must never appear can only be
# described as a shape.
assert_lacks_pattern() {                # <file> <extended pattern> <label>
  if [ ! -f "$1" ] || ! grep -q -E -e "$2" -- "$1"; then t_pass; return 0; fi
  t_note "$3"
  printf 'should not appear anywhere: %s\nbut it is in: %s\n' "$2" "$1" >> "$CASEWORK/diff.txt"
  cat "$1" >> "$CASEWORK/diff.txt"
  t_fail "$3: it is there and should not be"
  return 1
}

assert_absent() {                       # <path> <label>
  if [ ! -e "$1" ]; then t_pass; return 0; fi
  t_note "$2"
  printf '%s is still there and should not be\n' "$1" >> "$CASEWORK/diff.txt"
  t_fail "$2: $1 still exists"
  return 1
}

# t_region <file> <heading>: the founder's own part of a file, as raw bytes, from
# the line that starts with that heading to the last byte in the file.
#
# Cut with tail at a byte offset rather than read out line by line and printed
# again. Printing it again is what would quietly put back a final newline that a
# write had taken away, or drop a carriage return, and those two are exactly what
# the cases that call this exist to measure. The heading goes through the
# environment rather than into the awk program, because a heading is text and awk
# reads a backslash in an assigned value as the start of an escape.
t_region() {                            # <file> <heading>
  GE_T_HEAD=$2
  export GE_T_HEAD
  tr_at=$(LC_ALL=C awk '
    found { next }
    index($0, ENVIRON["GE_T_HEAD"]) == 1 { print n; found = 1; next }
    { n = n + length($0) + 1 }
  ' "$1")
  [ -n "$tr_at" ] || { printf 'THE HEADING %s IS NOT IN THE FILE\n' "$2"; return 0; }
  tail -c "+$((tr_at + 1))" "$1"
}

# assert_bytes_equal: no scrubbing at all. This is the check that proves an undo
# gave the file back unchanged, so masking anything in it would defeat it.
assert_bytes_equal() {                  # <file a> <file b> <label>
  if cmp -s "$1" "$2"; then t_pass; return 0; fi
  t_note "$3"
  diff -u "$1" "$2" >> "$CASEWORK/diff.txt" 2>&1
  t_fail "$3: bytes differ"
  return 1
}

# ---------------------------------------------------------------- golden checks

# assert_files_equal: the actual side is scrubbed, the expected side is a
# committed fixture that already holds the scrubbed shape.
assert_files_equal() {                  # <expected path> <actual path> <label>
  af_exp=$1; af_act=$2; af_lbl=$3
  if [ ! -f "$af_act" ]; then
    t_note "$af_lbl"
    printf '%s was never produced\n' "$af_act" >> "$CASEWORK/diff.txt"
    t_fail "$af_lbl: nothing was produced"
    return 1
  fi
  scrub < "$af_act" > "$CASEWORK/.scrubbed"
  if [ "$UPDATE" -eq 1 ]; then
    mkdir -p "$(dirname -- "$af_exp")"
    cp "$CASEWORK/.scrubbed" "$af_exp"
    t_pass
    return 0
  fi
  if [ -f "$af_exp" ] && cmp -s "$af_exp" "$CASEWORK/.scrubbed"; then t_pass; return 0; fi
  t_note "$af_lbl"
  diff -u "$af_exp" "$CASEWORK/.scrubbed" >> "$CASEWORK/diff.txt" 2>&1
  t_fail "$af_lbl: output differs from the fixture"
  return 1
}

# assert_raw_equal: for output whose every byte is already fixed, such as help
# text, or a run made under the stopped clock in fixtures/02-date-compat.
assert_raw_equal() {                    # <expected path> <actual path> <label>
  ar_exp=$1; ar_act=$2; ar_lbl=$3
  if [ ! -f "$ar_act" ]; then
    t_note "$ar_lbl"
    printf '%s was never produced\n' "$ar_act" >> "$CASEWORK/diff.txt"
    t_fail "$ar_lbl: nothing was produced"
    return 1
  fi
  if [ "$UPDATE" -eq 1 ]; then
    mkdir -p "$(dirname -- "$ar_exp")"
    cp "$ar_act" "$ar_exp"
    t_pass
    return 0
  fi
  if [ -f "$ar_exp" ] && cmp -s "$ar_exp" "$ar_act"; then t_pass; return 0; fi
  t_note "$ar_lbl"
  diff -u "$ar_exp" "$ar_act" >> "$CASEWORK/diff.txt" 2>&1
  t_fail "$ar_lbl: output differs from the fixture"
  return 1
}

t_dir_empty() {                         # <dir>
  td_n=$(ls -a -- "$1" 2>/dev/null | wc -l | tr -d ' ')
  [ "$td_n" -le 2 ]
}

# The file list of one side, scrubbed, sorted, with the three things a fixture
# cannot carry taken out: the contents of the snapshot ring, the .gitkeep files
# that are the only way to commit an empty folder, and the founder's own
# .gitignore for the reason set out at the top of this file.
t_list() {                              # <dir> <out file> <scrub or raw>
  if [ "$3" = scrub ]; then
    ( cd "$1" && find . -print ) | scrub > "$2.pre"
  else
    ( cd "$1" && find . -print ) > "$2.pre"
  fi
  grep -v "$T_SNAP_PRUNE" "$2.pre" | grep -v '/\.gitkeep$' | grep -v '/\.gitignore$' \
    | LC_ALL=C sort > "$2"
  rm -f "$2.pre"
}

# assert_tree: the whole resulting folder against the whole expected folder.
# Two passes, in this order on purpose. "expected 12 files, found 11" is a far
# better first line than a byte offset inside one of them.
assert_tree() {                         # <expect dir> <actual dir> <label>
  at_exp=$1; at_act=$2; at_lbl=$3

  if [ "$UPDATE" -eq 1 ]; then
    # Updated in place, file by file, rather than by deleting the fixture folder
    # and building it again. Deleting a committed folder and recreating it under
    # the same name is what a file sync client reads as a conflict, and it
    # answers by leaving an empty "growth-engine 2" beside it, which then fails
    # the next run for a reason that has nothing to do with ge. Writing over
    # what is already there avoids the whole argument, and it also means an
    # --update never throws away a file somebody put in the fixture on purpose
    # without saying which one it took.
    mkdir -p "$at_exp"
    true > "$CASEWORK/wanted" || t_die "the list of updated files could not be started." "chmod u+w $CASEWORK"
    ( cd "$at_act" && find . -type d -print ) | while IFS= read -r at_d; do
      mkdir -p "$at_exp/$at_d"
    done
    ( cd "$at_act" && find . -type f -print ) | while IFS= read -r at_f; do
      case $at_f in ./growth-engine/.state/snapshots/*) continue ;; esac
      case ${at_f##*/} in .gitignore) continue ;; esac
      printf '%s\n' "$at_f" >> "$CASEWORK/wanted"
      scrub < "$at_act/$at_f" > "$at_exp/$at_f"
    done
    # Anything the fixture still holds that this run did not produce. Left
    # behind it would be a file the suite claims to expect and never checks.
    ( cd "$at_exp" && find . -type f -print ) | while IFS= read -r at_f; do
      grep -q -F -x -e "$at_f" "$CASEWORK/wanted" && continue
      rm -f "$at_exp/$at_f"
    done
    ( cd "$at_exp" && find . -type d -print ) | LC_ALL=C sort -r | while IFS= read -r at_d; do
      [ -d "$at_act/$at_d" ] || rm -rf "$at_exp/$at_d"
    done
    # A folder with nothing in it cannot be committed on its own, and the
    # snapshot ring is always one of those once its contents are left out.
    find "$at_exp" -type d -print | while IFS= read -r at_d; do
      t_dir_empty "$at_d" && { true > "$at_d/.gitkeep" || t_die "an empty folder could not be marked in the fixture." "chmod u+w $at_d"; }
    done
    t_pass
    return 0
  fi

  if [ ! -d "$at_exp" ]; then
    t_note "$at_lbl"
    printf 'there is no fixture at %s\n' "$at_exp" >> "$CASEWORK/diff.txt"
    t_fail "$at_lbl: no fixture. Run sh tests/run.sh --update and read what it wrote"
    return 1
  fi

  t_list "$at_exp" "$CASEWORK/tree.exp" raw
  t_list "$at_act" "$CASEWORK/tree.act" scrub
  if ! cmp -s "$CASEWORK/tree.exp" "$CASEWORK/tree.act"; then
    t_note "$at_lbl: the list of files differs"
    diff -u "$CASEWORK/tree.exp" "$CASEWORK/tree.act" >> "$CASEWORK/diff.txt" 2>&1
    t_fail "$at_lbl: the list of files differs"
    return 1
  fi

  true > "$CASEWORK/mismatch" || t_die "the list of differing files could not be started." "chmod u+w $CASEWORK"
  ( cd "$at_exp" && find . -type f -print ) | LC_ALL=C sort | while IFS= read -r at_f; do
    case $at_f in ./growth-engine/.state/snapshots/*) continue ;; esac
    case ${at_f##*/} in .gitkeep|.gitignore) continue ;; esac
    if [ ! -f "$at_act/$at_f" ]; then
      printf '%s\n' "$at_f" >> "$CASEWORK/mismatch"
      continue
    fi
    scrub < "$at_act/$at_f" > "$CASEWORK/.one"
    cmp -s "$at_exp/$at_f" "$CASEWORK/.one" || printf '%s\n' "$at_f" >> "$CASEWORK/mismatch"
  done

  if [ -s "$CASEWORK/mismatch" ]; then
    at_n=$(wc -l < "$CASEWORK/mismatch" | tr -d ' ')
    t_note "$at_lbl: content differs in $at_n file(s)"
    while IFS= read -r at_f; do
      scrub < "$at_act/$at_f" > "$CASEWORK/.one" 2>/dev/null
      diff -u "$at_exp/$at_f" "$CASEWORK/.one" >> "$CASEWORK/diff.txt" 2>&1
    done < "$CASEWORK/mismatch"
    t_fail "$at_lbl: content differs in $at_n file(s)"
    return 1
  fi

  t_pass
  return 0
}

# assert_snapshots <relative founder path> <wanted count> <label>: how many
# copies of one file the ring is holding. This is what proves a write took a
# backup first, and what proves the ring caps rather than growing for ever.
# The folder the ring is counted in. A case that builds its growth-engine folder
# somewhere other than the top of its sandbox, which is the only way to test a
# path with a space in it, sets this to say where.
assert_snapshots() {                    # <relative path> <wanted> <label>
  as_flat=$(printf '%s' "$1" | sed 's|/|__|g')
  as_dir="${GE_T_HOME:-$SANDBOX/growth-engine}/.state/snapshots"
  as_n=0
  if [ -d "$as_dir" ]; then
    # Counted with a case pattern rather than a grep, because the name carries
    # a dot and a dash and would be read as a pattern rather than as a name.
    # Three patterns, and continue rather than break, because the first one
    # skips every dot-prefixed name. A backup of .state/receipt.md is called
    # .state__receipt.md.<stamp>, so counting with one glob reported an empty
    # ring while ten backups sat in it, and every same-second assertion built
    # on that count would have passed on no evidence at all.
    for as_f in "$as_dir"/* "$as_dir"/.[!.]* "$as_dir"/..?*; do
      [ -e "$as_f" ] || continue
      as_b=${as_f##*/}
      case $as_b in
        "$as_flat".*) as_n=$((as_n + 1)) ;;
      esac
    done
  fi
  assert_equals "$2" "$as_n" "$3"
}
