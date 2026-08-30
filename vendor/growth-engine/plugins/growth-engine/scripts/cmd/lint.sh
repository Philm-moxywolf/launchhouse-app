# lint.sh: structural warnings about the founder's own files. Sourced by ge.sh.
#
# WHY IT EXISTS: the faults that cost a founder the event are quiet ones. A
#                status nobody can read, an approval given to text that has since
#                been rewritten, a marker pair a text editor broke, a memory file
#                that grew into a second log, an outreach sheet that is no longer
#                the list of people in the folder. None of them stop a command,
#                so none of them surface until a gate is missed. This says them
#                out loud, early, and it never stops anyone working.
# CALLED BY:     ge lint, ge check, the export step of the content skill
# READS:         every founder file, and the names of the working copies ge
#                leaves behind when a save stops part way
#                                      WRITES: nothing, ever
# POSTURE:       warn-only. Exit 0 whatever it finds, so no write is ever blocked
#                by a report. --strict exits 1 and exists for the build harness,
#                not for founders.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Strips \r and the byte order
#                mark a Windows editor leaves at the front of a file, before
#                every parse, the same way lib/paths.sh and ge person do.
# EVERY WARNING ENDS ON A RECOVERY LINE, IN ONE OF TWO SHAPES.
#                gl_warn ends on "  → run: " and a command, with nothing else on
#                that line, because a founder selects the line and pastes the
#                line. Anything worth saying about the command goes ABOVE it, on
#                a line with no arrow, so the arrow line is the last line.
#                gl_tell ends on a bare "  → " and one thing to do by hand, for
#                the faults ge cannot write a command for: a field only the
#                founder can supply, a marker line only they know the place of.
#                So "run: " on the screen always means pasteable, and a bare
#                arrow always means something to do in an editor.
#
# THE TWO FLAGS, AND WHY NEITHER IS IN ge help.
#   Both are accepted by gl_main at the foot of this file and by nothing else,
#   and both belong to whoever is running lint over somebody else's folder. A
#   founder runs ge lint with nothing after it, so ge help lists it with nothing
#   after it. Written down here because this file is where the next person looks,
#   and a flag that appears in no help and no document gets removed by somebody
#   who cannot see who uses it.
#
#   --strict            same report, byte for byte, and exit 1 when there was
#                       anything to report. Warnings count, and so do the gaps
#                       gl_gap records, which are checks this build cannot run at
#                       all. It is how the review harness reads a folder it built
#                       on purpose to be wrong: without it every person fault is
#                       warn-only, warn-only lint always exits 0, and an invalid
#                       example passes. Never put this in front of a founder. It
#                       turns a reading into a failure, and lint blocking a
#                       session is the one thing this file may not do.
#   --root <folder>     read that folder instead of walking up from here. Takes
#                       either the growth-engine folder itself or the folder that
#                       holds one. Same output as standing in it. It exists so a
#                       harness can lint a sandbox it is not standing in, and so
#                       a mentor can read a founder's folder without cd.
#
#   Together: ge lint --strict --root <folder>, which is the review harness line.

GL_WARNS=0
GL_GAPS=0
GL_STRICT=0
GL_ROOT=''
GL_HOME=''
GL_CR=$(printf '\r')
# The separator inside the records gl_firstlines builds. Held in a variable
# because those records are walked with parameter expansion rather than read from
# a pipe, and a pattern needs the tab itself, not the two characters that spell
# one. Built the same way GL_CR above is.
GL_TAB=$(printf '\t')

# gl_clean <text>: one line, and no arrow inside it. Founder text quoted back
# into a warning could carry either, and both would break the promise that the
# fault is one line and the way out is the last line. A newline in a value would
# push the arrow line up into the middle of the report, and an arrow in a value
# would read as a second way out that nothing wrote.
gl_clean() {
  printf '%s' "$1" | tr -d '\r' | tr '\n' ' ' | sed 's/→/ /g; s/  */ /g; s/ *$//'
}

# Two lines per warning, and a sentence in between where the command needs one.
# The first line names the file, and the line inside it when there is one. The
# last line is the way out. A warning a founder cannot act on is noise, and noise
# is what makes the next one get skipped.
#
# THE ARROW LINE IS THE LAST LINE, every time, and nothing rides on it.
# Everything after "→ run: " is what a founder selects and pastes, so a clause
# sitting behind the command went into the terminal with it. A line naming ge
# restore ledger.md and then explaining, after a comma, that it puts back the
# last copy ge wrote, reaches ge as a file whose name ends in a comma, and ge
# answers about a file nobody has.
#
# WHY THE SENTENCE SITS ABOVE THE ARROW AND NOT BELOW IT. It was below for a
# while, on a line of its own, lined up under the command. That still put it
# where a mouse picks it up: a founder dragging over the way out takes the arrow
# line and the line under it, and both go into the shell. Six of these sentences
# opened on the word "then", which is a shell reserved word, so what the founder
# got was a syntax error and no command run at all. Above the arrow, a sentence
# reads as the lead in to the command and the last line stays the one thing that
# pastes. This is the shape lib/paths.sh prints its own refusals in, so the two
# say the same thing the same way.
#
# The sentence is still written so that pasting it costs nothing. It opens on a
# word that is neither a shell reserved word nor the name of a program, the same
# test gl_tell puts its lines through two functions down, and it carries no
# angle brackets. A bracket belongs in the command, where it marks a value the
# founder fills in, but a shell reads <key> as a redirection, so the same three
# characters in a sentence turn a stray paste into an attempt to open one file
# and write over another. The command names the placeholders. The sentence
# talks about them in words.
gl_warn() {                             # <where> <what> <the command> [the sentence]
  printf 'WARN %s: %s\n' "$(gl_clean "$1")" "$(gl_clean "$2")"
  # Two spaces, the same indent as the arrow line, so the sentence and the way
  # out read as one block and the arrow still starts the last line.
  if [ "$#" -ge 4 ] && [ -n "${4:-}" ]; then
    printf '  %s\n' "$(gl_clean "$4")"
  fi
  printf '  → run: %s\n' "$(gl_clean "$3")"
  GL_WARNS=$((GL_WARNS + 1))
}

# gl_tell <where> <what> <the one thing to do>: a warning whose way out is not a
# command and never can be.
#
# A line a founder has to write into their own file by hand is not something ge
# can paste for them, and printing it after "→ run: " told them it was. They
# pasted it, and the shell answered about the punctuation in it. So it is printed
# after a bare arrow instead: "→ run: " on the screen now always means a line
# that pastes and runs, and a bare "→ " always means something to do by hand.
#
# The words are chosen so that the difference survives being ignored. Each one
# opens on a word that is neither a program nor a shell keyword, so a founder who
# pastes it anyway gets one "not found" and nothing is opened, moved or
# overwritten. Three words have already failed that test here: open, which is a
# program on every Mac in the room and was the first word of five of these lines,
# and in and then, which are reserved words and make the whole line a syntax
# error under sh and under dash. then failed in the sentence gl_warn prints, at
# six sites, which is the same test and the same class of word. All three were
# checked with command -v under a real sh and a real dash rather than under the
# zsh a terminal opens with, because zsh answers no for in and then, and both of
# the others answer yes. put, delete, take, give and keep are the ones in use
# here, and gl_warn adds Do, This, That and The above its arrow.
#
# TEST THE WORD IN THE CASE IT IS PRINTED IN. A Mac reads its own disk without
# minding capitals, so Read comes back as /usr/bin/read from command -v and would
# sit there waiting for typing if it were ever pasted. A capital is not a guard.
gl_tell() {                             # <where> <what> <the one thing to do>
  printf 'WARN %s: %s\n' "$(gl_clean "$1")" "$(gl_clean "$2")"
  printf '  → %s\n' "$(gl_clean "$3")"
  GL_WARNS=$((GL_WARNS + 1))
}

# gl_gap <the check that could not run> <what would let it run>: a check this
# build of the toolkit cannot perform at all, because a file of ge's own that the
# check compares against is not in the plugin.
#
# It is deliberately not a warning. Nothing in the founder's folder caused it,
# and there is no line they could be given that would fix it, and a recovery line
# that does not recover is worse than none. It is also not silence: --strict is
# the build harness and not a founder, and the harness is who has to see this
# before a version is frozen with a check in it that never runs. Printed on
# standard error and counted apart, so the founder's report is byte for byte
# what it was.
gl_gap() {
  GL_GAPS=$((GL_GAPS + 1))
  [ "$GL_STRICT" -eq 1 ] || return 0
  printf 'GAP   %s\n' "$(gl_clean "$1")" >&2
  printf '      %s\n' "$(gl_clean "$2")" >&2
}

# gl_readable <file> <how the founder sees it named>: true when lint can open it.
#
# Every leg asks before it reads. Without this the shell answered for us: a
# person file a sync client had hold of produced two raw lines naming lint.sh, a
# line number inside it and a path from inside the plugin, and then the checks
# below read nothing at all and reported a real prospect as not a person file,
# offering a line that moves them out of the people folder. A founder who follows
# that has lost the prospect and still cannot read the file.
#
# Said once per file however many legs ask, because two readers of one file that
# cannot be opened is one fault, not two.
GL_UNREADABLE=''
gl_readable() {
  [ -r "$1" ] && return 0
  # Both ends pinned with a newline, so one name cannot match inside another.
  case "
$GL_UNREADABLE" in
    *"
$1
"*) return 1 ;;
  esac
  GL_UNREADABLE="$GL_UNREADABLE$1
"
  gl_warn "$2" "this file could not be opened, so nothing in it was checked" \
    "chmod u+r $(ge_quote "$1")" "Do this, then run ge lint again."
  return 1
}

gl_rel() {
  printf 'growth-engine/%s' "${1#"$GL_HOME"/}"
}

# gl_plain <file>: the founder's file the way it reads on their screen, with the
# two marks a Windows editor leaves behind taken off. The carriage returns, and
# the byte order mark at the very start of the file.
#
# The mark is three bytes that no editor draws. lib/paths.sh takes it off the
# anchor and ge person takes it off a person header, and lint took it off
# nowhere, so one file was healthy to every other command and broken to this one.
# Worse than the disagreement was the advice: lint called line 1 a line nothing
# can read and said to make it a field or move it under ## Yours, and the only
# way to do either is to delete the file's own header comment. A founder cannot
# see three bytes, so they destroy a real line to silence a warning about nothing.
#
# GE_BOM comes from lib/paths.sh, which is loaded before this file. It is not
# defined again here, so there is one answer to what the mark is.
#
# The mark reaches awk through the environment and ENVIRON, never through -v:
# -v reads escape sequences in the value it is handed and would pass on a
# different string than the one it was given.
gl_plain() {
  GE_LINT_BOM=$GE_BOM awk '
    BEGIN { bom = ENVIRON["GE_LINT_BOM"] }
    { gsub(/\r/, "") }
    NR == 1 && index($0, bom) == 1 { $0 = substr($0, length(bom) + 1) }
    { print }
  ' "$1" 2>/dev/null
}

# gl_plural <n> <word>: one row, two rows. A founder reading "1 rows" stops
# trusting the rest of the line, and they are right to.
gl_plural() {
  if [ "$1" -eq 1 ]; then printf '%s %s' "$1" "$2"; else printf '%s %ss' "$1" "$2"; fi
}

