#!/bin/sh
# recovery.sh — proves a recovery line is a command, runs it, and proves it cleared.
#
# WHY IT EXISTS: 21-recovery-lines proves a recovery line EXISTS. It holds every
#                driven path to three things: a non-zero exit, a FAIL banner, and
#                a last line carrying the arrow. Not one of those reads what is
#                after the arrow. That is how thousands of checks stayed green
#                while the toolkit printed lines that do not run: one naming ge
#                init with a comma stuck to it, so ge answers that it has no
#                command of that name; one telling the founder to open a file and
#                add a marker line, which pasted into a shell is not a command at
#                all and errors on the punctuation; one naming a person by a two
#                word name, which produces a second and more confusing refusal.
#                At the event a founder selects the line and pastes it. Nothing
#                here believes a line until it has been run and the state it
#                complained about has been read again.
# CALLED BY:     tests/cases/21-recovery-lines.sh and tests/cases/30-recovery-runs.sh,
#                which drive every path, and the golden cases that hold one
#                message to one shape: 06-ledger, 07-remember, 11-marker-in-value,
#                14-check, 18-receipt and 19-accounts.
# READS:         nothing        WRITES: tests/.work/<shell>/<case>/recovery.*
#                and tests/.work/<shell>/<case>/arrows
# POSTURE:       fail-closed. Every driven path declares what kind of line it
#                expects, and the kind is checked in both directions: a line
#                declared runnable has to run, and a line declared guidance has
#                to be guidance. A broken command can therefore never sit quietly
#                in the guidance bucket, which is the only way this could go back
#                to proving nothing. EVERY arrow in a message is read, not only
#                the one at the bottom: ge check prints one beside each leg with
#                something to say and ge accounts set names every row it could
#                not read, and until rl_every_arrow there was nothing in this
#                suite that had ever read any of them.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. No arrays, no local. The line
#                under test reaches awk through the environment, never through
#                -v and never pasted into the program, because it carries
#                backslashes, quotes, and a founder's own path.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

# The kinds a driven path can declare. Written out here because the whole value
# of this file is that the declaration is explicit and checked.
#
#   clears    the line is run, has to succeed, and then the command that failed
#             is run again and has to succeed. The strongest of the seven, and
#             the only one that proves the condition is gone.
#   unblocks  the line is run and has to succeed, and the command that failed is
#             run again and has to stop giving the same first line. For the paths
#             where the fix is real but the original still has nothing to do:
#             ge restore with no backups is answered by ge init, and after ge
#             init there is still nothing to restore.
#   instead   the line is run and has to succeed, and it is the command to run in
#             place of the one that failed. Every mistyped verb, every wrong
#             value and every look-at-this line is one of these, because the
#             command that failed can never succeed as it was typed.
#   template  the line carries a <placeholder> the founder has to fill in. The
#             brackets are checked, the case supplies one real value, and what
#             comes out is then run exactly like instead. Without the
#             substitution a template would be an unrunnable line with an excuse.
#   guidance  ge has no command for this one, because only the founder knows the
#             value that was meant. The line is the BARE ARROW shape: "→ " and
#             the one thing they do by hand, with no "run:" on it at all. Not
#             run. Held to being prose AND to being the bare shape, so neither a
#             broken command nor a real one can hide here.
#   skill     the line names a Claude Code command rather than a shell one. Not
#             run by a shell. The command file has to exist in the plugin.
#   settles   more than one line would be honest here, so no shape is demanded
#             and the one thing true of all of them is: it does not lead to a
#             second refusal. A bare arrow is read and stops there, a Claude
#             Code command has to be in the plugin, and a shell command is run
#             and has to succeed. For the paths whose right answer depends on
#             the state of the folder rather than on what was typed: ge ledger
#             approve is a real command where the words are written and nothing
#             at all where they are not, so a path driven in both states cannot
#             declare one shape for both.

# Where rl_arrow leaves its two answers. Started empty here so that a case
# sourcing this file and reading them before any line has been examined gets an
# empty answer rather than falling over on an unset variable under set -u. An
# empty RL_FORM matches none of the three names, so nothing can pass on it.
RL_FORM=''
RL_AFTER=''
# How many arrow lines rl_every_arrow last read. Started at zero for the same
# reason, so a case reading it before any message has been examined is told none
# rather than stopping on an unset variable.
RL_ARROWS=0