# gl_lower <text>: the same text in lower case. Spelled out rather than written
# as a range, because a range means different things in different locales.
gl_lower() {
  printf '%s' "$1" | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz'
}

# gl_head_field <file> <label>: a value from the top of a founder file, read only
# above the first ## heading. The label is always a literal from this file, never
# a founder value, which is what keeps it out of the interpolation rule.
#
# The label is compared without case, and only against the part of the line in
# front of the first colon. ge index already reads the track that way, so with a
# literal match here a founder who retyped the header as "track:" was told by
# lint to go and answer the track question while every other command could
# already see the answer. Two readers of one line that disagree is worse than
# either of them being wrong on its own.
gl_head_field() {
  gl_hf_want=$(gl_lower "$2")
  gl_hf_out=''
  gl_hf_one=1
  while IFS= read -r gl_hf_l || [ -n "$gl_hf_l" ]; do
    gl_hf_l=${gl_hf_l%"$GL_CR"}
    # The mark only ever sits on the first line, and a Brain written by hand can
    # have a field on that line. Taken off one line at a time rather than through
    # gl_plain, because this loop sets values the caller reads and a pipe would
    # run it in a subshell where they are lost.
    if [ "$gl_hf_one" -eq 1 ]; then gl_hf_l=${gl_hf_l#"$GE_BOM"}; gl_hf_one=0; fi
    case $gl_hf_l in '## '*) break ;; esac
    case $gl_hf_l in *:*) ;; *) continue ;; esac
    gl_hf_lab=$(printf '%s' "${gl_hf_l%%:*}" | sed 's/^[-*#[:space:]]*//; s/[*[:space:]]*$//')
    [ "$(gl_lower "$gl_hf_lab")" = "$gl_hf_want" ] || continue
    gl_hf_out=${gl_hf_l#*:}
    gl_hf_out=$(printf '%s' "$gl_hf_out" | sed 's/^[*[:space:]]*//; s/[*[:space:]]*$//')
    break
  done < "$1"
  printf '%s' "$gl_hf_out"
}

# ---------------------------------------------------------------- the Brain

gl_brain() {
  gl_b_f="$GL_HOME/founder-brain.md"
  [ -f "$gl_b_f" ] || return 0
  gl_b_r=$(gl_rel "$gl_b_f")
  gl_readable "$gl_b_f" "$gl_b_r" || return 0

  for gl_b_h in Thesis Offer Audience Proof Goal Channels Voice Flags; do
    if ! gl_plain "$gl_b_f" | grep -q "^## $gl_b_h"; then
      gl_tell "$gl_b_r" "the $gl_b_h section is not there" \
        "take the Founder Brain step again, which asks the $gl_b_h questions"
    fi
  done

  # The value is read in lower case for the same reason the label is: ge index
  # lower cases it before it forks the file list, so B2B typed in capitals
  # already works everywhere else. The founder's own spelling is what gets
  # quoted back at them, because a warning about a value they cannot see on
  # their screen is a warning about nothing.
  gl_b_track_typed=$(gl_head_field "$gl_b_f" Track)
  gl_b_track=$(gl_lower "$gl_b_track_typed")
  if [ -z "$gl_b_track" ]; then
    gl_tell "$gl_b_r" "no Track is set, and every skill after this one reads it" \
      "take the Founder Brain step again, which asks the track question"
  elif ! enum_ok "$gl_b_track" b2b b2c; then
    gl_tell "$gl_b_r" "Track reads $gl_b_track_typed, and the only two values are b2b and b2c" \
      "take the Founder Brain step again, which asks the track question"
  fi

  # Model is a B2C question only. Asking a B2B founder for one would be asking
  # them about the other track's material, which is the one thing never to do.
  if [ "$gl_b_track" = b2c ]; then
    gl_b_model_typed=$(gl_head_field "$gl_b_f" Model)
    gl_b_model=$(gl_lower "$gl_b_model_typed")
    if [ -z "$gl_b_model" ]; then
      gl_tell "$gl_b_r" "no Model is set, and the B2C skills fork on service or ecommerce" \
        "take the Founder Brain step again, which asks the model question"
    elif ! enum_ok "$gl_b_model" service ecommerce; then
      gl_tell "$gl_b_r" "Model reads $gl_b_model_typed, and the only two values are service and ecommerce" \
        "take the Founder Brain step again, which asks the model question"
    fi
  fi

  gl_b_locked=$(gl_head_field "$gl_b_f" Locked)
  if [ -z "$gl_b_locked" ]; then
    gl_tell "$gl_b_r" "there is no Locked date, so gate A cannot count this brain" \
      "take the Founder Brain step again, which locks the brain when you are happy with it"
  elif [ -z "$(iso_to_epoch "$gl_b_locked")" ]; then
    gl_tell "$gl_b_r" "the Locked date reads $gl_b_locked, and the format is YYYY-MM-DD" \
      "take the Founder Brain step again, which sets the lock date"
  fi

  if ! gl_plain "$gl_b_f" | grep -q '^## Numbers'; then
    gl_tell "$gl_b_r" "there is no Numbers section, and the plan projects from those numbers" \
      "take the Founder Brain step again, which asks the numbers questions"
    return 0
  fi

  gl_b_vals=$(gl_plain "$gl_b_f" \
    | awk '/^## Numbers/ { inblock = 1; next } /^## / { inblock = 0 } inblock' \
    | grep ':' | sed 's/^[^:]*://; s/^[*[:space:]]*//; s/[*[:space:]]*$//' | grep .)
  gl_b_total=$(printf '%s\n' "$gl_b_vals" | grep -c . )
  gl_b_unknown=$(printf '%s\n' "$gl_b_vals" | grep -ci '^unknown$')
  if [ "$gl_b_total" -gt 0 ] && [ "$gl_b_total" -eq "$gl_b_unknown" ]; then
    gl_tell "$gl_b_r" "every number in the Numbers section reads unknown, and a plan cannot project from nothing" \
      "take the Founder Brain step again, which asks for the numbers you do know"
  fi
}

# --------------------------------------------------------------- the ledger

# Field counts and enums, per row type. A row that gained or lost a field has
# shifted every field after it, so the status a founder reads and the status a
# gate reads are two different strings in the same row.
gl_ledger() {
  gl_l_f="$GL_HOME/ledger.md"
  [ -f "$gl_l_f" ] || return 0
  gl_l_r=$(gl_rel "$gl_l_f")
  gl_readable "$gl_l_f" "$gl_l_r" || return 0
  gl_l_n=0
  gl_l_approved=0
  gl_l_orows=0
  gl_l_drows=0
  gl_l_ofirst=0
  gl_l_dfirst=0
  while IFS= read -r gl_l_line || [ -n "$gl_l_line" ]; do
    gl_l_n=$((gl_l_n + 1))
    gl_l_line=${gl_l_line%"$GL_CR"}
    # A ledger saved by a Windows editor carries the mark on line 1, which turned
    # a real row into a line lint walked straight past.
    [ "$gl_l_n" -eq 1 ] && gl_l_line=${gl_l_line#"$GE_BOM"}
    case $gl_l_line in
      'C|'*) gl_l_want=8 ;;
      'O|'*)
        gl_l_want=6
        gl_l_orows=$((gl_l_orows + 1))
        [ "$gl_l_ofirst" -eq 0 ] && gl_l_ofirst=$gl_l_n
        ;;
      'D|'*)
        gl_l_want=5
        gl_l_drows=$((gl_l_drows + 1))
        [ "$gl_l_dfirst" -eq 0 ] && gl_l_dfirst=$gl_l_n
        ;;
      *) continue ;;
    esac
    gl_l_type=${gl_l_line%%|*}
    gl_l_have=$(row_count "$gl_l_line")
    if [ "$gl_l_have" -ne "$gl_l_want" ]; then
      gl_warn "$gl_l_r line $gl_l_n" \
        "this $gl_l_type row has $gl_l_have fields and a $gl_l_type row has $gl_l_want" \
        "ge restore ledger.md" "That puts back the last copy ge wrote."
      continue
    fi
    case $gl_l_type in
      C)
        gl_l_lane=$(row_field "$gl_l_line" 5)
        gl_l_stat=$(row_field "$gl_l_line" 6)
        enum_ok "$gl_l_lane" text media || gl_warn "$gl_l_r line $gl_l_n" \
          "the lane reads $gl_l_lane, and a content row is text or media" \
          "ge restore ledger.md" "That puts back the last copy ge wrote."
        enum_ok "$gl_l_stat" draft approved scheduled posted failed archived || \
          gl_warn "$gl_l_r line $gl_l_n" \
            "the status reads $gl_l_stat, and a content row is draft, approved, scheduled, posted, failed or archived" \
            "ge restore ledger.md" "That puts back the last copy ge wrote."
        [ "$gl_l_stat" = approved ] && gl_l_approved=$((gl_l_approved + 1))
        ;;
      O)
        gl_l_stat=$(row_field "$gl_l_line" 5)
        gl_l_first=$(row_field "$gl_l_line" 6)
        enum_ok "$gl_l_stat" candidate cut contacted_ok enrolled replied stopped || \
          gl_warn "$gl_l_r line $gl_l_n" \
            "the status reads $gl_l_stat, and an outreach row is candidate, cut, contacted_ok, enrolled, replied or stopped" \
            "ge restore ledger.md" "That puts back the last copy ge wrote."
        enum_ok "$gl_l_first" y n || gl_warn "$gl_l_r line $gl_l_n" \
          "the first line flag reads $gl_l_first, and it is y or n" \
          "ge restore ledger.md" "That puts back the last copy ge wrote."
        ;;
      D)
        gl_l_plat=$(row_field "$gl_l_line" 3)
        gl_l_stat=$(row_field "$gl_l_line" 4)
        enum_ok "$gl_l_plat" ig fb other || gl_warn "$gl_l_r line $gl_l_n" \
          "the platform reads $gl_l_plat, and it is ig, fb or other" \
          "ge restore ledger.md" "That puts back the last copy ge wrote."
        enum_ok "$gl_l_stat" target opener_written sent replied booked no_reply || \
          gl_warn "$gl_l_r line $gl_l_n" \
            "the status reads $gl_l_stat, and a DM row is target, opener_written, sent, replied, booked or no_reply" \
            "ge restore ledger.md" "That puts back the last copy ge wrote."
        ;;
    esac
  done < "$gl_l_f"
  GL_APPROVED=$gl_l_approved

  # People moved out of the ledger and into their own files, and ge ledger no
  # longer writes either row. A survivor is a folder made before that, so it is
  # reported once per row type rather than once per person.
  if [ "$gl_l_orows" -gt 0 ]; then
    gl_warn "$gl_l_r line $gl_l_ofirst" \
      "the ledger still holds $(gl_plural "$gl_l_orows" 'outreach row'), and people live in growth-engine/people/ now" \
      "ge person add prospect <email> \"<name>\"" "Do this for each row, then delete those lines from ledger.md."
  fi
  if [ "$gl_l_drows" -gt 0 ]; then
    gl_warn "$gl_l_r line $gl_l_dfirst" \
      "the ledger still holds $(gl_plural "$gl_l_drows" 'DM row'), and people live in growth-engine/people/ now" \
      "ge person add target <platform> <handle> \"<name>\"" "Do this for each row, then delete those lines from ledger.md."
  fi
}