# rl_arrow <line>: which shape this line is, and what follows the arrow.
#
#   run   the line carries "→ run: ", so everything after that marker, to the
#         end of the line, is ONE command a founder selects and pastes.
#   bare  the line carries "→ " and no "run: ", so it is the guidance shape: one
#         named thing the founder does by hand, which no command can do for them.
#   none  there is no arrow on the line at all, so the refusal named no way out.
#
# The run shape is looked for first, because a run line carries a bare arrow
# inside it and would otherwise be read as guidance, which is the weaker of the
# two and would let a broken command through.
#
# Both answers are left in globals rather than printed. There are two of them,
# and a caller reading them back through command substitution would run this in
# a subshell twice and cut a trailing newline off what it read. The line is what
# a founder was shown, so it is handed on exactly as it came in.
rl_arrow() {                            # <line>
  case $1 in
    *'→ run: '*) RL_FORM=run;  RL_AFTER=${1#*→ run: } ;;
    *'→ '*)      RL_FORM=bare; RL_AFTER=${1#*→ } ;;
    *)           RL_FORM=none; RL_AFTER='' ;;
  esac
}

# rl_tail_free <what follows the arrow> <label>: nothing but the command is on
# the arrow-run line.
#
# THE RULE THIS IS THE TEST FOR, and until now there was none. Everything after
# "→ run: " is the command, to the end of the line. A founder selects the whole
# line and pastes it, so an English clause after the command is not an
# explanation to them or to their shell: it is more arguments. "ge init, if this
# is the folder you want your Launchhouse work kept in" reaches ge as a command
# called "init," and ge answers that it has no such thing. The explanation
# belongs on its own line, with no arrow on it.
#
# The clause is looked for at quote depth zero only, which is why rl_part does
# the splitting: the comma inside ge log note "what happened, in one line" is
# part of the command and not a separator. Two separators are recognised,
# because those are the two this toolkit used, a comma and a space and a run of
# spaces. A clause joined on with neither is not visible here and is caught by
# running the line instead, which is what tests/cases/30-recovery-runs.sh does.
rl_tail_free() {                        # <what follows the arrow> <label>
  rl_t_rest=$(rl_part rest "$1")
  if [ -z "$rl_t_rest" ]; then t_pass; return 0; fi
  t_note "$2: the recovery line carries more than the command"
  { printf 'the whole line : %s\n' "$1"
    printf 'the command    : %s\n' "$(rl_part cmd "$1")"
    printf 'also pasted    : %s\n' "$rl_t_rest"
  } >> "$CASEWORK/diff.txt"
  t_fail "$2: English rides on the end of the command, so pasting the line runs something else"
  return 1
}