# ------------------------------------------------------------------ the CSV

# gl_csv_cell_index <headerline>: which column carries the words of the post.
# The header row is the GoHighLevel template, committed verbatim, so the column
# is looked up by name rather than assumed at a position. Nothing is checked when
# no column matches, because a guessed column would report every row as wrong.
gl_csv_cell_index() {
  printf '%s\n' "$1" | tr -d '"' | awk -F',' '
    {
      for (i = 1; i <= NF; i++) if (tolower($i) ~ /content/)          { print i; exit }
      for (i = 1; i <= NF; i++) if (tolower($i) ~ /message|caption/)  { print i; exit }
      for (i = 1; i <= NF; i++) if (tolower($i) ~ /post|text/)        { print i; exit }
    }'
}

gl_csv() {
  gl_c_csv="$GL_HOME/content-30.csv"
  gl_c_md="$GL_HOME/content-30.md"
  [ -f "$gl_c_csv" ] || return 0
  gl_c_r=$(gl_rel "$gl_c_csv")
  gl_readable "$gl_c_csv" "$gl_c_r" || return 0

  gl_c_rows=$(gl_plain "$gl_c_csv" | grep -c . )
  gl_c_data=$((gl_c_rows - 1))
  [ "$gl_c_data" -lt 0 ] && gl_c_data=0
  if [ "$gl_c_data" -gt 90 ]; then
    gl_tell "$gl_c_r" "there are $gl_c_data rows and the Social Planner takes 90" \
      "take the content engine step again, and export as two batches"
  fi

  # Excel writes the mark at the front of every CSV it saves as UTF-8, so the
  # header row is read the same way every other founder file is.
  gl_c_h1=$(gl_plain "$gl_c_csv" | sed -n '1p')

  # One line compares byte for byte in the shell, so no temporary file is made
  # inside a folder that lint has no business writing to.
  #
  # The template is the header GoHighLevel gave us, committed verbatim. It is not
  # in this build, so this check cannot run at all. That is said out loud to the
  # harness rather than passed over, because a founder whose header is wrong
  # otherwise gets a clean report from lint and finds out when the Social Planner
  # import maps their thirty posts into the wrong columns. It is not said to the
  # founder: a missing file of ge's own is not something they can put right.
  #
  # THERE AND READABLE ARE TWO QUESTIONS, and the second one was not asked. A
  # template that is there and will not open reads out of gl_plain as an empty
  # line, and an empty line is not the founder's header, so a founder whose
  # header was right to the byte was told it was wrong and sent to write their
  # thirty posts again. The line would not have cleared it either: the next run
  # compares against the same file it still cannot read, and says the same thing.
  # It lands with the missing file rather than with a warning, because a file of
  # ge's own that cannot be read is no more the founder's to put right than one
  # that was never shipped. Which of the two it is has to be said apart, because
  # a gap that says the build has no template when the template is sitting there
  # sends the harness looking for the wrong thing.
  gl_c_tpl="$GE_HOME_DIR/assets/ghl/social-planner-template.csv"
  if [ -f "$gl_c_tpl" ] && [ -r "$gl_c_tpl" ]; then
    gl_c_h2=$(gl_plain "$gl_c_tpl" | sed -n '1p')
    if [ "$gl_c_h1" != "$gl_c_h2" ]; then
      gl_tell "$gl_c_r line 1" "the header row is not the one GoHighLevel gave us, so the import will map the wrong columns" \
        "take the content engine step again, and export the CSV afterwards"
    fi
  elif [ -f "$gl_c_tpl" ]; then
    gl_gap "the CSV header check did not run: this build ships assets/ghl/social-planner-template.csv but this machine would not open it, so nothing says what the header should be" \
      "hand that file back with chmod u+r, or take the check out. Until then a wrong header reads as a clean report."
  else
    gl_gap "the CSV header check did not run: this build has no assets/ghl/social-planner-template.csv, so nothing says what the header should be" \
      "add that file to the plugin from the Social Planner export, or take the check out. Until then a wrong header reads as a clean report."
  fi

  [ -f "$gl_c_md" ] || return 0
  # Read but not opened, the flattened markdown below is empty and every row in
  # the CSV then looks like a row that no longer matches it. Thirty false
  # warnings, and a founder sent off to export words they had already edited.
  gl_readable "$gl_c_md" "$(gl_rel "$gl_c_md")" || return 0

  # Divergence. Every cell is quoted by the exporter, so the field separator is
  # quote comma quote, which is how the acceptance blocks read this file too.
  # A row whose field count differs is a record the founder wrapped over two
  # lines: skipped rather than reported, because a wrapped line is not a fault.
  gl_c_col=$(gl_csv_cell_index "$gl_c_h1")
  case ${gl_c_col:-x} in
    ''|*[!0-9]*) return 0 ;;
  esac
  gl_c_ncol=$(printf '%s\n' "$gl_c_h1" | awk -F'","' '{ print NF }')

  # The markdown side, with every run of whitespace flattened to one space and
  # the whole file on one line. The exporter renders a post's line breaks as
  # spaces, so a post written as a hook, a blank line, then the body can never
  # be found in the file it came from while the two are compared as written.
  # That is the house shape for a social post, so the false warning fired across
  # a large share of a founder's thirty pieces and sent them off to re-export
  # words they had already edited. tr, not sed, because this is one very long
  # line and sed is the tool with a line length to run into.
  gl_c_flat=$(gl_plain "$gl_c_md" | tr '\t\n' '  ' | tr -s ' ')

  # Both numbers go through the environment and ENVIRON, never through awk -v.
  # awk -v reads escape sequences in the value it is given, and a value handed to
  # awk that way is what emptied founders' memory.md while reporting it saved.
  # These two are digits: the column is guarded a few lines up and the field
  # count came from awk itself, so nothing is at risk here today. The point is
  # that one rule holds in every file, so widening either of them later cannot
  # quietly bring that back. lib/blocks.sh and ge context read theirs the same way.
  gl_c_bad=$(GL_C_COL=$gl_c_col GL_C_NCOL=$gl_c_ncol awk -F'","' '
    BEGIN { col = ENVIRON["GL_C_COL"] + 0; ncol = ENVIRON["GL_C_NCOL"] + 0 }
    NR == 1 { next }
    NF != ncol { next }
    {
      cell = $col
      gsub(/^"/, "", cell)
      gsub(/"$/, "", cell)
      gsub(/""/, "\"", cell)
      print NR "\t" cell
    }' "$gl_c_csv" | tr -d '\r' | while IFS="$(printf '\t')" read -r gl_c_n gl_c_txt; do
      [ -n "$gl_c_txt" ] || continue
      # Flattened the same way the markdown side was, then the opening of it.
      # Compared with case rather than grep, so a cell carrying a bracket or a
      # star is looked for as the founder's own text and not as a pattern. Each
      # pattern opens with its own bracket, because this case sits inside a
      # command substitution and a shell reading the first unmatched bracket
      # would take it for the end of that.
      gl_c_head=$(printf '%s' "$gl_c_txt" | tr '\t' ' ' | tr -s ' ' | sed 's/^ //; s/ $//')
      gl_c_head=$(printf '%.40s' "$gl_c_head")
      [ -n "$gl_c_head" ] || continue
      case $gl_c_flat in
        (*"$gl_c_head"*) ;;
        (*) printf '%s ' "$gl_c_n" ;;
      esac
    done)

  if [ -n "$gl_c_bad" ]; then
    gl_tell "$gl_c_r" \
      "these rows no longer match content-30.md, so the CSV is older than the words you edited (rows $(printf '%s' "$gl_c_bad" | sed 's/[[:space:]]*$//'))" \
      "take the content engine step again, and export the CSV from the edited text"
  fi
}

# An approval is of one text. Edit the text and the approval belongs to a version
# nobody has now. The stamp is read as a date, and falls back to when the stamp
# file itself was written, because either one answers the same question.
gl_approval() {
  gl_a_stamp="$GL_HOME/.state/approved-at"
  gl_a_md="$GL_HOME/content-30.md"
  [ -f "$gl_a_stamp" ] || return 0
  [ -f "$gl_a_md" ] || return 0
  [ "${GL_APPROVED:-0}" -gt 0 ] || return 0
  # The stamp lives in .state, which a founder never opens, so the fallback below
  # would answer from the file's own date and never say the read had failed.
  gl_readable "$gl_a_stamp" "$(gl_rel "$gl_a_stamp")" || return 0

  gl_a_when=$(iso_to_epoch "$(tr -d '\r' < "$gl_a_stamp" | sed -n '1p')")
  [ -n "$gl_a_when" ] || gl_a_when=$(date -r "$gl_a_stamp" '+%s' 2>/dev/null)
  gl_a_edited=$(date -r "$gl_a_md" '+%s' 2>/dev/null)
  case ${gl_a_when:-x}${gl_a_edited:-x} in
    *[!0-9]*) return 0 ;;
  esac

  if [ "$gl_a_when" -lt "$gl_a_edited" ]; then
    gl_warn "$(gl_rel "$GL_HOME/ledger.md")" \
      "content-30.md was edited after you approved it, so the approval is of a version nobody has now" \
      "ge ledger approve --all-text" "Do this once you have gone through the edited text again."
  fi
}

# ------------------------------------------------------------------- memory

# The budget. A memory that grows without bound stops being curated and becomes
# a second log, and then nothing reads it at all.
gl_memory() {
  gl_m_f="$GL_HOME/memory.md"
  [ -f "$gl_m_f" ] || return 0
  gl_m_r=$(gl_rel "$gl_m_f")
  gl_readable "$gl_m_f" "$gl_m_r" || return 0
  gl_m_total=0
  gl_m_big=''
  gl_m_bign=0
  for gl_m_pair in DECISIONS:decision WORKED:worked DIDNOT:didnot VOICE:voice ANGLES:angle THREADS:thread; do
    gl_m_name=${gl_m_pair%%:*}
    gl_m_n=$(block_read "$gl_m_f" "$gl_m_name" 2>/dev/null | grep -c '^- ')
    gl_m_total=$((gl_m_total + gl_m_n))
    if [ "$gl_m_n" -gt "$gl_m_bign" ]; then
      gl_m_bign=$gl_m_n
      gl_m_big=$gl_m_pair
    fi
  done
  gl_m_bytes=$(wc -c < "$gl_m_f" | tr -d ' ')

  [ "$gl_m_total" -gt 60 ] || [ "$gl_m_bytes" -gt 8192 ] || return 0
  [ -n "$gl_m_big" ] || return 0

  gl_m_type=${gl_m_big#*:}
  gl_m_oldest=$(block_read "$gl_m_f" "${gl_m_big%%:*}" 2>/dev/null | grep '^- ' \
    | sed -n '1,2p' | sed 's/ (detail .*$//' | cut -c3-52 \
    | tr '\n' ';' | sed 's/;$//; s/;/; /g')
  gl_warn "$gl_m_r" \
    "$gl_m_total entries and $gl_m_bytes bytes, over the budget of 60 entries and 8 KB. The biggest block is $gl_m_type, and its oldest are: $gl_m_oldest" \
    "ge remember list $gl_m_type" "That numbers them, and ge remember forget $gl_m_type takes out the ones you are done with, by number."
}

# ------------------------------------------------- managed marker integrity

# A start marker with no end is the one case that must never be repaired by
# guessing, so it is reported rather than fixed. Everything that writes into a
# marked block refuses while the file is in this state.
#
# What is wrong and what to do about it both come from lib/blocks.sh, the way ge
# person takes them, so the linter and the refusal a founder gets from the write
# itself describe one file the same way. Written out here instead, lint called a
# file with two start lines and two end lines a block that "starts and never
# ends" and told the founder to add a third end line. They did, twice, and got
# the identical sentence back both times.
#
# Names are collected from end markers as well as start markers. Collected from
# start markers alone, a file whose start line was the one deleted had no name to
# look up, so the shape ge refuses to write to was the shape lint could not see.
gl_blocks_file() {
  gl_bf_f=$1
  [ -f "$gl_bf_f" ] || return 0
  gl_bf_r=$(gl_rel "$gl_bf_f")
  gl_readable "$gl_bf_f" "$gl_bf_r" || return 0
  # Two expressions rather than one alternation: \| is a GNU extension and BSD
  # sed, which is the sed on every Mac in the room, does not have it.
  gl_bf_names=$(gl_plain "$gl_bf_f" \
    | sed -n -e 's/.*<!-- GE:\([A-Za-z0-9_]*\):START -->.*/\1/p' \
             -e 's/.*<!-- GE:\([A-Za-z0-9_]*\):END -->.*/\1/p' | LC_ALL=C sort -u)
  for gl_bf_n in $gl_bf_names; do
    # One pass, and both answers come out of it: the code that says whether this
    # shape must never be guessed at, and the shape itself.
    gl_bf_out=$(block_scan "$gl_bf_f" "$gl_bf_n")
    [ $? -eq 2 ] || continue
    gl_bf_line=$(gl_plain "$gl_bf_f" \
      | grep -n -F -e "$(block_start "$gl_bf_n")" -e "$(block_end "$gl_bf_n")" \
      | sed -n '1p' | cut -d: -f1)
    case ${gl_bf_out%% *} in
      # The one shape that keeps its own sentence, because "holds one start line
      # and no end line" is a count and this says what it costs them.
      lone-start)
        gl_bf_say="the GE:$gl_bf_n block starts and never ends, so nothing will write into it" ;;
      *)
        gl_bf_say="the GE:$gl_bf_n block $(block_problem "$gl_bf_f" "$gl_bf_n")" ;;
    esac
    # WHICH ARROW, asked rather than assumed. Five of the seven shapes
    # lib/blocks.sh knows have no command behind them: a marker line the founder
    # deleted can only be put back by them, in their editor, because only they
    # know where their own section stops. This used to print all seven behind
    # "run: ", so the report told a founder to paste a sentence, and the marker
    # punctuation in it is a redirection to a shell. block_fix_kind is written by
    # the same code that writes the words, so the two cannot drift apart.
    if [ "$(block_fix_kind "$gl_bf_f" "$gl_bf_n")" = command ]; then
      gl_warn "$gl_bf_r line ${gl_bf_line:-1}" "$gl_bf_say" \
        "$(block_fix "$gl_bf_f" "$gl_bf_n")"
    else
      gl_tell "$gl_bf_r line ${gl_bf_line:-1}" "$gl_bf_say" \
        "$(block_fix "$gl_bf_f" "$gl_bf_n")"
    fi
  done
}

# Named one at a time rather than looped over a list, because a founder folder
# on a Desktop called "My Business" has a space in its path and a list would
# split on it. Person files are covered where they are enumerated.
gl_blocks() {
  gl_blocks_file "$GL_HOME/memory.md"
  gl_blocks_file "$GL_HOME/dm-openers.md"
}

# ------------------------------------------------------------- person files

# The slug rule, applied forwards. Any code holding the key can find the file,
# so a file named anything else cannot be found from its key at all.
gl_slug() {
  printf '%s' "$1" \
    | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz' \
    | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' \
    | cut -c1-60 | sed 's/-$//'
}

# gl_free_name <folder> <stem>: the first name in that folder nothing is using,
# tried as <stem>.md and then <stem>-2.md up to <stem>-9.md. Prints nothing and
# returns 1 when all of them are taken.
#
# Every recovery line here that moves a file goes through this. A line reading
# mv onto a name that already exists deletes whatever was under it, so a scratch
# file a founder happened to call memory.md would be moved on top of their real
# memory file by the very line offered to rescue it.
gl_free_name() {
  gl_fn_try="$1/$2.md"
  gl_fn_i=2
  while [ -e "$gl_fn_try" ] && [ "$gl_fn_i" -le 9 ]; do
    gl_fn_try="$1/$2-$gl_fn_i.md"
    gl_fn_i=$((gl_fn_i + 1))
  done
  [ -e "$gl_fn_try" ] && return 1
  printf '%s' "$gl_fn_try"
}

gl_person_field() {
  gl_pf_want=$2
  gl_pf_out=''
  gl_pf_one=1
  while IFS= read -r gl_pf_l || [ -n "$gl_pf_l" ]; do
    gl_pf_l=${gl_pf_l%"$GL_CR"}
    if [ "$gl_pf_one" -eq 1 ]; then gl_pf_l=${gl_pf_l#"$GE_BOM"}; gl_pf_one=0; fi
    case $gl_pf_l in '## '*) break ;; esac
    case $gl_pf_l in
      "$gl_pf_want: "*)
        [ -n "$gl_pf_out" ] || gl_pf_out=${gl_pf_l#"$gl_pf_want": }
        ;;
    esac
  done < "$1"
  printf '%s' "$gl_pf_out"
}

# gl_person_any <file>: does the header hold even one field ge writes?
#
# A file with none of them was never a person. Dropping a scratch note or an
# exported list into a folder called people is the obvious thing to do with it,
# and the field by field warnings then chase a person who does not exist, each
# one ending in a command with a literal <key> in it that nobody can run.
gl_person_any() {
  gl_pa_hit=1
  gl_pa_one=1
  while IFS= read -r gl_pa_l || [ -n "$gl_pa_l" ]; do
    gl_pa_l=${gl_pa_l%"$GL_CR"}
    if [ "$gl_pa_one" -eq 1 ]; then gl_pa_l=${gl_pa_l#"$GE_BOM"}; gl_pa_one=0; fi
    case $gl_pa_l in '## '*) break ;; esac
    gl_pa_n=${gl_pa_l%%:*}
    [ "$gl_pa_n" = "$gl_pa_l" ] && continue
    enum_ok "$gl_pa_n" key kind name status source created email email_status \
      first_name company title found_via why_them link priority follow_up_on \
      ghl_contact_id apollo_contact_id platform handle platform_label || continue
    gl_pa_hit=0
    break
  done < "$1"
  return $gl_pa_hit
}

gl_person_header() {
  gl_ph_f=$1
  gl_ph_r=$2
  gl_ph_n=0
  gl_ph_seen=''
  while IFS= read -r gl_ph_l || [ -n "$gl_ph_l" ]; do
    gl_ph_n=$((gl_ph_n + 1))
    gl_ph_l=${gl_ph_l%"$GL_CR"}
    # Line 1 of a person file is ge's own header comment, and a Windows editor
    # puts the mark in front of it. Left on, the comment stopped reading as a
    # comment and lint sent the founder to make it a field or move it, which
    # means deleting it. Three bytes they cannot see, one real line destroyed.
    [ "$gl_ph_n" -eq 1 ] && gl_ph_l=${gl_ph_l#"$GE_BOM"}
    case $gl_ph_l in '## '*) return 0 ;; esac
    case $gl_ph_l in
      '') continue ;;
      '#'*) continue ;;
      '<!--'*) continue ;;
    esac
    # A field is a lower case name, a colon, one space, then a value. Anything
    # else in the header is refused by ge person, so lint says the same thing
    # rather than passing a line the writer will later reject.
    gl_ph_name=${gl_ph_l%%:*}
    gl_ph_ok=0
    if [ "$gl_ph_name" != "$gl_ph_l" ] && \
       [ -z "$(printf '%s' "$gl_ph_name" | sed 's/^[a-z][a-z0-9_]*$//')" ]; then
      case $gl_ph_l in
        "$gl_ph_name: "*) gl_ph_ok=1 ;;
        "$gl_ph_name:") gl_ph_ok=1 ;;
      esac
    fi
    if [ "$gl_ph_ok" -eq 0 ]; then
      gl_tell "$gl_ph_r line $gl_ph_n" \
        "this line is not a field and not a comment, so nothing can read it" \
        "put that line under ## Yours in $gl_ph_r, or turn it into a field"
      continue
    fi
    gl_ph_val=${gl_ph_l#*:}
    gl_ph_val=${gl_ph_val# }
    if [ -z "$(printf '%s' "$gl_ph_val" | sed 's/[[:space:]]//g')" ]; then
      gl_warn "$gl_ph_r line $gl_ph_n" \
        "$gl_ph_name has no value, and a field the founder does not have is a field that is not in the file" \
        "ge person set <key> $gl_ph_name \"<value>\""
      continue
    fi
    if ! enum_ok "$gl_ph_name" key kind name status source created email email_status \
        first_name company title found_via why_them link priority follow_up_on \
        ghl_contact_id apollo_contact_id platform handle platform_label; then
      gl_warn "$gl_ph_r line $gl_ph_n" \
        "$gl_ph_name is not a field ge knows, so nothing will ever read it" \
        "ge person set <key> <field> \"<value>\"" "The field has to be one ge knows."
      continue
    fi
    # link is the one repeatable field. Every other repeat is two facts in one
    # file with nothing to say which is current.
    if [ "$gl_ph_name" != link ]; then
      case " $gl_ph_seen " in
        *" $gl_ph_name "*)
          gl_tell "$gl_ph_r line $gl_ph_n" \
            "$gl_ph_name appears twice, and ge will not pick one of them for you" \
            "delete the one that is out of date from $gl_ph_r" ;;
        *) gl_ph_seen="$gl_ph_seen $gl_ph_name" ;;
      esac
    fi
  done < "$gl_ph_f"
}