# rl_squote <text>: text in single quotes, safe for any byte. Used for the paths
# this file pastes into a script of its own, and for the values a template case
# substitutes in. The toolkit has its own ge_quote; this is the test side's, kept
# separate on purpose so a broken ge_quote cannot make its own proof pass.
rl_squote() {                           # <text>
  printf "'%s'\n" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

# rl_setup <bin dir>: a ge on PATH.
#
# Every recovery line in the toolkit says "ge something", because that is what a
# founder has: the plugin puts bin/ge on PATH. The suite runs the product as
# sh "$GE", which is not on PATH at all, so a pasted line would say ge: not
# found and prove nothing about the line. This puts one there for the length of
# the case, pointing at the same file the rest of the suite reads.
rl_setup() {                            # <bin dir>
  RL_BIN=$1
  RL_PATH0=$PATH
  mkdir -p "$RL_BIN" || t_die "the folder for the test copy of ge could not be made." \
    "df -h ${TMPDIR:-/tmp}, to see whether the disk is full"
  { printf '#!/bin/sh\n'
    printf 'exec sh %s "$@"\n' "$(rl_squote "$GE")"
  } > "$RL_BIN/ge" || t_die "the test copy of ge could not be written." "chmod u+w $RL_BIN"
  chmod +x "$RL_BIN/ge" || t_die "the test copy of ge could not be made runnable." \
    "chmod +x $RL_BIN/ge"
  RL_IN=/dev/null
  RL_FEED=/dev/null
  RL_FROM=''
  RL_TO=''
  RL_PATHS=''
}

# rl_watch <value>: one more value whose appearance in a recovery line has to
# survive being pasted. A sandbox folder named awkwardly on purpose, and the
# founder's own name, which is the same class of thing: two words with a space
# between them, printed back into a command. Every call adds one.
rl_watch() {                            # <value>
  RL_PATHS="$RL_PATHS$1
"
}

# rl_unwatch: forget them all, for a case that moves on to another sandbox.
rl_unwatch() {
  RL_PATHS=''
}

# rl_head <path>: the part of a path before the first character ge_quote treats
# as needing quotes. That prefix is what still appears in a line whichever way
# the path was written, so it is one half of asking "is this value in this line
# at all" before asking "and is it in one piece".
rl_head() {                             # <path>
  printf '%s' "$1" | LC_ALL=C sed 's|[^A-Za-z0-9/._-].*$||'
}

# rl_tail <path>: the other half. Everything after the LAST character ge_quote
# treats as needing quotes, which survives the same way the head does.
#
# WHY BOTH ENDS ARE NEEDED, AND WHAT WENT WRONG WITH ONE. The head on its own
# says "this value might be here", and a short head says it about lines that have
# nothing to do with the value. This sweep watches a founder called Sam Carter
# and, in the wide sandbox, a folder called Sam's [big] back\slash file. The head
# of the name is Sam, the folder's own name starts with Sam, and so every line
# naming the folder was asked to hold the person's name whole, failed, and
# reported a quoting fault in a line that never mentioned the person. That is a
# check claiming more than it examined, and a suite that reports a fault nobody
# can find is one people stop reading. Asking for the head AND the tail costs
# nothing and takes the coincidence away: a line has to look like the value at
# both ends before it is held to carrying it whole.
rl_tail() {                             # <path>
  printf '%s' "$1" | LC_ALL=C sed 's|^.*[^A-Za-z0-9/._-]||'
}

# rl_part <cmd|rest> <line>: the command a founder would paste, and whatever the
# line carries after it.
#
# The toolkit's own design note says the last line "contains exactly one runnable
# command", and its examples put an English clause after that command, separated
# by a comma or by a run of spaces. So the two are separated here the same way,
# at quote depth zero only: the comma inside ge log note "what happened, in one
# line" is part of the command and not a separator. Both halves are then checked,
# and they are checked apart: whether the command ge names is right is a
# different question from whether anything else is sitting on the line with it.
rl_part() {                             # <cmd|rest> <line>
  RL_WANT=$1
  RL_LINE=$2
  export RL_WANT RL_LINE
  LC_ALL=C awk '
    BEGIN {
      s = ENVIRON["RL_LINE"]
      n = length(s)
      st = 0                            # 0 outside, 1 in single quotes, 2 in double
      cut = 0
      for (i = 1; i <= n; i = i + 1) {
        c = substr(s, i, 1)
        if (st == 0) {
          if (c == "\047") { st = 1; continue }
          if (c == "\042") { st = 2; continue }
          if (c == "\\")   { i = i + 1; continue }
          if (c == "," && substr(s, i + 1, 1) == " ") { cut = i; break }
          if (c == " " && substr(s, i + 1, 1) == " ") { cut = i; break }
          continue
        }
        if (st == 1) { if (c == "\047") { st = 0 }; continue }
        if (c == "\042") { st = 0; continue }
        # Inside double quotes a backslash only escapes four characters. It is
        # left alone anywhere else, which is why "...\n" reaches printf whole.
        if (c == "\\") {
          d = substr(s, i + 1, 1)
          if (d == "\042" || d == "\\" || d == "$" || d == "`") { i = i + 1 }
          continue
        }
      }
      if (cut == 0) {
        if (ENVIRON["RL_WANT"] == "cmd") { print s } else { print "" }
      } else {
        if (ENVIRON["RL_WANT"] == "cmd") { print substr(s, 1, cut - 1) }
        else { print substr(s, cut) }
      }
    }
  ' < /dev/null
}

# rl_words <line> <out file>: the line split the way a shell splits it, one word
# per line, quotes and backslashes removed.
#
# This is the whole of the unquoted path check. A folder called "Sam Carter"
# written into a line without quotes arrives here as two words and the folder's
# name is then in neither of them, which is exactly what the founder's shell
# would do with it. A backslash in a folder name is eaten the same way. It does
# not expand a * or a [ , so a folder named with a bracket is caught by running
# the line rather than by reading it, and the case says so where it drives one.
rl_words() {                            # <line> <out file>
  RL_LINE=$1
  export RL_LINE
  LC_ALL=C awk '
    BEGIN {
      s = ENVIRON["RL_LINE"]
      n = length(s)
      st = 0; w = ""; has = 0
      for (i = 1; i <= n; i = i + 1) {
        c = substr(s, i, 1)
        if (st == 0) {
          if (c == "\047") { st = 1; has = 1; continue }
          if (c == "\042") { st = 2; has = 1; continue }
          if (c == "\\") { i = i + 1; if (i <= n) { w = w substr(s, i, 1); has = 1 }; continue }
          if (c == " " || c == "\t") { if (has) { print w }; w = ""; has = 0; continue }
          w = w c; has = 1; continue
        }
        if (st == 1) { if (c == "\047") { st = 0 } else { w = w c; has = 1 }; continue }
        if (c == "\042") { st = 0; continue }
        # Inside double quotes a backslash only escapes four characters, so
        # "acc_1|facebook|Lumen Skin\n" keeps its backslash and reaches printf
        # as the founder pasted it.
        if (c == "\\") {
          d = substr(s, i + 1, 1)
          if (d == "\042" || d == "\\" || d == "$" || d == "`") {
            i = i + 1; w = w d; has = 1
          } else {
            w = w c; has = 1
          }
          continue
        }
        w = w c; has = 1
      }
      if (has) { print w }
    }
  ' < /dev/null > "$2"
}

# rl_quoted <line> <label>: nothing this case is watching appears in the line
# broken into pieces.
#
# One check per driven path, and it only fires when the line looks like it names
# one of the watched values at both ends, so a line that names none passes it
# without pretending to have examined anything. The test is not "is there a quote
# character in the line": it is "would the founder's own shell see this value
# whole", which is the question that matters and the only one that catches a
# backslash being eaten or an apostrophe opening a quote that never closes. A
# folder named with a bracket is the one shape this cannot see, because the split
# above does not expand patterns; that one is caught by running the line, and
# the case drives a bracket folder for exactly that reason.
rl_quoted() {                           # <line> <label>
  rl_q_line=$1
  rl_q_lbl=$2
  rl_q_bad=''
  # Word splitting is pinned to the newline the watched values are held with, and
  # pathname expansion is turned off, because one of those values is a folder
  # named with a bracket and would otherwise be rewritten before it was read.
  rl_q_ifs=$IFS
  rl_q_noglob=''
  case $- in *f*) rl_q_noglob=1 ;; esac
  set -f
  IFS='
'
  for rl_q_p in $RL_PATHS; do
    [ -n "$rl_q_p" ] || continue
    rl_q_head=$(rl_head "$rl_q_p")
    rl_q_tail=$(rl_tail "$rl_q_p")
    # A value made only of characters that need quoting has neither anchor, so
    # there is nothing here that could tell whether the line names it. Skipped,
    # and skipped loudly rather than quietly held to nothing: none of the values
    # this suite watches is one of those, and if one ever is, this says so.
    if [ -z "$rl_q_head" ] && [ -z "$rl_q_tail" ]; then
      t_die "a value watched by 30-recovery-runs has no part that survives quoting: $rl_q_p." \
            "grep -n rl_watch tests/cases/30-recovery-runs.sh"
    fi
    # Both ends, so a value whose head turns up in a line by coincidence is not
    # then held to appearing whole in a line that never named it.
    case $rl_q_line in
      *"$rl_q_head"*) ;;
      *) continue ;;
    esac
    case $rl_q_line in
      *"$rl_q_tail"*) ;;
      *) continue ;;
    esac
    rl_words "$rl_q_line" "$CASEWORK/words"
    if ! grep -q -F -e "$rl_q_p" -- "$CASEWORK/words"; then
      rl_q_bad=$rl_q_p
      break
    fi
  done
  IFS=$rl_q_ifs
  [ -n "$rl_q_noglob" ] || set +f
  if [ -z "$rl_q_bad" ]; then t_pass; return 0; fi
  t_note "$rl_q_lbl: a value with a space in it is not in one piece"
  printf 'the line was:\n  %s\n' "$rl_q_line" >> "$CASEWORK/diff.txt"
  printf 'a shell reading that line never sees this whole:\n  %s\n' "$rl_q_bad" >> "$CASEWORK/diff.txt"
  printf 'what it sees instead:\n' >> "$CASEWORK/diff.txt"
  sed 's/^/  /' "$CASEWORK/words" >> "$CASEWORK/diff.txt"
  t_fail "$rl_q_lbl: a value with a space in it is not quoted"
  return 1
}

# rl_exec <text> <stdin file>: run it, here, as a founder would.
#
# Written to a file and read by sh rather than passed to eval, because a founder
# pastes a line into a shell and a shell is what has to read it: the marker
# punctuation in one of these lines is a redirection to a shell and nothing at
# all to eval. Standard input is a file, never the terminal, so a line that
# waits for typing ends rather than hanging the suite.
rl_exec() {                             # <text> <stdin file>
  printf '%s\n' "$1" > "$CASEWORK/recovery.cmd" || t_die \
    "the recovery line could not be written out to be run." "chmod u+w $CASEWORK"
  PATH="$RL_BIN:$RL_PATH0" sh "$CASEWORK/recovery.cmd" < "$2" \
    > "$CASEWORK/recovery.out" 2>&1
  RL_RC=$?
  return 0
}

# rl_first_line <file>: the first line, for saying what a refusal said without
# pasting a whole screen into the notes.
rl_first_line() {                       # <file>
  sed -n '1p' "$1" 2>/dev/null
}

# rl_last_line <file>: the last line with anything on it, which is where the
# recovery line is.
rl_last_line() {                        # <file>
  sed '/^[[:space:]]*$/d' "$1" | sed -n '$p'
}

# ---------------------------------------------------------------- the two rules

# THE CONTRACT THESE FOUR HOLD A LINE TO, written out once so no case has to
# state it again.
#
#   A RUN LINE. Everything after "→ run: " is the command, to the end of the
#   line. It pastes and it runs. No comma, no "then ...", no "which ...", no
#   explanation of any kind. The explanation goes on its own line ABOVE the
#   arrow, with no arrow of its own, and the arrow line stays last.
#
#   A BARE LINE. Where ge has no command, because only the founder knows the
#   value that was meant, the line is "→ " and one named action, with no "run:"
#   on it. A founder pastes out of habit, so the first word matters: "in" and
#   "then" are shell reserved words and a line opening on either is a syntax
#   error, exit 2, with nothing on the screen a founder can act on. A word that
#   is the name of a program is worse, because something runs.