gl_person_body() {
  gl_pb_f=$1
  gl_pb_r=$2
  for gl_pb_pair in 'TOUCH:touch log' 'NOTES:notes'; do
    gl_pb_block=${gl_pb_pair%%:*}
    gl_pb_label=${gl_pb_pair#*:}
    block_check "$gl_pb_f" "$gl_pb_block"
    [ $? -eq 0 ] || continue
    gl_pb_i=0
    # The group carries the 2>/dev/null, and it has to. Redirections are applied
    # left to right, so a bare `> "$GL_TMP" 2>/dev/null` reports the failure of
    # the first one before the second one is in place, and what reaches the
    # founder is the shell's own line: this file's name, a line number inside it,
    # and the name of a scratch file they have never heard of. Wrapped, the same
    # failure is silent and the checks below are skipped instead.
    if ! { block_read "$gl_pb_f" "$gl_pb_block" > "$GL_TMP"; } 2>/dev/null; then
      continue
    fi
    while IFS= read -r gl_pb_l || [ -n "$gl_pb_l" ]; do
      gl_pb_i=$((gl_pb_i + 1))
      gl_pb_l=${gl_pb_l%"$GL_CR"}
      # A blank line inside a block is spacing, not a fault. The fault this
      # catches is a pasted note whose second line lost its bullet.
      [ -z "$(printf '%s' "$gl_pb_l" | sed 's/[[:space:]]//g')" ] && continue
      case $gl_pb_l in
        '- '*) : ;;
        *)
          gl_tell "$gl_pb_r" \
            "line $gl_pb_i of the $gl_pb_label does not start with a dash, so it reads as part of the line above" \
            "put that line back on the entry it belongs to in $gl_pb_r"
          continue ;;
      esac
      gl_pb_text=${gl_pb_l#- }
      if [ "$(printf '%s' "$gl_pb_text" | wc -c | tr -d ' ')" -le 2 ]; then
        gl_warn "$gl_pb_r" \
          "line $gl_pb_i of the $gl_pb_label is a single character, which is what a shredded sentence looks like" \
          "ge restore $(ge_quote "people/${gl_pb_r##*/}")" "That puts back the last copy ge wrote."
        continue
      fi
      [ "$gl_pb_block" = TOUCH ] || continue
      gl_pb_ch=$(printf '%s' "$gl_pb_text" | awk '{ print $2 }')
      gl_pb_dir=$(printf '%s' "$gl_pb_text" | awk '{ print $3 }' | tr -d ':')
      enum_ok "$gl_pb_ch" email dm call form other || gl_warn "$gl_pb_r" \
        "line $gl_pb_i of the touch log has channel $gl_pb_ch, and a channel is email, dm, call, form or other" \
        "ge person touch <key> <channel> <in|out> \"<what happened>\""
      enum_ok "$gl_pb_dir" in out || gl_warn "$gl_pb_r" \
        "line $gl_pb_i of the touch log has direction $gl_pb_dir, and a direction is in or out" \
        "ge person touch <key> <channel> <in|out> \"<what happened>\""
      # 2>/dev/null in front of the input, for the reason above: put after it,
      # the shell reports a scratch file that has gone missing under us by name
      # before the silence is in place.
    done 2>/dev/null < "$GL_TMP"
  done
}

# The folder itself, before anything in it. ge person refuses outright without
# it and the doctor calls it a failure, so a linter that reads the same folder
# and says nothing at all is a third answer to one question. A founder who tidied
# it away was told by ge person that it was gone, by ge check that it was gone,
# and by ge lint that their files were the shape ge expects.
#
# Returns 1 when there is nothing to walk, so the file by file checks are skipped
# rather than reporting an empty folder.
gl_people_folder() {
  gl_pd_f="$GL_HOME/people"
  gl_pd_r=$(gl_rel "$gl_pd_f")
  if [ -d "$gl_pd_f" ]; then
    # THE FOLDER IS THERE AND THAT IS NOT THE SAME AS BEING READABLE, and this
    # leg used to stop at the first of those. A people folder a sync client had
    # locked, or one whose read bit a founder took off, passed straight through
    # here: the loop below then asked the shell for people/*.md, got the pattern
    # back because nothing could be listed, walked no files, and lint printed
    # "Nothing to report. Your files are the shape ge expects." over sixty
    # prospects it had never opened. ge check calls the same folder a failure and
    # names the chmod, so the two readers of one folder gave two answers, and the
    # quieter one is the one a founder believes.
    #
    # -x as well as -r: listing the names needs the read bit and reading the
    # files inside needs the search bit, and a folder with one and not the other
    # fails halfway through with nothing said. The doctor asks for both back in
    # one chmod, so this asks the same way.
    if [ -r "$gl_pd_f" ] && [ -x "$gl_pd_f" ]; then
      return 0
    fi
    gl_warn "$gl_pd_r" \
      "the people folder cannot be opened, so nobody in it was checked and this report says nothing about them" \
      "chmod u+rx $(ge_quote "$gl_pd_f")" "Do this, then run ge lint again."
    return 1
  fi
  if [ -e "$gl_pd_f" ]; then
    # Nothing is deleted by the line offered. Their file is moved aside under a
    # name nothing is using, and ge init then makes the folder. gl_free_name is
    # what proves the name is free: an mv onto a name in use deletes whatever was
    # under it, which is the whole reason that function exists.
    gl_pd_dest=$(gl_free_name "$GL_HOME" people-old)
    if [ -n "$gl_pd_dest" ]; then
      gl_warn "$gl_pd_r" \
        "people is a file and not a folder, so ge person has nowhere to keep anyone" \
        "mv $(ge_quote "$gl_pd_f") $(ge_quote "$gl_pd_dest") && ge init" \
        "That puts your file aside under a name nothing is using, and makes the folder."
    else
      # Nine names taken already. Rare enough to describe rather than type for
      # them, and naming a tenth would be guessing. No command, so no "run: ".
      gl_tell "$gl_pd_r" \
        "people is a file and not a folder, so ge person has nowhere to keep anyone" \
        "give that file a name of your own, then run ge init, which makes the folder"
    fi
    return 1
  fi
  gl_warn "$gl_pd_r" \
    "there is no people folder, so ge person cannot add or list anyone" \
    "ge init" "That makes it again and changes nothing else."
  return 1
}

gl_people() {
  gl_people_folder || return 0
  gl_pe_dir="$GL_HOME/people"
  gl_pe_keys=''
  for gl_pe_f in "$gl_pe_dir"/*.md; do
    [ -e "$gl_pe_f" ] || break
    case ${gl_pe_f##*/} in README.md) continue ;; esac
    gl_pe_r=$(gl_rel "$gl_pe_f")
    gl_readable "$gl_pe_f" "$gl_pe_r" || continue

    # The key comes first, because everything below it is a command that starts
    # with the key. Without one there is no command to offer, so the file is
    # reported once, in the terms that fit it, and left alone.
    gl_pe_key=$(gl_person_field "$gl_pe_f" key)
    if [ -z "$gl_pe_key" ]; then
      if gl_person_any "$gl_pe_f"; then
        gl_tell "$gl_pe_r" \
          "this is a person with no key, and the key is how every ge person command finds them" \
          "put a line in $gl_pe_r reading key: followed by their email address or handle"
      else
        # Written out in full, because a founder reading this may be standing
        # inside growth-engine or above it, and a half path only works from one
        # of those two places.
        gl_pe_base=${gl_pe_f##*/}
        gl_pe_dest=$(gl_free_name "$GL_HOME" "${gl_pe_base%.md}")
        if [ -n "$gl_pe_dest" ]; then
          # Quoted the way lib/paths.sh quotes a path, not with plain double
          # quotes. Half the folders in this programme are named after a
          # business, so a fair number hold an apostrophe, and "Jane's Business"
          # inside double quotes is a line that will not run.
          gl_warn "$gl_pe_r" \
            "this is not a person file, and everything in people/ is read as a person" \
            "mv $(ge_quote "$gl_pe_f") $(ge_quote "$gl_pe_dest")" \
            "That moves it up one folder and leaves it otherwise alone."
        else
          # Every name beside it is taken, so there is nothing to paste and this
          # says so rather than offering a line that would overwrite somebody.
          gl_tell "$gl_pe_r" \
            "this is not a person file, and everything in people/ is read as a person" \
            "take that file out of growth-engine/people/ and put it anywhere else"
        fi
      fi
      continue
    fi

    gl_blocks_file "$gl_pe_f"
    gl_person_header "$gl_pe_f" "$gl_pe_r"
    gl_person_body "$gl_pe_f" "$gl_pe_r"

    gl_pe_kind=$(gl_person_field "$gl_pe_f" kind)
    gl_pe_status=$(gl_person_field "$gl_pe_f" status)

    # The way out of a missing field is the founder's own editor, not ge person
    # set. ge person set reads the file before it writes to it and refuses a file
    # that is missing one of these, and kind and created it refuses to change at
    # all, so every one of these lines used to name a command that could not run.
    # The line to put in is spelled out, so it can be typed straight in.
    #
    # It is printed after a bare arrow, because it is not a command and never
    # was. It used to open on the word open, which is a program on every Mac in
    # the room, and carry an unquoted path behind it, so a founder on a Desktop
    # called "My Business" who pasted it had the path split into words and the
    # folder was in none of them.
    for gl_pe_req in kind name status source created; do
      [ -z "$(gl_person_field "$gl_pe_f" "$gl_pe_req")" ] || continue
      case $gl_pe_req in
        kind)   gl_pe_add='kind: prospect, or kind: target' ;;
        name)   gl_pe_add='name: followed by their name' ;;
        status)
          gl_pe_add='status: candidate'
          [ "$gl_pe_kind" = target ] && gl_pe_add='status: target' ;;
        source) gl_pe_add='source: manual' ;;
        *)      gl_pe_add="created: $(today_iso)" ;;
      esac
      gl_tell "$gl_pe_r" "there is no $gl_pe_req, and every person needs one" \
        "put a line in $gl_pe_r reading $gl_pe_add"
    done

    case $gl_pe_kind in
      prospect)
        [ -n "$(gl_person_field "$gl_pe_f" email)" ] || \
          gl_warn "$gl_pe_r" "a prospect with no email cannot be exported to Apollo" \
            "ge person set $(ge_quote "$gl_pe_key") email \"<address>\""
        # An empty status is already reported as missing. Saying it twice trains
        # a founder to skim the list, and the second one is the one that matters.
        if [ -n "$gl_pe_status" ] && \
           ! enum_ok "$gl_pe_status" candidate cut contacted_ok enrolled replied stopped; then
          gl_warn "$gl_pe_r" \
            "the status reads $gl_pe_status, and a prospect is candidate, cut, contacted_ok, enrolled, replied or stopped" \
            "ge person set $(ge_quote "$gl_pe_key") status <one of those>"
        fi
        ;;
      target)
        gl_pe_plat=$(gl_person_field "$gl_pe_f" platform)
        if [ -z "$gl_pe_plat" ]; then
          gl_warn "$gl_pe_r" "a target with no platform cannot be counted on either route" \
            "ge person set $(ge_quote "$gl_pe_key") platform <ig|fb|other>"
        elif ! enum_ok "$gl_pe_plat" ig fb other; then
          gl_warn "$gl_pe_r" "the platform reads $gl_pe_plat, and it is ig, fb or other" \
            "ge person set $(ge_quote "$gl_pe_key") platform <ig|fb|other>"
        fi
        [ -n "$(gl_person_field "$gl_pe_f" handle)" ] || \
          gl_warn "$gl_pe_r" "a target with no handle cannot be found again" \
            "ge person set $(ge_quote "$gl_pe_key") handle \"<handle>\""
        if [ "$gl_pe_plat" = other ] && [ -z "$(gl_person_field "$gl_pe_f" platform_label)" ]; then
          gl_warn "$gl_pe_r" "platform is other and nothing says which platform that is" \
            "ge person set $(ge_quote "$gl_pe_key") platform_label \"<the real platform>\""
        fi
        if [ -n "$gl_pe_status" ] && \
           ! enum_ok "$gl_pe_status" target opener_written sent replied booked no_reply; then
          gl_warn "$gl_pe_r" \
            "the status reads $gl_pe_status, and a target is target, opener_written, sent, replied, booked or no_reply" \
            "ge person set $(ge_quote "$gl_pe_key") status <one of those>"
        fi
        ;;
      '') : ;;
      *)
        gl_warn "$gl_pe_r" "kind reads $gl_pe_kind, and a person is a prospect or a target" \
          "ge person set $(ge_quote "$gl_pe_key") kind <prospect|target>" ;;
    esac

    gl_pe_src=$(gl_person_field "$gl_pe_f" source)
    if [ -n "$gl_pe_src" ] && ! enum_ok "$gl_pe_src" manual apollo import form; then
      gl_warn "$gl_pe_r" "source reads $gl_pe_src, and it is manual, apollo, import or form" \
        "ge person set $(ge_quote "$gl_pe_key") source <manual|apollo|import|form>"
    fi
    gl_pe_prio=$(gl_person_field "$gl_pe_f" priority)
    if [ -n "$gl_pe_prio" ] && ! enum_ok "$gl_pe_prio" 1 2 3; then
      gl_warn "$gl_pe_r" "priority reads $gl_pe_prio, and it is 1, 2 or 3" \
        "ge person set $(ge_quote "$gl_pe_key") priority <1|2|3>"
    fi
    gl_pe_created=$(gl_person_field "$gl_pe_f" created)
    if [ -n "$gl_pe_created" ] && [ -z "$(iso_to_epoch "$gl_pe_created")" ]; then
      gl_warn "$gl_pe_r" "created reads $gl_pe_created, and the format is YYYY-MM-DD" \
        "ge person set $(ge_quote "$gl_pe_key") created <YYYY-MM-DD>"
    fi

    # The filename has to be derivable from the key, or nothing holding the key
    # can find this file again.
    if [ -n "$gl_pe_key" ]; then
      gl_pe_slug=$(gl_slug "$gl_pe_key")
      gl_pe_base=${gl_pe_f##*/}
      gl_pe_base=${gl_pe_base%.md}
      case $gl_pe_base in
        "$gl_pe_slug") : ;;
        "$gl_pe_slug"-[2-9]) : ;;
        *)
          # The name offered is one nothing is using. Moving this file onto the
          # slug when that slug is already somebody's file would delete them.
          gl_pe_dest=$(gl_free_name "$GL_HOME/people" "$gl_pe_slug")
          if [ -n "$gl_pe_dest" ]; then
            gl_warn "$gl_pe_r" \
              "the filename does not come from the key, so ge cannot find this person from $gl_pe_key" \
              "mv $(ge_quote "$gl_pe_f") $(ge_quote "$gl_pe_dest")" \
              "That is the name ge builds from that key, and nothing is using it."
          else
            gl_warn "$gl_pe_r" \
              "the filename does not come from the key, so ge cannot find this person from $gl_pe_key" \
              "ge person list" "That lists them, so you can see which file for $gl_pe_key to keep."
          fi ;;
      esac
      case " $gl_pe_keys " in
        *" $gl_pe_key "*)
          gl_warn "$gl_pe_r" "the key $gl_pe_key is in another file too, and two files for one person disagree eventually" \
            "ge person list" "That lists them both, so you can see which one ge person remove takes out." ;;
        *) gl_pe_keys="$gl_pe_keys $gl_pe_key" ;;
      esac
    fi

    # The merge value an export would send. Dr Ravi Menon gives Dr, and a cold
    # email opening "Hi Dr," is worse than one the founder corrected in a minute.
    # A title in front of the name is the whole fault. Judging the shape of the
    # word instead flags Jean-Luc, O'Brien, Zoe with a diaeresis and every name
    # written outside plain ASCII, which on a real list is a warning against
    # several people at once, and noise is what makes the next warning get
    # skipped. The list is closed, so this refuses a title and never judges
    # whether something is a name.
    if [ -z "$(gl_person_field "$gl_pe_f" first_name)" ]; then
      gl_pe_fall=$(gl_person_field "$gl_pe_f" name | awk '{ print $1 }' | sed 's/[,.]$//')
      gl_pe_lower=$(printf '%s' "$gl_pe_fall" \
        | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz')
      if enum_ok "$gl_pe_lower" dr doctor prof professor mr mrs ms mx miss \
          sir dame madam madame mme mlle rev reverend fr father \
          sr sra srta dra herr frau capt lt sgt; then
        gl_warn "$gl_pe_r" \
          "there is no first_name, and the name starts with the title $gl_pe_fall, so an export would open with Hi $gl_pe_fall" \
          "ge person set $(ge_quote "$gl_pe_key") first_name \"<name>\""
      fi
    fi

    # A target who has an opener written and is not on the sheet is a person the
    # founder will not message on the Saturday.
    if [ "$gl_pe_kind" = target ] && [ -f "$GL_HOME/dm-openers.md" ]; then
      case $gl_pe_status in
        opener_written|sent|replied|booked|no_reply)
          gl_pe_handle=$(gl_person_field "$gl_pe_f" handle)
          if [ -n "$gl_pe_handle" ] && block_check "$GL_HOME/dm-openers.md" TARGETS >/dev/null 2>&1; then
            if ! block_read "$GL_HOME/dm-openers.md" TARGETS 2>/dev/null | grep -F -q -- "$gl_pe_handle"; then
              gl_warn "$gl_pe_r" \
                "$gl_pe_handle has an opener and is not on the sheet you work down" \
                "ge person export openers"
            fi
          fi ;;
      esac
    fi
  done
}