# rl_reserved <word>: is this word one a shell reads as syntax rather than as a
# command. The POSIX list, plus the four bash and zsh add, because half this
# cohort is on the bash that ships with macOS and the rest on Git Bash.
rl_reserved() {                         # <word>
  case $1 in
    '!'|'{'|'}'|'[['|case|do|done|elif|else|esac|fi|for|function|if|in|select|then|time|until|while)
      return 0 ;;
  esac
  return 1
}

# rl_command_ok <line> <label>: one arrow line held to the run rule.
#
# The shape first, then the tail, because a line that is not a run line at all
# has no command for the tail rule to be about.
rl_command_ok() {                       # <line> <label>
  rl_arrow "$1"
  if [ "$RL_FORM" != run ]; then
    t_note "$2: a command was expected and this line does not carry one"
    printf 'the line was: %s\n' "$1" >> "$CASEWORK/diff.txt"
    printf 'a bare arrow says ge has nothing to paste, and this path has\n' >> "$CASEWORK/diff.txt"
    t_fail "$2: the way out is not offered as a command"
    return 1
  fi
  t_pass
  rl_tail_free "$RL_AFTER" "$2"
}

# rl_guidance_ok <line> <label>: one arrow line held to the bare rule.
#
# Three things, and the third is the one that costs a founder their session. A
# line reading "→ then put the missing marker back" is prose to a reader and a
# syntax error to the shell they paste it into, and the shell says nothing they
# can use. So the first word is held to being neither syntax nor the name of a
# program. The program half is asked of THIS machine, which is not every
# founder's machine, so a word that is a program somewhere else and nowhere here
# passes: 30-recovery-runs asks the same question with the test copy of ge on
# PATH, and that is where a line opening with a real command is caught.
rl_guidance_ok() {                      # <line> <label>
  rl_arrow "$1"
  if [ "$RL_FORM" != bare ]; then
    t_note "$2: declared guidance, and offered as a command to paste"
    printf 'the line was: %s\n' "$1" >> "$CASEWORK/diff.txt"
    printf 'ge cannot know the value meant here, so the line has to be a bare arrow\n' \
      >> "$CASEWORK/diff.txt"
    printf 'and an instruction, with no "run:" in front of it\n' >> "$CASEWORK/diff.txt"
    t_fail "$2: guidance is printed in the slot a founder pastes from"
    return 1
  fi
  t_pass
  if [ -z "$RL_AFTER" ]; then
    t_note "$2: the arrow names nothing"
    printf 'the line was: %s\n' "$1" >> "$CASEWORK/diff.txt"
    t_fail "$2: a bare arrow with nothing after it"
    return 1
  fi
  t_pass
  rl_g_word=${RL_AFTER%% *}
  if rl_reserved "$rl_g_word"; then
    t_note "$2: the guidance opens on a word the shell reads as syntax"
    printf 'the line was: %s\n' "$1" >> "$CASEWORK/diff.txt"
    printf 'pasted, %s makes this a syntax error and the shell says nothing a founder can use\n' \
      "$rl_g_word" >> "$CASEWORK/diff.txt"
    t_fail "$2: guidance opening with the reserved word $rl_g_word"
    return 1
  fi
  t_pass
  return 0
}