# gl_fl_some <addresses, one space between them>: the first three, then a count.
#
# A founder who has added sixty five prospects since the last export would
# otherwise get sixty five addresses inside one warning line, and a wall is what
# makes the next warning get skipped. The command underneath puts every one of
# them right, named here or not, so naming three is enough to know what it means.
gl_fl_some() {                          # <addresses, one space between them>
  # set -f before the split. These are addresses and not patterns, and an
  # address holding a star would otherwise be swapped for whatever files happen
  # to sit in the folder the founder is standing in. set -- is how a POSIX shell
  # counts a list of words when it has no arrays.
  set -f
  set -- $1
  set +f
  gl_fs_seen=''
  gl_fs_n=0
  gl_fs_out=''
  for gl_fs_a do
    # One row copied inside a spreadsheet, or two person files holding the one
    # address, would otherwise name somebody twice in the same sentence. That
    # reads as a fault in the report rather than as what it is.
    case " $gl_fs_seen " in *" $gl_fs_a "*) continue ;; esac
    gl_fs_seen="$gl_fs_seen $gl_fs_a"
    gl_fs_n=$((gl_fs_n + 1))
    case $gl_fs_n in
      1)   gl_fs_out=$gl_fs_a ;;
      2|3) gl_fs_out="$gl_fs_out, $gl_fs_a" ;;
    esac
  done
  [ "$gl_fs_n" -gt 3 ] && gl_fs_out="$gl_fs_out and $((gl_fs_n - 3)) more"
  printf '%s' "$gl_fs_out"
}