# rl_arrows <file> <out file>: every line in a message that carries an arrow, in
# the order a founder reads them.
rl_arrows() {                           # <file> <out file>
  grep -e '→' -- "$1" > "$2" 2>/dev/null
  return 0
}

# rl_every_arrow <file> <label>: EVERY arrow line in a message, each held to the
# rule for the shape it is.
#
# WHY THIS EXISTS. Both recovery cases used to read the last non-blank line and
# stop. One message, one line read. But a message can carry several: ge check
# prints an arrow for every failing leg, and ge accounts set with four bad rows
# prints an arrow for each of the four. Every one of those is a line somebody
# selects, and until now nothing in this suite had ever read one of them. A
# broken command could sit on any line but the last and no check would see it.
#
# The count is left in RL_ARROWS so a case can hold a message to carrying as many
# ways out as it has faults, which is the other half of the same promise.
#
# Read from a file rather than off the right of a pipe, because a loop there runs
# in a subshell and every check it recorded is thrown away with it: the shape of
# a check that reports nothing and passes.
rl_every_arrow() {                      # <file> <label>
  rl_arrows "$1" "$CASEWORK/arrows"
  RL_ARROWS=0
  while IFS= read -r rl_e_line; do
    RL_ARROWS=$((RL_ARROWS + 1))
    rl_arrow "$rl_e_line"
    case $RL_FORM in
      run)  rl_command_ok  "$rl_e_line" "$2, arrow $RL_ARROWS" ;;
      bare) rl_guidance_ok "$rl_e_line" "$2, arrow $RL_ARROWS" ;;
    esac
  done < "$CASEWORK/arrows"
  if [ "$RL_ARROWS" -eq 0 ]; then
    t_note "$2: no way out anywhere in the message"
    cat "$1" >> "$CASEWORK/diff.txt"
    t_fail "$2: the message carries no arrow at all"
    return 1
  fi
  t_pass
  return 0
}

# rl_ends <file> <run|bare> <label>: the shape of the LAST line with anything on
# it, which is the one a founder's eye lands on and the one three cases assert.
rl_ends() {                             # <file> <run|bare> <label>
  rl_n_last=$(rl_last_line "$1")
  case $2 in
    run)  rl_command_ok  "$rl_n_last" "$3" ;;
    bare) rl_guidance_ok "$rl_n_last" "$3" ;;
    *) t_die "rl_ends was asked for a shape it does not know: $2." \
             "grep -n rl_ends tests/cases" ;;
  esac
}