# The export a founder actually sends from, and the only file in the folder that
# is a list of people rather than a file about one of them. Three things go wrong
# with it and every one of them is quiet.
#
#   A corrected opener in the person file, and the old one still in the row.
#   A prospect the founder stopped, whose row still reads as one to send to.
#   A sheet that is no longer this list of people at all.
#
# The last two are what this leg used to miss. It compared the opening lines of
# the rows already on the sheet and nothing else, so a prospect added after the
# export could never be noticed, and neither could a row whose person had gone.
# The founder stops somebody, adds two more, and ge lint and ge check both say
# the folder is clean: they email the one they stopped and never contact the two
# they added. ge person list says it at the moment the membership changes, which
# is also the moment it scrolls away, and the sheet is worked down a week later.
#
# WHO BELONGS ON IT IS NOT DECIDED HERE. It is read from people/ with the rules
# the export itself uses, which are prospect, not cut, and an address to send to.
# The line offered below rewrites the sheet from those rules and no others, so a
# rule of our own would mean the founder runs the line, the sheet comes back the
# same, and the warning is still there. A recovery that does not recover is worse
# than none.
#
# That is why a prospect who was stopped keeps their row. The export writes the
# status into the row, so the sheet says stopped and a mail merge can drop them.
# What is reported is a row that does not say so yet, which is exactly how
# somebody who was stopped goes on reading as somebody to send to.
#
# A status moving from candidate to contacted_ok is deliberately not reported.
# The sheet is older than the file then too, ge person set says so at the time,
# and a warning that fires across half a list every week is the one that teaches
# a founder to skim the rest.
#
# Called from gl_main rather than from the end of gl_people, because the sheet is
# still worth reading when the people folder itself is the thing that is missing.
gl_firstlines() {
  gl_fl_csv="$GL_HOME/outreach-firstlines.csv"
  [ -f "$gl_fl_csv" ] || return 0
  gl_fl_r=$(gl_rel "$gl_fl_csv")
  gl_readable "$gl_fl_csv" "$gl_fl_r" || return 0

  # Who belongs on the sheet, read once from people/. One record a line, holding
  # the address, the status, and the name of the file inside people/. The name
  # and not the whole path: a slug is only ever letters, digits and hyphens,
  # while the folder above it is named after somebody's business and can hold a
  # tab, a quote or an apostrophe, any of which would break a record apart.
  gl_fl_want=$GE_NL
  gl_fl_shy=0
  # THERE AND OPEN ARE TWO QUESTIONS, and this leg used to stop at the first of
  # them. A people folder a sync client had hold of, or one whose read bit a
  # founder took off, is still a folder: the glob below came back as the pattern
  # itself, the -e test dropped it, and the walk ended with nobody on the list.
  # Every row on the sheet was then a row for somebody no longer in the folder,
  # so lint told a founder that a live prospect had been "cut or taken out" and
  # sent them to an export that refuses while the folder is shut. An invented
  # fact, and a recovery line that answers with a second refusal.
  #
  # -r and -x, the same pair gl_people_folder asks for, because listing the names
  # needs the read bit and opening each file needs the search bit. It has already
  # named this folder in this same report, and its line hands both back, so the
  # silence below is a silence with a way out already printed above it.
  if [ -d "$GL_HOME/people" ] && [ -r "$GL_HOME/people" ] && [ -x "$GL_HOME/people" ]; then
    for gl_fl_f in "$GL_HOME/people"/*.md; do
      [ -e "$gl_fl_f" ] || break
      case ${gl_fl_f##*/} in README.md) continue ;; esac
      # Two files stop this leg from saying anything: one this computer will not
      # let ge read, and one with no kind on it, which is either a person whose
      # file cannot be read as one or a scratch note somebody dropped in here.
      # Both are people this leg cannot place, and both make ge person export
      # firstlines refuse outright, so every line it could offer is a line that
      # will not run. gl_people has already named that file, in the same report,
      # with a line that does run.
      if [ ! -r "$gl_fl_f" ]; then
        gl_fl_shy=1
        continue
      fi
      gl_fl_kind=$(gl_person_field "$gl_fl_f" kind)
      if [ -z "$gl_fl_kind" ]; then
        gl_fl_shy=1
        continue
      fi
      [ "$gl_fl_kind" = prospect ] || continue
      gl_fl_st=$(gl_person_field "$gl_fl_f" status)
      [ "$gl_fl_st" = cut ] && continue
      # No address and the export writes a row with an empty first cell, which
      # nothing on either side can be matched against. gl_people says that on its
      # own, with the line that fills it in.
      gl_fl_em=$(gl_person_field "$gl_fl_f" email)
      [ -n "$gl_fl_em" ] || continue
      gl_fl_base=${gl_fl_f##*/}
      gl_fl_want="$gl_fl_want$gl_fl_em$GL_TAB$gl_fl_st$GL_TAB$gl_fl_base$GE_NL"
    done
  else
    # No people folder, or one that will not open. ge person export firstlines
    # refuses on both of those too, so there is no line this leg could offer
    # that would run.
    gl_fl_shy=1
  fi

  # Silence, and not a softer warning. Everything below ends on the same one
  # line, that line refuses while any of the above is true, and a recovery that
  # does not recover is worse than none. What is wrong is already in this report
  # with a line that runs, and the checks below come back the moment it is done.
  #
  # What this does not cover: a person file that opens, carries a kind, and still
  # fails the export for some other reason, a broken marker pair or a status ge
  # does not know. gl_people names that file too, one warning above this one, so
  # the founder works down the report and the second line runs once the first is
  # done. Reading the whole of ge person validate a second time in here to catch
  # it is two copies of one rule, which is the thing that drifts.
  [ "$gl_fl_shy" -eq 0 ] || return 0

  # Every cell the export writes is quoted, so the field separator is quote comma
  # quote, and a row read that way has five fields. A row with any other count is
  # one a spreadsheet wrapped over two lines when somebody typed a line break
  # inside a cell.
  #
  # A wrapped row still counts as a row. Only its cells are left unread. Told
  # apart rather than dropped, because dropping it says there is no row for that
  # person at all, and the founder takes a sheet they are holding in their hand
  # and is told nothing would go out to somebody who is on it. That is the count
  # in front of every record, and it is why the address is taken from the first
  # cell the same way ge person list takes it: the line opens with a quote and
  # the first cell holds an at sign. Both readers of this file answer the same.
  #
  # The carriage return comes off inside awk, before the fields are read, because
  # this is the one file in the folder a founder opens in Excel and Excel writes
  # one on every line. Left on, it stays stuck to the last cell, and the status
  # of every person on a sheet that had been through Excel would read as changed.
  #
  # Held in one string and walked below rather than piped into the loop. A pipe
  # puts the loop in a shell of its own, and everything the walk had learned about
  # the sheet would be thrown away the moment it ended. lint writes no scratch
  # file for this, because lint writes nothing.
  gl_fl_rows=$(awk -F'","' '
    NR == 1 { next }
    { sub(/\r$/, "") }
    $1 !~ /^"/ { next }
    {
      key = $1
      sub(/^"/, "", key)
      if (key !~ /@/) next
      st = ""; line = ""
      if (NF == 5) {
        line = $4
        st = $5
        sub(/"$/, "", st)
        gsub(/""/, "\"", line)
      }
      print NF "\t" key "\t" st "\t" line
    }' "$gl_fl_csv" | tr -d '\r')

  gl_fl_seen=$GE_NL
  gl_fl_off=''
  gl_fl_stop=''
  gl_fl_text=''
  gl_fl_rest=$gl_fl_rows
  while [ -n "$gl_fl_rest" ]; do
    # The last record carries no line break after it, so the two cases are told
    # apart rather than assumed. Assumed, the last record repeats for ever.
    case $gl_fl_rest in
      *"$GE_NL"*)
        gl_fl_row=${gl_fl_rest%%"$GE_NL"*}
        gl_fl_rest=${gl_fl_rest#*"$GE_NL"} ;;
      *)
        gl_fl_row=$gl_fl_rest
        gl_fl_rest='' ;;
    esac
    gl_fl_nf=${gl_fl_row%%"$GL_TAB"*}
    gl_fl_rec=${gl_fl_row#*"$GL_TAB"}
    gl_fl_key=${gl_fl_rec%%"$GL_TAB"*}
    [ -n "$gl_fl_key" ] || continue
    gl_fl_pair=${gl_fl_rec#*"$GL_TAB"}
    gl_fl_csvst=${gl_fl_pair%%"$GL_TAB"*}
    # The opening line is last in the record on purpose. It is the founder's own
    # writing, it is the one field that can hold a tab, and a field that can hold
    # the separator has to be the one nothing is split off after.
    gl_fl_txt=${gl_fl_pair#*"$GL_TAB"}
    gl_fl_seen="$gl_fl_seen$gl_fl_key$GE_NL"

    # Both ends of the address pinned, so a short address cannot match inside a
    # longer one and answer for somebody else.
    case $gl_fl_want in
      *"$GE_NL$gl_fl_key$GL_TAB"*)
        gl_fl_rec=${gl_fl_want#*"$GE_NL$gl_fl_key$GL_TAB"}
        gl_fl_rec=${gl_fl_rec%%"$GE_NL"*}
        gl_fl_st=${gl_fl_rec%%"$GL_TAB"*}
        gl_fl_base=${gl_fl_rec#*"$GL_TAB"} ;;
      *)
        gl_fl_off="$gl_fl_off$gl_fl_key "
        continue ;;
    esac

    # Past here the cells of the row are read, so a row that wrapped stops here.
    # It is on the sheet, which is what the two lines above needed to know, and
    # what is written inside it cannot be told apart cell by cell.
    [ "$gl_fl_nf" = 5 ] || continue

    # Stopped on file, and the row does not say so. The line below clears this
    # whichever way it goes, which is the whole reason it is worded as the row
    # being out of date rather than as the row not belonging: somebody cut loses
    # the row, somebody stopped keeps one that reads stopped. Nothing else about
    # this row is worth saying once this is true, so it is said once.
    if [ "$gl_fl_st" = stopped ] && [ "$gl_fl_csvst" != stopped ]; then
      gl_fl_stop="$gl_fl_stop$gl_fl_key "
      continue
    fi

    gl_fl_have=$(block_read "$GL_HOME/people/$gl_fl_base" OPENER 2>/dev/null | grep . | sed -n '1p')
    [ -n "$gl_fl_have" ] || continue
    [ "$(printf '%.40s' "$gl_fl_have")" = "$(printf '%.40s' "$gl_fl_txt")" ] || \
      gl_fl_text="$gl_fl_text$gl_fl_key "
  done

  # The other direction. A prospect with no row at all is the half nothing in the
  # toolkit could see once the moment of the change had scrolled away.
  gl_fl_absent=''
  gl_fl_rest=${gl_fl_want#"$GE_NL"}
  while [ -n "$gl_fl_rest" ]; do
    case $gl_fl_rest in
      *"$GE_NL"*)
        gl_fl_rec=${gl_fl_rest%%"$GE_NL"*}
        gl_fl_rest=${gl_fl_rest#*"$GE_NL"} ;;
      *)
        gl_fl_rec=$gl_fl_rest
        gl_fl_rest='' ;;
    esac
    gl_fl_key=${gl_fl_rec%%"$GL_TAB"*}
    [ -n "$gl_fl_key" ] || continue
    case $gl_fl_seen in
      *"$GE_NL$gl_fl_key$GE_NL"*) ;;
      *) gl_fl_absent="$gl_fl_absent$gl_fl_key " ;;
    esac
  done

  # Membership first, both ways round, because those two decide who gets an email
  # and the opening line only decides what it says.
  if [ -n "$gl_fl_off" ]; then
    gl_warn "$gl_fl_r" \
      "the row on the sheet for $(gl_fl_some "$gl_fl_off") is for somebody you would not send to now, because they were cut or taken out" \
      "ge person export firstlines"
  fi
  if [ -n "$gl_fl_stop" ]; then
    gl_warn "$gl_fl_r" \
      "the row on the sheet for $(gl_fl_some "$gl_fl_stop") still reads as somebody to send to, and they were stopped" \
      "ge person export firstlines"
  fi
  if [ -n "$gl_fl_absent" ]; then
    gl_warn "$gl_fl_r" \
      "there is no row on the sheet for $(gl_fl_some "$gl_fl_absent"), so nothing would go out to them" \
      "ge person export firstlines"
  fi
  if [ -n "$gl_fl_text" ]; then
    gl_warn "$gl_fl_r" \
      "the first line for $(gl_fl_some "$gl_fl_text") is not the one in the person file any more" \
      "ge person export firstlines"
  fi
}

# ------------------------------------------------- a save that stopped part way

# gl_left_live <bare name>: true while the run that wrote a working copy is still
# going. Every one of these names ends in the process id of the run that made it,
# so a founder with two Claude windows open on one folder does not get a save
# that is happening right now reported as one that stopped.
#
# This is the same test ge check makes, written out a second time because there
# is no library both files load. Said out loud rather than left quiet: it belongs
# in lib/ the day somebody owns that file.
gl_left_live() {                        # <bare file name>
  gl_lv_pid=${1##*.}
  # 0 is left out on purpose: kill -0 0 asks about a whole process group and
  # answers yes, which would make a name ending in .0 look alive for ever.
  case ${gl_lv_pid:-x} in
    ''|0|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$gl_lv_pid" 2>/dev/null
}

# gl_left_owner <name inside the folder>: sets gl_lo_own to the founder's own
# file the working copy was made from, or to nothing when the copy belongs to
# ge's own records rather than to anything the founder wrote.
gl_left_owner() {                       # <name relative to GL_HOME>
  gl_lo_own=''
  gl_lo_n=${1%.*}                       # the process id off the end
  case $gl_lo_n in
    *.ge-tmp)  gl_lo_n=${gl_lo_n%.ge-tmp} ;;
    *.ge-body) gl_lo_n=${gl_lo_n%.ge-body} ;;
    *) return 0 ;;
  esac
  # .state is ge's own drawer. A founder never opens it and has nothing in it, so
  # naming a file in there would send them looking for something of theirs that
  # was never in the copy.
  case $gl_lo_n in
    .*) return 0 ;;
  esac
  [ -f "$GL_HOME/$gl_lo_n" ] || return 0
  gl_lo_own=$gl_lo_n
}

# ge writes a working copy beside a founder file, then moves it into place in one
# step. So a copy still sitting in the folder is a save that stopped part way:
# their own file was left exactly as it was, and what was being written never
# landed in it.
#
# WHY LINT SAYS ANYTHING, GIVEN THAT GE CHECK ALREADY SWEEPS THEM AWAY: this one
# is for the founder's eyes. A second copy of memory.md sitting next to memory.md
# in the folder they open every day is the most alarming thing in that folder to
# somebody who did not put it there, and a linter answering "your files are the
# shape ge expects" is the fault the people folder had, again: two readers of one
# folder, two answers. ge check runs its own sweep before it runs lint, so a
# founder running the doctor is never told this twice.
#
# The name of the copy is never printed. It carries a process id that means
# nothing to them, it will not be there once the recovery line has run, and there
# is nothing of theirs inside it to go back for. What gets named is their file.
#
# One warning however many copies are found. From the founder's side it is one
# save that did not finish, and a list of names they cannot act on is not a
# report. Read first in the run for the same reason the doctor sweeps first: it
# is the one line that explains a file they can see with their own eyes.
gl_lf_open() {                          # <folder> <how the founder sees it named>
  # Not there is not a fault. Nothing writes a working copy into a folder that
  # does not exist, so there is nothing in it to miss and nothing to say.
  [ -d "$1" ] || return 1
  # -r as well as -x, because the sweep needs both and a folder with one of them
  # fails on the other with nothing said. Listing the names needs the read bit,
  # and the -f test on each name needs the search bit. gl_people_folder asks for
  # both back in one chmod for the same reason, and so does the doctor.
  [ -r "$1" ] && [ -x "$1" ] && return 0
  gl_warn "$2" \
    "this folder cannot be opened, so nothing in it was checked and this report says nothing about a save that stopped part way in there" \
    "chmod u+rx $(ge_quote "$1")" "Do this, then run ge lint again."
  return 1
}

gl_leftovers() {
  gl_lf_n=0
  gl_lf_name=''
  # Every working name the tree writes, in every folder it writes one in. A glob
  # that matches nothing comes back as itself, which the -f test drops. The
  # folder is inside the quotes and the pattern is outside them, so a founder
  # folder with a space in its name still expands to one path and not to two.
  #
  # ASKED BEFORE READ, ONE FOLDER AT A TIME, and this is why the list is built up
  # rather than written out in one go. A glob that matches nothing and a glob
  # into a folder the shell was not allowed to list come back the same way: as
  # the pattern itself. So a snapshots folder a sync client had hold of, with a
  # half written copy sitting in it, walked no files and lint printed "Nothing to
  # report. Your files are the shape ge expects." That is the fault the people
  # folder had, which the comment above this function already names, and the leg
  # beneath the comment was never guarded. Three folders had it: this one, the
  # records folder above it, and the growth-engine folder itself.
  #
  # Outermost first, and each one only opened when the one above it opened. A
  # records folder that will not open takes the snapshots folder inside it out of
  # reach too, and naming both would be two lines for one fault, with the second
  # of them a chmod that cannot run.
  #
  # The middle pair of globs is the one folder ge writes a founder file into
  # below the top, which is people/. gl_people_folder asks the same two questions
  # of it, in the same report, and ends on the same chmod, so it is not asked
  # twice here: two readers of one folder that cannot be opened is one fault.
  #
  # set -- rather than a longer for line, because a folder that will not open
  # has to drop out of the list rather than be walked. A function's positional
  # parameters are its own, so nothing gl_main was passed is touched, and each
  # expansion stays one word however many spaces are in the founder's path.
  set --
  if gl_lf_open "$GL_HOME" growth-engine; then
    set -- "$@" "$GL_HOME"/*.ge-tmp.* "$GL_HOME"/*.ge-body.* "$GL_HOME"/.ge-restore-tmp.*
    set -- "$@" "$GL_HOME"/*/*.ge-tmp.* "$GL_HOME"/*/*.ge-body.* "$GL_HOME"/*/.ge-restore-tmp.*
  fi
  if gl_lf_open "$GL_HOME/.state" "$(gl_rel "$GL_HOME/.state")"; then
    set -- "$@" "$GL_HOME"/.state/*.ge-tmp.* "$GL_HOME"/.state/remember.src.* \
                "$GL_HOME"/.state/.ge-restore-tmp.*
    if gl_lf_open "$GL_HOME/.state/snapshots" "$(gl_rel "$GL_HOME/.state/snapshots")"; then
      set -- "$@" "$GL_HOME"/.state/snapshots/.ge-snapshot-tmp.*
    fi
  fi

  for gl_lf_f do
    [ -f "$gl_lf_f" ] || continue
    gl_lf_b=${gl_lf_f##*/}
    gl_left_live "$gl_lf_b" && continue
    gl_lf_n=$((gl_lf_n + 1))
    [ -n "$gl_lf_name" ] && continue
    gl_left_owner "${gl_lf_f#"$GL_HOME"/}"
    gl_lf_name=$gl_lo_own
  done
  [ "$gl_lf_n" -gt 0 ] || return 0
  # ge check is the command that clears them, and it clears every one of them in
  # one run. It also reads the folder first, so a folder that will not let the
  # copy be taken out says that rather than saying nothing.
  if [ -n "$gl_lf_name" ]; then
    gl_warn "$(gl_rel "$GL_HOME/$gl_lf_name")" \
      "a save into this file stopped part way, so the file was left as it was and the half written copy is still sitting beside it" \
      "ge check" "That clears the copy away and leaves your own file alone."
    return 0
  fi
  gl_warn "growth-engine" \
    "a save into this folder stopped part way, so what was being written never went in and the half written copy is still in there" \
    "ge check" "That clears the copy away and leaves your own files alone."
}

# ---------------------------------------------------------------- the verb

# gl_shut <a folder that might be a growth-engine folder>: the first folder on
# the way to that folder's own record of where it lives that ge cannot step
# into, and nothing at all when the way in is open or when there is no folder
# there to step into.
#
# It answers one question only: whether a no from the test below is a no about
# the work or a no about permission. It never says the folder is a
# growth-engine folder, because it never got far enough to find out, and the
# sentence it feeds says exactly that much and no more.
#
# -x and not -r, because the test it stands in front of asks for one named file
# inside .state and a folder only has to be stepped into for that. Asking for
# the read bit as well would name a permission the caller does not need and put
# it in the line the reader pastes.
gl_shut() {                             # <folder>
  [ -d "$1" ] || return 0
  [ -x "$1" ] || { printf '%s' "$1"; return 0; }
  [ -d "$1/.state" ] || return 0
  [ -x "$1/.state" ] || printf '%s' "$1/.state"
  return 0
}

gl_main() {
  while [ $# -gt 0 ]; do
    case $1 in
      --strict) GL_STRICT=1 ;;
      --root)
        shift
        [ $# -gt 0 ] || {
          printf 'FAIL  --root needs a folder after it.\n' >&2
          printf '      → run: ge lint --root <folder that holds growth-engine>\n' >&2
          return 1
        }
        GL_ROOT=$1 ;;
      *)
        printf 'FAIL  ge lint does not take "%s".\n' "$1" >&2
        printf '      → run: ge lint\n' >&2
        return 1 ;;
    esac
    shift
  done

  if [ -n "$GL_ROOT" ]; then
    if [ -f "$GL_ROOT/.state/HOME" ]; then
      GL_HOME=$(ge_abs "$GL_ROOT")
    elif [ -f "$GL_ROOT/growth-engine/.state/HOME" ]; then
      GL_HOME=$(ge_abs "$GL_ROOT/growth-engine")
    else
      # NOT THERE AND CANNOT BE LOOKED IN ARE TWO ANSWERS, and both tests above
      # give the same one. The file they ask about sits inside .state, so a
      # folder ge cannot step into answers no to both, and what came back was
      # that there is no growth-engine folder at a path where the founder's work
      # is sitting in plain sight. The line under it made that worse: ge init
      # cannot create a folder it cannot write to either, so the mentor who ran
      # it read a second refusal, about a different thing, and still had no
      # report. This is the answer lib/paths.sh already gives whoever is standing
      # in the folder, said here for whoever passed --root.
      gl_mn_shut=$(gl_shut "$GL_ROOT")
      [ -n "$gl_mn_shut" ] || gl_mn_shut=$(gl_shut "$GL_ROOT/growth-engine")
      if [ -n "$gl_mn_shut" ]; then
        printf 'FAIL  ge could not look inside %s, so it cannot tell whether the work is in there.\n' "$gl_mn_shut" >&2
        printf '      Nothing was checked, so this is no report at all, not a clean one.\n' >&2
        printf '      This hands that folder back. Do it, then run the same command again.\n' >&2
        printf '      → run: chmod u+rx %s\n' "$(ge_quote "$gl_mn_shut")" >&2
        return 1
      fi
      printf 'FAIL  there is no growth-engine folder at %s.\n' "$GL_ROOT" >&2
      printf '      Stand in the folder you want your work kept in first.\n' >&2
      printf '      → run: ge init\n' >&2
      return 1
    fi
  else
    gl_out=$(ge_find_home)
    gl_rc=$?
    # The shared refusal in lib/paths.sh, not one written here. "here or above
    # here" leaves out the home folder, the Desktop, Documents and Downloads,
    # all of which ge_find_home reads. The sentence about nothing being checked
    # stays, because it is this verb's own and the scatter refusal below says
    # it too. It prints on standard output, so the caller sends it to standard
    # error.
    if [ "$gl_rc" -eq 1 ]; then
      ge_nofolder_refusal fail 'Nothing was checked.' >&2
      return 1
    fi
    if [ "$gl_rc" -eq 2 ]; then
      # The one refusal, written once in lib/paths.sh so every verb says the same
      # thing, and ending on an mv a founder can paste. What this used to print
      # told them to cd into the one they wanted, which is the folder they were
      # already standing in, and running it again gave the identical refusal.
      # It prints on standard output, so the caller sends it to standard error.
      ge_scatter_refusal "$gl_out" 'Nothing was checked.' >&2
      return 1
    fi
    GL_HOME=$(printf '%s\n' "$gl_out" | sed -n '1p')
  fi

  # touch, not a redirection onto the colon builtin: under dash a redirection
  # that fails on a special builtin ends the shell, and a report that vanishes
  # is worse than no report.
  # The second place is tested the same way the first one is. Taken on trust, a
  # scratch file that was never created makes gl_person_body skip every touch
  # log and every notes block, and lint then prints a clean bill for files it
  # never opened. A lint that cannot run has to say so.
  GL_TMP="${TMPDIR:-/tmp}/ge-lint.$$"
  if ! touch "$GL_TMP" 2>/dev/null; then
    GL_TMP="$GL_HOME/.state/ge-lint.$$"
    if ! touch "$GL_TMP" 2>/dev/null; then
      printf 'FAIL  ge lint needs one scratch file and could not write one, in %s or in %s/.state.\n' \
        "${TMPDIR:-/tmp}" "$GL_HOME" >&2
      printf '      Nothing was checked, so this is no report at all, not a clean one.\n' >&2
      printf '      The doctor says whether either of those folders is read only or full.\n' >&2
      printf '      → run: ge check\n' >&2
      return 1
    fi
  fi
  GL_APPROVED=0

  gl_leftovers
  gl_brain
  gl_ledger
  gl_csv
  gl_approval
  gl_memory
  gl_blocks
  gl_people
  gl_firstlines

  # 2>/dev/null: a scratch folder a sync client has hold of answers a delete with
  # a raw line naming a file the founder has never heard of, at the end of a
  # report that is otherwise all theirs.
  rm -f "$GL_TMP" 2>/dev/null

  if [ "$GL_WARNS" -eq 0 ]; then
    printf 'Nothing to report. Your files are the shape ge expects.\n'
  elif [ "$GL_WARNS" -eq 1 ]; then
    printf '\nOne thing to look at. Nothing was changed: lint only reports.\n'
  else
    printf '\n%s things to look at. Nothing was changed: lint only reports.\n' "$GL_WARNS"
  fi

  # A check that could not run counts here too. The harness is the only reader
  # that can act on one, and a build frozen with a check in it that never runs is
  # the thing this flag exists to stop.
  if [ "$GL_STRICT" -eq 1 ]; then
    [ "$GL_WARNS" -gt 0 ] && return 1
    [ "$GL_GAPS" -gt 0 ] && return 1
  fi
  return 0
}

gl_main "$@"
