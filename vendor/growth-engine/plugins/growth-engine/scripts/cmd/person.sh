# person.sh: the people the founder is selling to. One file each. Sourced by ge.sh.
#
# WHY IT EXISTS: without it a prospect is a status letter in a machine file, so
#                "who is this, why did I pick them, what have I sent them" has no
#                answer anywhere and the founder rebuilds it from memory on the
#                busiest afternoon of the event. One file per person, keyed on the
#                identifier, is what stops that. Keying on the name instead would
#                merge two Sam Carters at two companies into one person, and the
#                merge is silent, which is the failure this file is shaped to refuse.
# CALLED BY:     ge person, the outreach-b2b and audience-b2c skills, ge status
# READS:         growth-engine/people/*.md, and growth-engine/outreach-firstlines.csv,
#                which ge person list compares against the people/ folder every
#                time, because the sheet is a copy taken at one moment and the
#                folder keeps moving after it. Read only: the sheet is rewritten
#                by ge person export firstlines and by nothing else, ever.
# WRITES:        one person file per invocation, growth-engine/outreach-firstlines.csv,
#                the GE:TARGETS block in growth-engine/dm-openers.md, and one line
#                appended to growth-engine/.gitignore naming each of those two the
#                first time it writes them, because both hold real people and the
#                seeded ignore rules cover only people/ and .state/.
#                Never ops-log.md: that file has one writer, ge log, and it is append
#                only, so a name written there would outlive ge person purge.
#                Never below the first "## " line of a person file either. From
#                that line down the file is the founder's, so set copies it back
#                byte for byte, carriage returns and final newline as it found them.
# POSTURE:       fail-closed on every write. A malformed file is refused, never
#                repaired by guessing, and no write happens without a snapshot first
# EXIT CODES:    one rule, held to by every verb here, so a skill can act on the
#                number rather than on the words.
#                0 it did what it says, and the file it read was sound.
#                1 refused, or could not finish. Nothing was written. A malformed
#                  file is 1 everywhere, get included: get still prints the person,
#                  because hiding them helps nobody, and still exits 1, because a
#                  skill has to tell a sound file from a damaged one without
#                  reading the text. That is section 09's rule and this file used
#                  to return 0 there, which told a skill the file was fine.
#                  list is the single exception, and it is deliberate: it is a
#                  report, it prints the damaged person as a row of their own and
#                  says why underneath, and a report that reported is 0. A list
#                  with no rows in it is 0 as well, and says which of the two
#                  reasons it was: nobody here, or nobody matching that filter.
#                2 there is no such person. ge person is the one place that tells
#                  that apart from 1, so a skill can offer to add them instead of
#                  running the same command again.
# WHAT A FOUNDER SEES: never a marker, a parser tag, a source path, a line number
#                in a source file or a temp filename. The markers are taken out of
#                ge person get, faults are printed as sentences rather than as the
#                tags the parser passes around, the three marked sections are
#                named by the headings the founder's own file carries rather than
#                by the block names the parser uses, and every reader guards its
#                own redirect so the shell cannot answer for us. A marker is named
#                in two refusals and nowhere else: one about a marker line that is
#                missing, where naming it is the only way to say what to put back,
#                and one about marker text pasted into the founder's own writing,
#                where naming it is the only way to say what to take out.
# ONE PROBLEM, ONE MESSAGE: lib/blocks.sh owns the sentence for a person file it
#                could not read, rewrite or replace. Nothing here prints a second
#                one over the top of it: two banners and two differently worded
#                ways out read as two things breaking rather than one.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. Strips \r before parsing any
#                line, and the byte order mark a Windows editor writes at the top
#                of a file, which shows as nothing on screen and would otherwise
#                make line 1 unreadable to every parser in here. The same strip
#                is applied to outreach-firstlines.csv, which is the one file in
#                the folder a founder opens in Excel and saves back.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE, AND THERE ARE TWO SHAPES OF IT.
#                "→ run: " and one command is the ordinary one. Everything after
#                that marker to the end of the line is the command, and nothing
#                else: a founder selects the whole line and pastes it, so an
#                English clause on the end of it is pasted too. Anything ge wants
#                to say about the command goes on the line above it, never below,
#                because the arrow line is the last line of the message.
#                A bare "→ " and one named action is the other, for the places
#                where ge holds no command it can stand behind. person_guide
#                prints those, and lib/blocks.sh chooses between the two for a
#                damaged marked block, because only the founder knows where their
#                own section stops. A bare arrow opens on a verb that is neither
#                a shell reserved word nor the name of a program, so a founder
#                who pastes it anyway gets an answer rather than a syntax error.

# Byte order, not the founder's locale. Every sort here has a byte-exact
# expectation committed against it, and Git Bash on Windows Home is the floor.
LC_ALL=C
export LC_ALL

# One carriage return, built without the $'\r' bashism.
GE_CR=$(printf '\r')
GE_NL='
'
# GE_BOM, the three bytes Windows Notepad and PowerShell put at the top of a file
# they save as UTF-8, comes from lib/paths.sh, which ge.sh loads before this file.
# They draw nothing, so a founder cannot see them and cannot take them out, and
# left in front of line 1 they turn the opening comment of a person file into a
# line that is not a field, not blank and not a comment. Stripped before any line
# is parsed here, and never written into a file by anything here.
#
# It used to be defined in this file as well. One invisible value with two
# definitions is a value that drifts, and the copy that reads .state/HOME is the
# one the whole folder search depends on, so there is now only that one.

# The separator inside a fault line. Faults are built as "CODE:where<tab>reason"
# so a column can be pulled off one, and the tab is never shown to a founder.
GE_TAB=$(printf '\t')

GE_P_FIELDS='key kind name status source created email platform handle platform_label first_name company title email_status found_via why_them link priority follow_up_on ghl_contact_id apollo_contact_id'
GE_P_IMMUTABLE='key kind created'
GE_P_ST_PROSPECT='candidate cut contacted_ok enrolled replied stopped'
GE_P_ST_TARGET='target opener_written sent replied booked no_reply'
GE_P_PLATFORM='ig fb other'
GE_P_SOURCE='manual apollo import form'
GE_P_PRIORITY='1 2 3'
GE_P_EMAIL_STATUS='unverified valid risky bounced'
GE_P_CHANNEL='email dm call form other'
GE_P_DIRECTION='in out'

# ---------------------------------------------------------------- messages

# The third argument is the sentence that used to ride on the recovery line
# itself, as "chmod u+w /some/folder, then the same command again". A founder
# selects that whole line and pastes it, so the shell was handed a folder called
# "/some/folder," and then three words it tried to run as commands of their own.
# Everything after "→ run: " is the command now, and nothing else, so the
# sentence goes on its own line above it where a shell will never read it.
person_fail() {                       # <what went wrong> <the command> [<the line above it>]
  printf 'FAIL  %s\n' "$1" >&2
  [ -n "${3:-}" ] && printf '      %s\n' "$3" >&2
  printf '      → run: %s\n' "$2" >&2
  return 1
}

# person_guide <what went wrong> <the one thing to do by hand>: the refusal for
# the places where ge holds no command it can stand behind.
#
# WHY IT IS NOT person_fail WITH A SENTENCE IN THE COMMAND SLOT. Everything
# after "→ run: " is a command a founder selects and pastes, to the end of the
# line. "the same command with the text on one line" pasted into a shell goes
# looking for a program called "the", so the way out was a second, stranger
# refusal. There is no "run:" on this arrow at all, which is how a founder can
# see at a glance that this one is theirs to do rather than to paste.
#
# The action opens on a verb that is neither a shell reserved word nor the name
# of a program, so a founder who pastes it anyway is answered about a command
# that does not exist rather than with a syntax error. "In" would be the trap
# there: it is reserved, and a line opening on it is a syntax error.
#
# The arrow line is the last line, the same as in person_fail. Anything the
# founder needs to know sits above it.
person_guide() {                      # <what went wrong> <the one thing to do by hand>
  printf 'FAIL  %s\n' "$1" >&2
  printf '      → %s\n' "$2" >&2
  return 1
}

# person_write_fix <the file or folder ge could not write>: the way out of a
# write that was refused, as one command wherever ge can name what refused it.
#
# WHY: every one of these used to end on "ge check   to see whether the folder is
# writable". That does recover, but in two: the doctor's own answer is a chmod,
# so the founder runs the doctor and then runs the line the doctor prints. ge
# already knows which folder the write needed, so it says the chmod itself, which
# is what ge receipt does for this same locked folder. A read only folder inside
# OneDrive or iCloud Drive is the ordinary case here, not an exotic one, and it
# lands mid-conversation with a prospect.
#
# The path itself is asked about before the folder around it, so that a locked
# .gitignore is named rather than the folder it sits in, which is writable and
# not the problem. The doctor is still the answer when the folder is writable and
# the write failed anyway, because then ge cannot name what is in the way and a
# chmod on something already fine sends the founder down a dead end.
#
# Never given a working file name. Every caller hands over a folder or a file the
# founder already knows about, because the temp file ge writes beside theirs is
# ours and naming it breaks the promise the whole file is built on.
# The branch is asked once, here, and both the command and the sentence above it
# are built from the answer. Two functions each working it out for themselves is
# two answers that drift, and a sentence describing a chmod above a line that
# says something else is worse than either on its own.
#
# A FOLDER AND A FILE ARE ASKED DIFFERENT QUESTIONS, and asking both of them the
# same one is what let the wrong command out. A file has to take a write. A
# folder has to take a NEW file, which is the write bit and the search bit
# together: ge builds its copy beside the founder's and renames it over the top,
# and both of those enter the folder before they write in it. So a folder a sync
# client left at 600 answered -w yes, was not named at all, and the founder was
# sent to the doctor for a folder ge was already holding the path of.
person_write_where() {                # <the file or folder ge could not write>
  wf_d=${1%/*}
  [ "$wf_d" = "$1" ] && wf_d=.
  if [ -d "$1" ]; then
    { [ -w "$1" ] && [ -x "$1" ]; } || { printf '%s' "$1"; return 0; }
  elif [ -e "$1" ] && [ ! -w "$1" ]; then
    printf '%s' "$1"
    return 0
  fi
  if [ -d "$wf_d" ] && ! { [ -w "$wf_d" ] && [ -x "$wf_d" ]; }; then
    printf '%s' "$wf_d"
  fi
  return 0
}

# person_folder_fix <folder>: the one command this file hands over for a folder
# ge cannot put a file into. Written once, here, because person_write_fix and
# person_no_such both need it and one folder must not get two different lines.
#
# ALL THREE BITS, AND NOT u+w. A folder takes a new file only when it can be
# entered as well as written to, so on a folder at 400 u+w gives 600, the very
# next write fails in the same words, and the founder reads a second refusal for
# one condition. Driven at 555, 500, 400 and 000, under sh and under dash, by
# pasting the line and running the command that failed again.
#
# A folder that has kept its search bit is the one shape where u+w happened to be
# enough, and it is the only shape this suite had ever driven, because chmod a-w
# on a folder at 755 leaves 555 and 555 keeps that bit. A sync client does not
# stop there: iCloud Drive and OneDrive both hand a folder back with no search
# bit while they reconcile.
#
# These are the words lib/paths.sh hands a shut folder back with, at the folder
# branch of ge_may_replace, and the words ge restore and ge init use for the same
# state. The guard cannot be asked for them here: it is asked about a file, and
# the folder it names is the folder that file sits in, while every caller here
# hands over the folder itself and the file that was going into it is ge's own
# temp file, which a founder must never be shown.
person_folder_fix() {                 # <the folder ge could not write into>
  printf 'chmod u+rwx %s' "$(ge_quote "$1")"
}

person_write_fix() {                  # <the file or folder ge could not write>
  wf_w=$(person_write_where "$1")
  if [ -z "$wf_w" ]; then
    printf 'ge check'
    return 0
  fi
  if [ -d "$wf_w" ]; then
    person_folder_fix "$wf_w"
    return 0
  fi
  # Their own file, and the shared guard in lib/paths.sh is what answers for it,
  # so ge person says about a read only file exactly what ge remember and ge
  # ledger say about the same one. It hands back the read as well as the write,
  # because u+w on a file whose owner has no read either hands back half of it,
  # and it joins the folder's own chmod on the front where that is shut too.
  ge_may_replace "$wf_w"
  if [ -n "$GE_REPLACE_FIX" ]; then
    printf '%s' "$GE_REPLACE_FIX"
    return 0
  fi
  # Reached only where the guard found nothing it can name, which it can where
  # the file changed between the two questions. ge does not name a cause it
  # cannot see, because a chmod on something already fine is a dead end.
  printf 'ge check'
}

# The line that goes above the one person_write_fix builds. Never on the same
# line as it: a founder pastes the whole of what follows the arrow.
#
# The file branch says "Do this" rather than naming the chmod in words, because
# the guard joins the folder's own chmod on the front where both are shut, and a
# sentence about a read only mark above a line carrying two commands describes
# half of what the founder is about to paste. Those are the words lib/paths.sh
# puts above the same command.
person_write_why() {                  # <the file or folder ge could not write>
  wf_y=$(person_write_where "$1")
  if [ -z "$wf_y" ]; then
    printf 'ge check reads the folder and says what is stopping the write.'
  elif [ -d "$wf_y" ]; then
    printf 'This hands the folder back, to read and to write. Then run the same command again.'
  else
    printf 'Do this, then run the same command again.'
  fi
}

# person_replaceable <the founder file ge is about to replace>: 0 to go ahead.
#
# THE FAULT THIS EXISTS FOR. Every write in this file builds a new copy beside
# the founder's file and renames it over the top. A rename asks the folder and
# never the file, so a person file the founder had set to owner only was
# replaced anyway, came back carrying whatever the umask gave it, and ge printed
# "set people/....md" as though nothing had happened. That file holds a
# prospect's address and what was said to them, and the setting was theirs.
#
# It is the shared guard in lib/paths.sh, so this state is answered in the same
# words wherever a founder meets it. Three of its four answers are used here:
# their file is fine (0), their file will not take a write (1), and something
# that is not an ordinary file has that name (3). The last of those is the one
# nothing else in here can see: a folder named people/sam-northfield-io.md
# answers -f exactly as a name that is free does, and the rename then put ge's
# new file inside it and came back 0.
#
# THE FOURTH ANSWER, THE LOCKED FOLDER, FALLS THROUGH ON PURPOSE. Every write
# below already ends on person_write_fix, which names that same folder and the
# chmod that hands it back. Refusing here as well would answer one state in two
# sets of words, and a founder reading two different refusals for one locked
# folder reasonably concludes there are two things wrong with it.
person_replaceable() {                # <the founder file>
  ge_may_replace "$1"
  pr_rc=$?
  case $pr_rc in
    1|3) ge_replace_refusal "$1" >&2; return 1 ;;
  esac
  return 0
}

# person_folder_readable <what did not happen> <one sentence> [<a second>]: 0
# when the people folder can actually be walked.
#
# THE FAULT THIS EXISTS FOR, AND IT LOST A FOUNDER'S OUTREACH LIST. A folder
# whose contents cannot be listed answers people/*.md with nothing at all, and
# nothing at all is exactly what an empty folder answers with. ge person export
# firstlines walked nobody, counted nobody, wrote a file holding a header row
# and nothing else over the top of the one the founder already had, printed
# "wrote growth-engine/outreach-firstlines.csv  0 prospects" and exited 0. The
# twenty five cold emails they had spent a week on were gone and they had been
# told the write succeeded. ge person export openers emptied the targets block
# the same way, and ge person list told a founder with sixty prospects that
# growth-engine/people/ is empty. A sync client holding the folder for a moment
# is all it takes. ge check calls the same folder a failure in the same second,
# so the answer was there to be asked for and none of the three asked.
#
# A read that cannot see its input must never write its output, and must never
# report what it did not read. So this is asked first, before anything is built
# and before anything is moved into place.
#
# -r and -x, the pair ge check and ge lint ask for and the pair they name in one
# chmod: listing the filenames needs the read bit and opening the files inside
# needs the search bit, and a folder with one and not the other walks halfway
# and says nothing. Neither is refused on a machine where the bit means nothing,
# a run as root or a Windows drive under Git Bash, because on those the folder
# really can be walked and there is nothing to refuse.
person_folder_readable() {            # <what did not happen> <one sentence> [<a second>]
  [ -r "$GE_P_DIR" ] && [ -x "$GE_P_DIR" ] && return 0
  printf 'FAIL  the people folder cannot be opened, so %s.\n' "$1" >&2
  printf '      %s\n' "$2" >&2
  [ -n "${3:-}" ] && printf '      %s\n' "$3" >&2
  printf '      This hands the folder back. Then run the same command again.\n' >&2
  printf '      → run: chmod u+rx %s\n' "$(ge_quote "$GE_P_DIR")" >&2
  return 1
}

# Never ": >" anywhere in this file. A redirect that fails on a special built-in
# ends the WHOLE shell under dash, which is /bin/sh on most Linux: checked, and
# dash exits 2 with the || branch and every later line skipped, so the founder
# gets one raw sentence and no refusal at all. "true" is a regular built-in and
# merely returns 1, which is why every truncation here goes through it.
#
# The scratch files for list and export all sit in .state, so one locked folder
# breaks all of them the same way. Asked once, up front, with the one sentence a
# founder can act on, rather than several silent returns further down.
person_state_writable() {
  ps_probe="$GE_P_HOME/.state/ge-person-probe.$$"
  true 2>/dev/null > "$ps_probe" || {
    person_fail 'the .state folder inside growth-engine could not be written, so nothing ran.' \
                "$(person_write_fix "$GE_P_HOME/.state")" "$(person_write_why "$GE_P_HOME/.state")"
    return 1
  }
  rm -f "$ps_probe"
  return 0
}

# The same refusal for add, set, note and touch, because a founder who pastes from
# a web page hits all four and a different sentence each time reads as a different
# problem. A marker is refused for the same reason a line break is: both survive
# the write and break the file afterwards, when nobody is watching, and a person
# file whose markers no longer pair can never be written to again.
#
# These three go through person_guide, and person_not_a_flag below is the third.
# Every other refusal in this file names a command because ge holds what the
# command needs. Here it does not: what the founder meant to type is the one
# thing that never reached ge, and the shell has already taken their quotes off.
# Printing a command built from what did arrive would hand them their own mistake
# back to paste, so the only honest line is the one change to make to what they
# typed, on a bare arrow that does not ask to be pasted.
person_value_ok() {                   # <value> <what it is>
  case $1 in
    *"$GE_NL"*)
      person_guide "the $2 cannot contain a line break." \
                   'Put the text on one line, then run the same command again.'
      return 1 ;;
  esac
  case $1 in
    *'<!-- GE:'*)
      person_guide "the $2 cannot contain \"<!-- GE:\". That is how ge marks the parts of a file it owns." \
                   'Take that text out, then run the same command again.'
      return 1 ;;
  esac
  return 0
}

# A slot that took a flag is almost always a quote that was never closed: the
# shell handed ge the flag name where the founder meant to hand it their text.
# The flag loop catches this a few lines lower, and every slot filled before the
# loop runs needs the same guard or the flag is written down as a person's name.
person_not_a_flag() {                 # <value> <what it is>
  case $1 in
    --*)
      printf 'FAIL  "%s" was read as the %s.\n' "$1" "$2" >&2
      printf '      That is what a missing closing quote looks like, so the flag was taken as your text.\n' >&2
      # A bare arrow, for the reason set out above person_value_ok: their own
      # text never reached ge, so there is no command here to hand back.
      printf '      → Put a quote at each end of the %s, then run the same command again.\n' "$2" >&2
      return 1 ;;
  esac
  return 0
}

# Faults come off person_validate as "CODE:line N<tab>reason" or "CODE:file<tab>
# reason", which is a shape a column can be pulled off. None of that is for a
# founder: a colon-tagged token and a raw tab in the middle of a sentence is not
# something anybody can act on. This turns each one into the sentence underneath,
# with the line number in front of it where there is one. ge lint has said the
# same faults in plain words all along; this is the same rendering, in the three
# places that were printing the raw line instead.
#
# The indent is an argument because ge person list nests these under the person
# they belong to, and a refusal from note or touch does not. Six spaces stays the
# default, so the two refusals that were already right are unchanged.
person_faults_plain() {               # [<indent>] reads fault lines, writes prose
  fp_pad=${1:-'      '}
  while IFS= read -r fp_l || [ -n "$fp_l" ]; do
    [ -n "$fp_l" ] || continue
    fp_where=${fp_l%%"$GE_TAB"*}
    fp_why=${fp_l#*"$GE_TAB"}
    case $fp_where in
      *':line '*) printf '%sline %s: %s\n' "$fp_pad" "${fp_where#*:line }" "$fp_why" ;;
      *)          printf '%s%s\n' "$fp_pad" "$fp_why" ;;
    esac
  done
  return 0
}

# Where the first fault is, in three or four words, for the one narrow column the
# list has room for. The reason itself is a sentence and goes under the table.
person_fault_where() {                # <fault line>
  fw_where=${1%%"$GE_TAB"*}
  case $fw_where in
    *':line '*) printf 'line %s' "${fw_where#*:line }" ;;
    *)          printf 'the whole file' ;;
  esac
  return 0
}

# One column of a table, padded to a width counted in characters. LC_ALL=C is set
# at the top of this file, because every sort in here has a byte-exact expectation
# committed against it, and that makes ${#} a count of bytes: one accented letter
# then eats a column of padding and every column after it steps left. A UTF-8
# character is one lead byte and up to three continuation bytes, and only the lead
# byte draws anything, so the continuation bytes are what has to come off.
#
# A character that draws two columns wide, which is most CJK, still counts as one.
# Getting that right needs a width table this toolkit has no room for, and the
# accented Latin name is the case a 130-founder cohort actually has.
person_pad() {                        # <value> <width>
  pp_v=$1; pp_w=$2
  pp_n=${#pp_v}
  case $pp_v in
    *[!\ -~]*)
      pp_n=$(( pp_n - $(printf '%s' "$pp_v" | tr -d -c '\200-\277' | wc -c) )) ;;
  esac
  printf '%s' "$pp_v"
  while [ "$pp_n" -lt "$pp_w" ]; do
    printf ' '
    pp_n=$((pp_n + 1))
  done
  return 0
}

# YYYY-MM-DD, and nothing else. Not date -d, which reads "next Friday" on GNU and
# refuses it on BSD, so the same file would be sound on one founder's machine and
# malformed on another's.
person_date_ok() {                    # <value>
  case $1 in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
    *) return 1 ;;
  esac
  pk_m=${1#*-}; pk_m=${pk_m%%-*}; pk_m=${pk_m#0}
  pk_d=${1##*-}; pk_d=${pk_d#0}
  [ "$pk_m" -ge 1 ] && [ "$pk_m" -le 12 ] || return 1
  [ "$pk_d" -ge 1 ] && [ "$pk_d" -le 31 ] || return 1
  return 0
}

# The recovery is passed in rather than built here, because the command that
# fixes a bad channel is not the command that fixes a bad status, and a recovery
# line naming a command that does not exist is worse than none.
person_enum_fail() {                  # <recovery> <field> <value> <allowed...>
  pe_r=$1; pe_f=$2; pe_v=$3; shift 3
  printf 'FAIL  "%s" is not a %s.\n' "$pe_v" "$pe_f" >&2
  printf '      The values that work are: %s\n' "$*" >&2
  printf '      → run: %s\n' "$pe_r" >&2
  return 1
}

# ---------------------------------------------------------------- the folder

person_home() {
  ph_out=$(ge_find_home)
  ph_rc=$?
  # The shared refusal in lib/paths.sh, not person_fail with a sentence of its
  # own. "here or above here" was not true: ge_find_home also reads the home
  # folder, the Desktop, Documents and Downloads, so a founder whose folder is
  # on the Desktop was told ge had never looked there, and ge init was the only
  # thing offered. That is how the second folder gets made.
  if [ "$ph_rc" -eq 1 ]; then
    ge_nofolder_refusal fail >&2
    return 1
  fi
  if [ "$ph_rc" -eq 2 ]; then
    # The shared refusal in lib/paths.sh, not one written here. This used to say
    # "cd to <folder>", which cannot clear it: the search takes in the home
    # folder, the Desktop, Documents and Downloads whatever folder you are
    # standing in, so the founder got the same refusal from inside the folder the
    # message had just named them. Renaming one does clear it, and that is what
    # the shared refusal says, in the same words as every other verb.
    ge_scatter_refusal "$ph_out" >&2
    return 1
  fi
  GE_P_HOME=$ph_out
  GE_P_PARENT=$(dirname -- "$GE_P_HOME")
  GE_P_DIR="$GE_P_HOME/people"
  if [ ! -d "$GE_P_DIR" ]; then
    person_fail "$GE_P_HOME has no people folder." 'ge init' \
                'ge init seeds that folder. It does not overwrite anything you have written.'
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------- keys, slugs

# Normalise once, at write, and store the normalised form. Without it
# Sofia@BrightOps.co.uk and sofia@brightops.co.uk are two people.
person_normkey() {                    # <raw key>
  pn_v=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
  case $pn_v in
    *:*)
      pn_p=${pn_v%%:*}
      pn_h=${pn_v#*:}
      pn_h=${pn_h#@}
      printf '%s:%s' "$pn_p" "$pn_h" ;;
    *)
      printf '%s' "$pn_v" ;;
  esac
}

# The one deterministic rule. Any code holding the key can find the file by
# deriving and probing, so there is no lookup table anywhere to fall out of date.
person_slug() {                       # <normalised key>
  printf '%s' "$1" \
    | tr 'A-Z' 'a-z' \
    | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' \
    | cut -c1-60 \
    | sed 's/-$//'
}

# ---------------------------------------------------------------- reading

# Every loop below that reads a person file is written "done 2>/dev/null < file",
# in that order, and the order is the whole point. A person file a sync client
# has taken the read bit off, or one copied over from another account, otherwise
# answers with the shell's own line: this file's name, the line number inside it,
# and the founder's path. Redirect the input first and that line has already been
# printed by the time stderr is pointed anywhere. Nothing inside these loops
# writes to stderr, so nothing worth reading is lost.

# The whole file as a founder should see it: the fields, the headings, what is
# in each section and their own writing, with the six lines ge writes to mark
# where its sections start and stop taken out.
#
# Those six are punctuation for the parser, not content. ge person get used to
# hand the file over whole, so somebody who asked to see a prospect was shown
# "<!-- GE:TOUCH:START -->" six times and had no way to know whether it was
# theirs, whether it mattered, or whether deleting it would help. It is the one
# thing in the file they can do nothing useful with.
#
# Everything else comes through exactly as it sits on disk, carriage returns and
# all: this is a read, and a read that tidies is a read that lies about the file.
# The marker text comes from lib/blocks.sh through the environment, never from a
# pattern spelled out again here, so the reader and the writer cannot drift apart
# about what a marker is. Through the environment and ENVIRON, never awk -v,
# which reads escape sequences in the value it is handed.
person_show() {                       # <file>
  px_m=$(block_start TOUCH; printf '\n'; block_end TOUCH; printf '\n'
         block_start OPENER; printf '\n'; block_end OPENER; printf '\n'
         block_start NOTES; printf '\n'; block_end NOTES)
  GE_P_MARKS=$px_m awk '
    BEGIN {
      n = split(ENVIRON["GE_P_MARKS"], m, "\n")
      for (i = 1; i <= n; i = i + 1) mark[m[i]] = 1
    }
    # Compared with the carriage return off, so a file saved on Windows has its
    # markers recognised, and printed with it still on, so nothing is rewritten.
    { line = $0; sub(/\r$/, "", line) }
    line in mark { next }
    { print }
  ' "$1"
}

# One field, header only, first occurrence. The header stops at the first "## "
# line, so a founder's own "status: still thinking" under ## Yours is prose.
person_get_field() {                  # <file> <name>
  pg_f=$1; pg_n=$2; pg_out=''; pg_hit=0; pg_one=1
  while IFS= read -r pg_l || [ -n "$pg_l" ]; do
    pg_l=${pg_l%"$GE_CR"}
    if [ "$pg_one" -eq 1 ]; then pg_l=${pg_l#"$GE_BOM"}; pg_one=0; fi
    case $pg_l in '## '*) break ;; esac
    if [ "$pg_hit" -eq 0 ]; then
      case $pg_l in
        "$pg_n: "*) pg_out=${pg_l#"$pg_n: "}; pg_hit=1 ;;
      esac
    fi
  done 2>/dev/null < "$pg_f"
  printf '%s' "$pg_out"
  return 0
}

# Every occurrence, one per line. link is the only repeatable field, and this is
# how ge person get prints it without pretending there is only one.
person_get_values() {                 # <file> <name>
  pv_f=$1; pv_n=$2; pv_one=1
  while IFS= read -r pv_l || [ -n "$pv_l" ]; do
    pv_l=${pv_l%"$GE_CR"}
    if [ "$pv_one" -eq 1 ]; then pv_l=${pv_l#"$GE_BOM"}; pv_one=0; fi
    case $pv_l in '## '*) break ;; esac
    case $pv_l in
      "$pv_n: "*) printf '%s\n' "${pv_l#"$pv_n: "}" ;;
    esac
  done 2>/dev/null < "$pv_f"
  return 0
}

# One pass, filling the fields every reader wants. No eval: a person file is
# founder data and data never becomes shell.
person_scan() {                       # <file>
  P_key=''; P_kind=''; P_name=''; P_status=''; P_source=''; P_created=''
  P_email=''; P_platform=''; P_handle=''; P_first_name=''; P_company=''
  P_title=''; P_why_them=''; P_priority=''; P_follow_up_on=''; ps_one=1
  while IFS= read -r ps_l || [ -n "$ps_l" ]; do
    ps_l=${ps_l%"$GE_CR"}
    if [ "$ps_one" -eq 1 ]; then ps_l=${ps_l#"$GE_BOM"}; ps_one=0; fi
    case $ps_l in '## '*) break ;; esac
    ps_n=${ps_l%%: *}
    [ "$ps_n" = "$ps_l" ] && continue
    ps_v=${ps_l#*: }
    case $ps_n in
      key)          [ -z "$P_key" ] && P_key=$ps_v ;;
      kind)         [ -z "$P_kind" ] && P_kind=$ps_v ;;
      name)         [ -z "$P_name" ] && P_name=$ps_v ;;
      status)       [ -z "$P_status" ] && P_status=$ps_v ;;
      source)       [ -z "$P_source" ] && P_source=$ps_v ;;
      created)      [ -z "$P_created" ] && P_created=$ps_v ;;
      email)        [ -z "$P_email" ] && P_email=$ps_v ;;
      platform)     [ -z "$P_platform" ] && P_platform=$ps_v ;;
      handle)       [ -z "$P_handle" ] && P_handle=$ps_v ;;
      first_name)   [ -z "$P_first_name" ] && P_first_name=$ps_v ;;
      company)      [ -z "$P_company" ] && P_company=$ps_v ;;
      title)        [ -z "$P_title" ] && P_title=$ps_v ;;
      why_them)     [ -z "$P_why_them" ] && P_why_them=$ps_v ;;
      priority)     [ -z "$P_priority" ] && P_priority=$ps_v ;;
      follow_up_on) [ -z "$P_follow_up_on" ] && P_follow_up_on=$ps_v ;;
    esac
  done 2>/dev/null < "$1"
  return 0
}

person_in_list() {                    # <value> <space separated list>
  pl_v=$1
  for pl_a in $2; do
    [ "$pl_v" = "$pl_a" ] && return 0
  done
  return 1
}

person_status_enum() {                # <kind>
  case $1 in
    prospect) printf '%s' "$GE_P_ST_PROSPECT" ;;
    target)   printf '%s' "$GE_P_ST_TARGET" ;;
  esac
}

# The three marked sections, named the way the founder's own file names them.
#
# TOUCH, OPENER and NOTES are what lib/blocks.sh calls them, and two faults used
# to hand that straight over: "a line inside GE:NOTES that does not start with
# - ". GE:NOTES is punctuation out of the parser. Nobody can act on it, and it
# reads as a fourth thing in the file when it is the section already headed
# "## Notes" two lines above the line being complained about. The headings are
# what the founder sees when they open the file, so the headings are what a fault
# names. The marker text itself is still spelled out in the two refusals that are
# about a marker line: one missing, where naming it is the only way to say what to
# put back, and one pasted into the founder's own writing, where naming it is the
# only way to say what to go and take out.
person_block_words() {                # <TOUCH|OPENER|NOTES>
  case $1 in
    TOUCH)  printf 'your touch log' ;;
    OPENER) printf 'your opener' ;;
    NOTES)  printf 'your notes' ;;
    # Never reached from this file, which only ever passes the three above. A
    # name rather than nothing, so a fourth block added later reads as clumsy
    # English instead of leaving a sentence with a hole in the middle of it.
    *)      printf 'a section ge keeps' ;;
  esac
}

# ---------------------------------------------------------------- validation

# Faults are printed one per line as "CODE:line N<tab>what is wrong", so list can
# show the first field in its status column and a refusal can show both.
# A fault is never a reason to hide the person: it is the reason to name them.
#
# That shape is for the code that reads it, never for a founder. Every path that
# shows a fault to a person puts it through person_faults_plain first, which
# drops the tag and the tab and leaves the sentence.
person_validate() {                   # <file>
  pf_f=$1
  # Asked before a byte is parsed. A file this computer will not let ge read
  # comes back from every reader in here as nothing at all, and nothing at all
  # parses as a person with no key, no kind, no name and no marked sections: nine
  # sentences about lines that are all present, and a founder sent to fix a file
  # that is not broken. One sentence that is true instead.
  if [ ! -r "$pf_f" ]; then
    printf 'UNREADABLE:file\tthis file is here, but this computer would not let ge read it\n'
    return 1
  fi
  pf_n=0; pf_hdr=1; pf_blk=''; pf_bad=0
  pf_seen=' '; pf_key=''; pf_kind=''; pf_status=''; pf_platform=''
  pf_source=''; pf_priority=''; pf_estatus=''; pf_plabel=''
  pf_email=''; pf_handle=''
  pf_ts=0; pf_te=0; pf_os=0; pf_oe=0; pf_ns=0; pf_ne=0
  pf_touch_s=$(block_start TOUCH); pf_touch_e=$(block_end TOUCH)
  pf_open_s=$(block_start OPENER);  pf_open_e=$(block_end OPENER)
  pf_note_s=$(block_start NOTES);   pf_note_e=$(block_end NOTES)

  while IFS= read -r pf_l || [ -n "$pf_l" ]; do
    pf_n=$((pf_n + 1))
    pf_l=${pf_l%"$GE_CR"}
    [ "$pf_n" -eq 1 ] && pf_l=${pf_l#"$GE_BOM"}

    if [ "$pf_hdr" -eq 1 ]; then
      case $pf_l in '## '*) pf_hdr=0 ;; esac
    fi

    if [ "$pf_hdr" -eq 1 ]; then
      [ -z "$pf_l" ] && continue
      # A marker line above the first "## " is still a marker line. This used to
      # fall through the comment skip below, because a marker is written as an
      # HTML comment, so a stray end marker pasted into the header counted as
      # nothing here and as a second end line in lib/blocks.sh. That file then
      # said the person was whole and every write to them refused for ever, with
      # a recovery line telling the founder to put back two lines already there.
      case $pf_l in
        "$pf_touch_s") pf_ts=$((pf_ts + 1)); continue ;;
        "$pf_touch_e") pf_te=$((pf_te + 1)); continue ;;
        "$pf_open_s")  pf_os=$((pf_os + 1)); continue ;;
        "$pf_open_e")  pf_oe=$((pf_oe + 1)); continue ;;
        "$pf_note_s")  pf_ns=$((pf_ns + 1)); continue ;;
        "$pf_note_e")  pf_ne=$((pf_ne + 1)); continue ;;
      esac
      case $pf_l in '#'*) continue ;; '<!--'*) continue ;; esac
      pf_name=${pf_l%%: *}
      pf_val=${pf_l#*: }
      if [ "$pf_name" = "$pf_l" ]; then
        printf 'BADLINE:line %s\tnot a field, not blank, not a comment: %s\n' "$pf_n" "$pf_l"
        pf_bad=1; continue
      fi
      case $pf_name in
        [a-z]*) ;;
        *) printf 'BADLINE:line %s\ta field name starts with a letter: %s\n' "$pf_n" "$pf_l"
           pf_bad=1; continue ;;
      esac
      case $pf_name in
        *[!a-z0-9_]*)
          printf 'BADLINE:line %s\ta field name is lower case letters, digits and underscores: %s\n' "$pf_n" "$pf_l"
          pf_bad=1; continue ;;
      esac
      if ! person_in_list "$pf_name" "$GE_P_FIELDS"; then
        printf 'UNKNOWN:line %s\tthere is no field called %s\n' "$pf_n" "$pf_name"
        pf_bad=1; continue
      fi
      if [ -z "$pf_val" ]; then
        printf 'EMPTY:line %s\t%s has no value. A field you do not have is a field that is not in the file\n' "$pf_n" "$pf_name"
        pf_bad=1; continue
      fi
      if [ "$pf_name" != link ]; then
        case $pf_seen in
          *" $pf_name "*)
            printf 'DUPFIELD:line %s\t%s appears twice. ge never takes the last one, because you would be reading the other\n' "$pf_n" "$pf_name"
            pf_bad=1; continue ;;
        esac
        pf_seen="$pf_seen$pf_name "
      fi
      case $pf_name in
        key)            pf_key=$pf_val ;;
        kind)           pf_kind=$pf_val ;;
        status)         pf_status=$pf_val ;;
        platform)       pf_platform=$pf_val ;;
        platform_label) pf_plabel=$pf_val ;;
        source)         pf_source=$pf_val ;;
        priority)       pf_priority=$pf_val ;;
        email_status)   pf_estatus=$pf_val ;;
        email)          pf_email=$pf_val ;;
        handle)         pf_handle=$pf_val ;;
      esac
      continue
    fi

    # Body. Only the marked blocks are read, and only between their own markers.
    case $pf_l in
      "$pf_touch_s") pf_ts=$((pf_ts + 1)); pf_blk=TOUCH; continue ;;
      "$pf_touch_e") pf_te=$((pf_te + 1)); pf_blk=''; continue ;;
      "$pf_open_s")  pf_os=$((pf_os + 1)); pf_blk=OPENER; continue ;;
      "$pf_open_e")  pf_oe=$((pf_oe + 1)); pf_blk=''; continue ;;
      "$pf_note_s")  pf_ns=$((pf_ns + 1)); pf_blk=NOTES; continue ;;
      "$pf_note_e")  pf_ne=$((pf_ne + 1)); pf_blk=''; continue ;;
    esac
    # A heading closes whatever block was open. In a whole file that changes
    # nothing. In a file whose END marker was deleted it is what keeps the
    # founder's own writing under ## Yours out of the fault list, and the missing
    # marker is still reported, once, as HALFMARKED.
    case $pf_l in '## '*) pf_blk='' ;; esac
    [ -n "$pf_blk" ] || continue

    # A line inside a block that carries a marker without being one. The block
    # readers stop at the first line that looks like the end, so this line is read
    # as the end of the block and everything under it is dropped by the next write.
    # Nothing here can put that back, so the file is named before a write happens.
    #
    # The section is named as the founder's own file names it, never as GE:NOTES.
    # The quoted "<!-- GE:" stays: it is the text to go and take out, and the line
    # number on its own does not tell them which part of a pasted paragraph it is.
    case $pf_l in
      *'<!-- GE:'*)
        printf 'MARKERTEXT:line %s\ta line in %s carries "<!-- GE:" as text, and the next write would read it as the end of that section\n' \
          "$pf_n" "$(person_block_words "$pf_blk")"
        pf_bad=1; continue ;;
    esac

    # A sentence handed to something that expected a list comes back one letter
    # per bullet. It carries no error of its own, so it needs a detector.
    if [ "${#pf_l}" -eq 3 ]; then
      case $pf_l in
        '- '*)
          printf 'SHREDDED:line %s\ta bullet holding one character, which is what a split sentence looks like\n' "$pf_n"
          pf_bad=1; continue ;;
      esac
    fi

    if [ "$pf_blk" = TOUCH ] || [ "$pf_blk" = NOTES ]; then
      # A blank line loses nothing and hides nothing, so it is not a fault. The
      # line this rule is here for is the second line of a pasted note, which
      # carries text and would otherwise be read as the newest touch.
      case $pf_l in
        ''|'- '*) ;;
        # Named by its heading, and by what the founder can see is wrong with it,
        # rather than by the block name the parser passes around.
        *) printf 'BADBLOCKLINE:line %s\ta line in %s that is not one of the entries. Every entry starts with "- "\n' \
             "$pf_n" "$(person_block_words "$pf_blk")"
           pf_bad=1; continue ;;
      esac
    fi

    if [ "$pf_blk" = TOUCH ]; then
      pf_ch=$(printf '%s' "$pf_l" | awk '{print $3}')
      pf_di=$(printf '%s' "$pf_l" | awk '{print $4}' | tr -d ':')
      if ! person_in_list "$pf_ch" "$GE_P_CHANNEL" || ! person_in_list "$pf_di" "$GE_P_DIRECTION"; then
        printf 'BADTOUCH:line %s\ta touch line reads "- <date> <channel> <direction>: <text>"\n' "$pf_n"
        pf_bad=1
      fi
    fi
  done 2>/dev/null < "$pf_f"

  # One start and one end, counted as whole lines, which is the same definition
  # block_check uses. Anything else and the two disagree: this would call the file
  # whole and the write would refuse it, which is how a founder ends up with a
  # command that fails every time and a file nothing will explain.
  for pf_pair in "TOUCH $pf_ts $pf_te" "OPENER $pf_os $pf_oe" "NOTES $pf_ns $pf_ne"; do
    # Word splitting on a string we built ourselves, one line, three fields.
    set -- $pf_pair
    if [ "$2" -ne "$3" ]; then
      printf 'HALFMARKED:file\tthis file holds %s and %s, and it needs one of each\n' \
        "$(block_tally "$2" "$(block_start "$1")")" "$(block_tally "$3" "$(block_end "$1")")"
      pf_bad=1
    elif [ "$2" -ne 1 ]; then
      printf 'BLOCKCOUNT:file\tthis file holds %s and %s, and it needs one of each\n' \
        "$(block_tally "$2" "$(block_start "$1")")" "$(block_tally "$3" "$(block_end "$1")")"
      pf_bad=1
    fi
  done

  for pf_req in key kind name status source created; do
    case $pf_seen in
      *" $pf_req "*) ;;
      *) printf 'MISSING:file\tevery person needs a %s line\n' "$pf_req"; pf_bad=1 ;;
    esac
  done

  case $pf_kind in
    prospect)
      [ -n "$pf_email" ] || { printf 'MISSING:file\ta prospect needs an email line\n'; pf_bad=1; } ;;
    target)
      [ -n "$pf_platform" ] || { printf 'MISSING:file\ta target needs a platform line\n'; pf_bad=1; }
      [ -n "$pf_handle" ] || { printf 'MISSING:file\ta target needs a handle line\n'; pf_bad=1; }
      if [ "$pf_platform" = other ] && [ -z "$pf_plabel" ]; then
        printf 'MISSING:file\tplatform: other needs a platform_label line naming the real platform\n'
        pf_bad=1
      fi ;;
    '') ;;
    *) printf 'BADKIND:file\tkind is prospect or target, not %s\n' "$pf_kind"; pf_bad=1 ;;
  esac

  if [ -n "$pf_status" ] && [ -n "$(person_status_enum "$pf_kind")" ]; then
    if ! person_in_list "$pf_status" "$(person_status_enum "$pf_kind")"; then
      printf 'BADENUM:file\tstatus %s is not a status for kind %s. The six are: %s\n' \
        "$pf_status" "$pf_kind" "$(person_status_enum "$pf_kind")"
      pf_bad=1
    fi
  fi
  if [ -n "$pf_platform" ] && ! person_in_list "$pf_platform" "$GE_P_PLATFORM"; then
    printf 'BADENUM:file\tplatform %s is not one of: %s\n' "$pf_platform" "$GE_P_PLATFORM"; pf_bad=1
  fi
  if [ -n "$pf_source" ] && ! person_in_list "$pf_source" "$GE_P_SOURCE"; then
    printf 'BADENUM:file\tsource %s is not one of: %s\n' "$pf_source" "$GE_P_SOURCE"; pf_bad=1
  fi
  if [ -n "$pf_priority" ] && ! person_in_list "$pf_priority" "$GE_P_PRIORITY"; then
    printf 'BADENUM:file\tpriority %s is not one of: %s\n' "$pf_priority" "$GE_P_PRIORITY"; pf_bad=1
  fi
  if [ -n "$pf_estatus" ] && ! person_in_list "$pf_estatus" "$GE_P_EMAIL_STATUS"; then
    printf 'BADENUM:file\temail_status %s is not one of: %s\n' "$pf_estatus" "$GE_P_EMAIL_STATUS"; pf_bad=1
  fi

  # The filename is checked against the derive-and-probe rule, not against bare
  # equality, because -2 to -9 are how two keys deriving one slug both get a home.
  if [ -n "$pf_key" ]; then
    pf_base=${pf_f##*/}; pf_base=${pf_base%.md}
    pf_want=$(person_slug "$pf_key")
    if [ "$pf_base" != "$pf_want" ]; then
      pf_ok=0
      case $pf_base in
        "$pf_want"-[2-9]) pf_ok=1 ;;
      esac
      if [ "$pf_ok" -eq 0 ]; then
        printf 'BADNAME:file\tthe filename does not derive from the key. It should be %s.md, or %s-2.md to %s-9.md\n' \
          "$pf_want" "$pf_want" "$pf_want"
        pf_bad=1
      fi
    fi
  fi

  [ "$pf_bad" -eq 0 ]
}

# The strict posture, in one place: a malformed file is named, its faults are
# printed, and nothing is written.
person_require_valid() {              # <file>
  pr_out=$(person_validate "$1") || {
    printf 'FAIL  %s is malformed, so nothing was written.\n' "people/${1##*/}" >&2
    printf '%s\n' "$pr_out" | person_faults_plain >&2
    # Quoted, because a slug reaches this line as a filename off disk and not as
    # a derived one. A file somebody copied in by hand is exactly the file that
    # is malformed, and "Sam Notes.md" pasted bare answers that there is nobody
    # called Sam: a second refusal, further from the truth than the first.
    pr_who=${1##*/}; pr_who=${pr_who%.md}
    printf '      That prints the file, so you can fix those lines in your editor.\n' >&2
    printf '      → run: ge person get %s\n' "$(ge_quote "$pr_who")" >&2
    return 1
  }
  return 0
}

# ---------------------------------------------------------------- resolving

# The people this argument could mean, when it turned out to mean more than one.
# Read by person_no_such and by nothing else. Set on every call to person_resolve
# so a name matched in one command can never be reported by the next.
P_AMBIG=''

# The first person file that is there and would not open, found while looking
# for somebody. ge reads the key and the name out of the file, so a file it
# cannot read is a file it can say nothing about, and "there is no person here
# called that" would be a claim about a file ge never got to look at. Set on
# every call to person_resolve, read by person_no_such.
P_UNREADABLE=''

# person_by_name <name>: the one person whose name field is this.
#
# WHY: a founder adds somebody as "Sam Carter" and later types that name back,
# because the name is the part of the record they wrote and the part they
# remember. sam@northfield.io is the key, and answering "there is no person here
# called Sam Carter" was not true: the file says name: Sam Carter. It sent them
# to ge person list to copy out an address they had already given ge once.
#
# Capitals are ignored, because a name typed back rarely comes back with the same
# ones. Two people of one name is refused and both are named: writing a note onto
# the wrong Sam Carter is silent, and it is the founder who finds out.
person_by_name() {                    # <name>
  bn_want=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
  bn_hits=0
  for bn_f in "$GE_P_DIR"/*.md; do
    [ -e "$bn_f" ] || break
    case ${bn_f##*/} in README.md) continue ;; esac
    if [ ! -r "$bn_f" ]; then
      [ -n "$P_UNREADABLE" ] || P_UNREADABLE=$bn_f
      continue
    fi
    bn_have=$(person_get_field "$bn_f" name)
    [ -n "$bn_have" ] || continue
    # The exact compare first, because it costs nothing. tr is a program, and on
    # Git Bash starting one costs more than reading the whole file did, so a
    # folder of prospects would pay for a hundred of them on every lookup.
    if [ "$bn_have" != "$1" ]; then
      [ "$(printf '%s' "$bn_have" | tr 'A-Z' 'a-z')" = "$bn_want" ] || continue
    fi
    bn_hits=$((bn_hits + 1))
    P_AMBIG="$P_AMBIG        $bn_have  $(person_get_field "$bn_f" key)$GE_NL"
    P_FILE=$bn_f
    bn_base=${bn_f##*/}
    P_SLUG=${bn_base%.md}
  done
  if [ "$bn_hits" -eq 1 ]; then
    P_AMBIG=''
    return 0
  fi
  # Nothing is left half resolved. A caller that ignored the exit code would
  # otherwise write onto whichever file the loop happened to see last.
  P_FILE=''; P_SLUG=''
  [ "$bn_hits" -eq 0 ] && P_AMBIG=''
  return 2
}

# An argument carrying @ or : is a key. Anything else is a filename slug, and
# failing that, the name the founder wrote down.
# Founders copy an address out of a CSV. Nobody types a 28 character slug.
person_resolve() {                    # <key, slug or name>
  P_FILE=''; P_SLUG=''; P_AMBIG=''; P_UNREADABLE=''
  case $1 in
    *@*|*:*)
      pr_key=$(person_normkey "$1")
      pr_slug=$(person_slug "$pr_key")
      [ -n "$pr_slug" ] || return 2
      pr_n=1
      while [ "$pr_n" -le 9 ]; do
        if [ "$pr_n" -eq 1 ]; then pr_name=$pr_slug; else pr_name="$pr_slug-$pr_n"; fi
        pr_f="$GE_P_DIR/$pr_name.md"
        # The key is a field inside the file, so a file that will not open is a
        # file this loop walks past without ever comparing anything. Noted, so
        # that the refusal says what happened rather than that nobody is there.
        if [ -f "$pr_f" ] && [ ! -r "$pr_f" ]; then
          [ -n "$P_UNREADABLE" ] || P_UNREADABLE=$pr_f
        fi
        if [ -f "$pr_f" ] && [ "$(person_get_field "$pr_f" key)" = "$pr_key" ]; then
          P_FILE=$pr_f; P_SLUG=$pr_name; return 0
        fi
        pr_n=$((pr_n + 1))
      done
      return 2 ;;
    *)
      # A derived slug never contains a dot, so a trailing .md is a filename the
      # founder copied out of an error message rather than part of the name.
      pr_s=$1
      case $pr_s in *.md) pr_s=${pr_s%.md} ;; esac
      pr_f="$GE_P_DIR/$pr_s.md"
      if [ -f "$pr_f" ]; then
        P_FILE=$pr_f; P_SLUG=$pr_s; return 0
      fi
      person_by_name "$1" ;;
  esac
}

person_no_such() {                    # <what the founder typed>
  # THE FOLDER FIRST, BEFORE ANY OF THE THREE BELOW, because every one of them
  # is a claim about what is inside it and none of them can be made about a
  # folder ge could not open.
  #
  # THE FAULT THIS EXISTS FOR. A people folder with no search bit answers
  # people/*.md with nothing at all, and nothing at all is what an empty folder
  # answers with. So a founder whose sync client had the folder for a moment
  # typed the address of a prospect they added last week and was told there is
  # no person here called that, with ge person list offered as the way out, and
  # ge person list refuses in its turn because it cannot open the folder either.
  # Two refusals, and the first of them was untrue about their own data.
  #
  # -r and -x, the same pair person_folder_readable asks for, and for the same
  # reason: listing the filenames needs the read bit and opening the files
  # inside needs the search bit. Neither is refused on a machine where the bit
  # means nothing, a run as root or a Windows drive under Git Bash, because on
  # those the folder really can be walked.
  #
  # ALL THREE BITS ON THE WAY OUT, not the two that were examined. Six of the
  # seven verbs that come through here go straight on to write into this folder,
  # so a line handing back only what the reading needed would clear the refusal
  # and leave the next one waiting behind it. ge person get is the one reader
  # among them, and it is answered with the same line rather than a second,
  # shorter one, because two different chmods for one folder read as two things
  # wrong with it. cmd/restore.sh sets out the same reasoning for the backup
  # folder, where ge check reads and ge undo writes.
  #
  # Only what was examined is CLAIMED: that ge could not look inside. Nothing
  # here says whether this person is in there, because that is the thing ge was
  # unable to find out.
  if ! { [ -r "$GE_P_DIR" ] && [ -x "$GE_P_DIR" ]; }; then
    printf 'FAIL  ge could not look inside the people folder, so it cannot say whether %s is here.\n' "$1" >&2
    printf '      Everybody in it is still there. Nothing here can see them while it is shut.\n' >&2
    printf '      This hands the folder back, to read and to write. Then run the same command again.\n' >&2
    printf '      → run: %s\n' "$(person_folder_fix "$GE_P_DIR")" >&2
    return 2
  fi
  # Said before either of the two below, because it is the only one of the three
  # ge is certain of. A file that would not open is a file ge could not read a
  # key or a name out of, so it can neither find this person nor say they are
  # not here, and saying they are not here is the answer a founder acts on.
  #
  # u+rw AND NOT u+r, which is the same half a way out the other way round. Six
  # of the seven verbs that come through here rewrite the file they were looking
  # for, so on a file at 000 the read bit alone let ge find them and then refused
  # the write, in different words, one command later. lib/paths.sh hands a file
  # back with exactly this pair, for the mirror image of this reason. Driven at
  # 444, 200 and 000, under sh and under dash.
  if [ -n "$P_UNREADABLE" ]; then
    printf 'FAIL  ge could not tell whether %s is here. One file in people/ would not open.\n' "$1" >&2
    printf '      This hands the file back, to read and to write. Then run the same command again.\n' >&2
    printf '      → run: chmod u+rw %s\n' "$(ge_quote "$P_UNREADABLE")" >&2
    return 2
  fi
  if [ -n "$P_AMBIG" ]; then
    printf 'FAIL  more than one person here is called %s, so ge did not touch any of them.\n' "$1" >&2
    printf '%s' "$P_AMBIG" >&2
    printf '      Use the address or the handle beside the one you mean. Those are different for each.\n' >&2
    printf '      → run: ge person list\n' >&2
    return 2
  fi
  printf 'FAIL  there is no person here called %s.\n' "$1" >&2
  printf '      The list names everybody in growth-engine/people/, with the address or handle to use.\n' >&2
  printf '      → run: ge person list\n' >&2
  return 2
}

# ---------------------------------------------------------------- snapshots

# Fail-closed: no snapshot, no write. A target that does not exist yet is a
# success and a no-op, so a first write is never blocked by a backup that could
# not have existed.
person_snapshot() {                   # <path relative to the growth-engine folder>
  [ -f "$GE_P_HOME/$1" ] || return 0
  # Nothing is printed here on failure. ge snapshot already said which file it
  # could not copy, that nothing was changed, and what to run. A second FAIL
  # block over the top of it reads as two things breaking rather than one.
  ( CDPATH= cd -- "$GE_P_PARENT" && sh "$GE_HOME_DIR/scripts/ge.sh" snapshot "$1" ) >/dev/null || return 1
  return 0
}

# The stamp of the newest snapshot of one person file, so remove can print the
# way back. ge snapshot writes people/x.md as people__x.md.<stamp>, and if that
# ever changes this prints nothing and remove says less rather than saying wrong.
person_last_stamp() {                 # <slug>
  pl_dir="$GE_P_HOME/.state/snapshots"
  [ -d "$pl_dir" ] || return 0
  for pl_s in "$pl_dir"/*; do
    [ -e "$pl_s" ] || break
    pl_b=${pl_s##*/}
    case $pl_b in
      "people__$1".md.*) printf '%s\n' "${pl_b##*.md.}" ;;
    esac
  done | LC_ALL=C sort | sed -n '$p'
  return 0
}

# ------------------------------------------------------- the two exported files

# outreach-firstlines.csv is written whole by ge person export firstlines and by
# nothing else, so the moment a prospect is added, cut or removed, the sheet on
# disk holds a different set of people from the one in people/. ge lint compares
# the opening lines, which catches an edited opener. Nothing compares who is on
# it, so a prospect who was cut stays on the sheet and three added since the
# export are not on it at all, and the founder finds out by emailing the one they
# cut. Said here, at the moment the membership changes, because that is the
# moment it can be acted on. The sheet itself is never rewritten from under them.
person_sheet_stale() {
  [ -f "$GE_P_HOME/outreach-firstlines.csv" ] || return 0
  printf '  growth-engine/outreach-firstlines.csv was written before this, so it is now a different list of people.\n' >&2
  printf '  → run: ge person export firstlines\n' >&2
  return 0
}

# The addresses on the sheet as it sits on disk now. One per line, sorted, with
# nothing invented: the first cell of every row that holds one.
#
# A row is read with its carriage return taken off and the byte order mark taken
# off the first line, because the sheet is the one file in the folder a founder
# opens in Excel, and Excel writes both. A first cell with no @ in it is the
# header row, or something a spreadsheet added, and neither is a person any file
# in people/ can be matched against.
person_sheet_keys() {                 # <csv> <outfile>
  sk_one=1
  while IFS= read -r sk_l || [ -n "$sk_l" ]; do
    sk_l=${sk_l%"$GE_CR"}
    if [ "$sk_one" -eq 1 ]; then sk_l=${sk_l#"$GE_BOM"}; sk_one=0; fi
    case $sk_l in '"'*) ;; *) continue ;; esac
    sk_v=${sk_l#\"}
    sk_v=${sk_v%%\"*}
    case $sk_v in *@*) printf '%s\n' "$sk_v" ;; esac
  done 2>/dev/null < "$1" | LC_ALL=C sort -u > "$2"
  return 0
}

# The lines of one file that are not in another, used both ways round so the two
# halves of the sheet check are the same code and cannot drift apart.
#
# awk rather than comm: comm appears nowhere else in this toolkit and wants both
# inputs sorted, and a sort that orders differently on somebody's machine would
# turn this into a wrong answer rather than no answer. The set is read with
# getline from a path handed over through the environment, never awk -v, which
# reads escape sequences in the value it is given: a folder named Q3\Q4 would
# become Q3Q4, the open would fail silently, and every prospect would be reported
# as having fallen off the sheet.
#
# The NR == FNR idiom is deliberately not used. With an empty first file, which
# is exactly what a sheet holding nothing but its header row gives, NR and FNR
# stay equal all the way through the second file, every line is swallowed as
# though it were the set, and the answer comes back empty. A founder with a blank
# sheet and sixty five prospects would have been told everything was fine.
person_not_in() {                     # <set file> <file to filter>
  GE_P_SET=$1 awk '
    BEGIN {
      f = ENVIRON["GE_P_SET"]
      while ((getline s < f) > 0) inset[s] = 1
      close(f)
    }
    !($0 in inset)
  ' "$2"
}

# Up to five names, then a count. A founder who has added sixty five prospects
# since the last export would otherwise get sixty five lines of stderr under the
# table, which is a wall nobody reads. The count above it is exact either way,
# and one command puts all of them right.
person_sheet_names() {                # <addresses, one per line>
  sn_n=$(printf '%s\n' "$1" | grep -c . || true)
  [ -n "$sn_n" ] || sn_n=0
  printf '%s\n' "$1" | sed -n '1,5p' | while IFS= read -r sn_a || [ -n "$sn_a" ]; do
    [ -n "$sn_a" ] && printf '    %s\n' "$sn_a" >&2
  done
  [ "$sn_n" -gt 5 ] && printf '    and %s more\n' "$((sn_n - 5))" >&2
  return 0
}

# Is the exported sheet still the list of people this folder holds?
#
# person_sheet_stale, above, says so at the moment the membership changes, which
# is the moment it can be acted on. It is also the moment it scrolls away. The
# founder works down the printed sheet, or uploads it to Apollo, a week later,
# and by then nothing anywhere has said a word: ge lint compares the opening
# lines of the rows that are on the sheet, so a prospect added after the export
# and a prospect cut after it are both invisible to it. That is how somebody
# emails the competitor they deliberately cut and never contacts three real
# prospects, with the toolkit reporting all clear.
#
# So it is asked again here, on the report verb, every time. Two facts and one
# command. It never rewrites the sheet: the founder may have it open, printed,
# or half sent, and changing a send list under somebody is worse than a stale one.
person_sheet_diff() {                 # <file of the addresses that belong on it>
  sd_csv="$GE_P_HOME/outreach-firstlines.csv"
  [ -f "$sd_csv" ] || return 0
  sd_sheet="$GE_P_HOME/.state/ge-person-sheet.$$"
  sd_want="$GE_P_HOME/.state/ge-person-want.$$"
  # Silent on a folder that stopped being writable mid run. The empty-state and
  # malformed blocks above have already said whatever there was to say about this
  # run, and a second refusal here would be a second FAIL for one locked folder.
  if ! true 2>/dev/null > "$sd_sheet" || ! true 2>/dev/null > "$sd_want"; then
    rm -f "$sd_sheet" "$sd_want" 2>/dev/null
    return 0
  fi
  LC_ALL=C sort -u 2>/dev/null "$1" > "$sd_want" || { rm -f "$sd_sheet" "$sd_want" 2>/dev/null; return 0; }
  person_sheet_keys "$sd_csv" "$sd_sheet" || { rm -f "$sd_sheet" "$sd_want" 2>/dev/null; return 0; }

  sd_off=$(person_not_in "$sd_want" "$sd_sheet" 2>/dev/null)
  sd_absent=$(person_not_in "$sd_sheet" "$sd_want" 2>/dev/null)
  rm -f "$sd_sheet" "$sd_want" 2>/dev/null
  [ -n "$sd_off" ] || [ -n "$sd_absent" ] || return 0

  printf 'growth-engine/outreach-firstlines.csv is not this list of people any more:\n' >&2
  if [ -n "$sd_off" ]; then
    sd_n=$(printf '%s\n' "$sd_off" | grep -c . || true)
    if [ "$sd_n" -eq 1 ]; then
      printf '  1 address on the sheet is not somebody you would send to now, because they were cut or taken out:\n' >&2
    else
      printf '  %s addresses on the sheet are not people you would send to now, because they were cut or taken out:\n' "$sd_n" >&2
    fi
    person_sheet_names "$sd_off"
  fi
  if [ -n "$sd_absent" ]; then
    sd_n=$(printf '%s\n' "$sd_absent" | grep -c . || true)
    if [ "$sd_n" -eq 1 ]; then
      printf '  1 prospect here is not on the sheet, so nothing would go out to them:\n' >&2
    else
      printf '  %s prospects here are not on the sheet, so nothing would go out to them:\n' "$sd_n" >&2
    fi
    person_sheet_names "$sd_absent"
  fi
  printf '  That writes the sheet again from the files in people/.\n' >&2
  printf '  → run: ge person export firstlines\n' >&2
  return 0
}

# Both exported files sit at the top of the growth-engine folder and both hold
# real people: addresses, names, companies, handles, and the line you are about
# to send them. The .gitignore ge init seeds covers people/ and .state/, so these
# two were the way personal data left the folder, in a repository the founder
# forked or a zip they sent to somebody for help.
#
# Topped up here rather than only in the seed, because every folder created before
# today was seeded without these lines and would never gain them otherwise.
person_ignore_export() {              # <filename, inside the growth-engine folder>
  pi_f="$GE_P_HOME/.gitignore"
  if [ ! -f "$pi_f" ]; then
    printf '  growth-engine/%s holds real people'"'"'s details, and this folder has no .gitignore to keep it out of git.\n' "$1" >&2
    # "in <folder>" is a place to go, not a command. ge has the folder, so it
    # hands over the step that gets them there as well, quoted, because half the
    # folders in this programme are named after a business and carry a space.
    # Joined with && and not with a comma: the two are one command, so the whole
    # line pastes and runs, and ge init cannot run if the cd did not.
    printf '  ge init puts back any file ge is missing. It overwrites nothing you have written.\n' >&2
    printf '  → run: cd %s && ge init\n' "$(ge_quote "$GE_P_PARENT")" >&2
    return 0
  fi
  grep -F -x -q -- "$1" "$pi_f" 2>/dev/null && return 0
  pi_ok=1
  # A last line somebody left without a newline is closed first. Appending
  # straight onto it would make one line out of two rules and neither would work.
  #
  # Both appends sit inside a group that carries the 2>/dev/null, the way every
  # other write in this file does. On the command alone it is too late: a failing
  # >> is reported by the shell before the command's own redirections are put in
  # place, so a .gitignore the sync client had locked answered with this file's
  # path and a line number in it, printed above the sentence written for the
  # founder. That is the one thing this file promises never to do, and the
  # sentence underneath already says all of it in words they can act on.
  if [ -s "$pi_f" ] && [ -n "$(tail -c 1 "$pi_f" 2>/dev/null)" ]; then
    { printf '\n' >> "$pi_f"; } 2>/dev/null || pi_ok=0
  fi
  [ "$pi_ok" -eq 1 ] && { { printf '%s\n' "$1" >> "$pi_f"; } 2>/dev/null || pi_ok=0; }
  if [ "$pi_ok" -eq 0 ]; then
    printf '  growth-engine/%s holds real people'"'"'s details and could not be added to growth-engine/.gitignore.\n' "$1" >&2
    # The file, not the folder around it. This is the one write in the file that
    # appends to something already there, so a locked .gitignore in a folder that
    # is otherwise fine is the ordinary way it fails, and person_write_fix asks
    # about the file first for exactly that.
    printf '  %s\n' "$(person_write_why "$pi_f")" >&2
    printf '  → run: %s\n' "$(person_write_fix "$pi_f")" >&2
    return 0
  fi
  printf '  %s is now in growth-engine/.gitignore, because it holds real people'"'"'s details\n' "$1"
  return 0
}

# ---------------------------------------------------------------- writing

# Rebuild the header line by line, emitting the value as an argument to printf.
# Never a sed script, never awk -v: a link carries / and ? and &, a why_them
# carries & and backslashes, and both corruptions are silent.
person_set_field() {                  # <file> <name> <value>
  sf_f=$1; sf_n=$2; sf_v=$3
  sf_tmp="$sf_f.ge-tmp.$$"
  sf_body=0; sf_hit=0; sf_blank=0; sf_bytes=0
  # Same probe as person_block_append, same two reasons: the caller has a sentence
  # ready for a folder it cannot write to, and a failed redirect on the colon
  # built-in would end the shell under dash before that sentence is ever printed.
  true 2>/dev/null > "$sf_tmp" || return 1
  while IFS= read -r sf_raw || [ -n "$sf_raw" ]; do
    sf_l=${sf_raw%"$GE_CR"}
    # The header stops at the first "## ". From there down the file is the
    # founder's, and reading it back out through printf would take their
    # carriage returns off and add a final newline they never typed, in the one
    # region this file promises them ge never writes to. So it is not read back
    # out at all: the byte it starts at is remembered and the rest is copied.
    case $sf_l in '## '*) sf_body=1; break ;; esac
    # LC_ALL=C is set at the top of this file, so ${#} is a count of bytes, and
    # the newline read took off the end is the + 1.
    sf_bytes=$((sf_bytes + ${#sf_raw} + 1))
    if [ -z "$sf_l" ]; then
      sf_blank=$((sf_blank + 1))
      continue
    fi
    while [ "$sf_blank" -gt 0 ]; do printf '\n' >> "$sf_tmp"; sf_blank=$((sf_blank - 1)); done
    if [ "$sf_hit" -eq 0 ] && [ "${sf_l%%: *}" = "$sf_n" ]; then
      printf '%s: %s\n' "$sf_n" "$sf_v" >> "$sf_tmp"
      sf_hit=1
    else
      printf '%s\n' "$sf_l" >> "$sf_tmp"
    fi
  done 2>/dev/null < "$sf_f"
  # A field that was not there goes in last, above the blank line that ends the
  # header, so the file keeps its shape.
  [ "$sf_hit" -eq 0 ] && printf '%s: %s\n' "$sf_n" "$sf_v" >> "$sf_tmp"
  while [ "$sf_blank" -gt 0 ]; do printf '\n' >> "$sf_tmp"; sf_blank=$((sf_blank - 1)); done
  if [ "$sf_body" -eq 1 ]; then
    tail -c "+$((sf_bytes + 1))" "$sf_f" >> "$sf_tmp" || { rm -f "$sf_tmp"; return 1; }
  fi
  # The founder's own permissions go onto the new copy before it lands. The
  # rename below puts ge's file where theirs was, carrying whatever the umask
  # gave it, so a person file somebody had set to owner only came back readable
  # by everybody and ge said "set people/..." while it happened. That file holds
  # a prospect's address and what was said to them, so the setting is theirs and
  # it survives the write. ge_keep_mode never fails and never says anything.
  ge_keep_mode "$sf_f" "$sf_tmp"
  # 2>/dev/null, because a locked target answers with a raw rename line naming
  # the temp file, and the caller already has a sentence ready for that.
  mv "$sf_tmp" "$sf_f" 2>/dev/null || { rm -f "$sf_tmp" 2>/dev/null; return 1; }
  return 0
}

# Can this block be written at all? Asked before the snapshot, not after, because
# a refusal that has already taken a backup spends one of the twenty slots that
# person keeps, and a founder retrying a command that can never work spends the
# other nineteen on copies of the broken file.
#
# The sentence and the recovery both come from lib/blocks.sh, so they describe
# the shape that is actually in the file. The text here used to say the file did
# not hold one start line and one end line, which was read out to a founder whose
# file held exactly that and a stray third line somewhere else.
person_block_ready() {                # <file> <block>
  bd_f=$1; bd_b=$2
  bd_slug=${bd_f##*/}; bd_slug=${bd_slug%.md}
  block_check "$bd_f" "$bd_b"
  bd_rc=$?
  [ "$bd_rc" -eq 0 ] && return 0
  printf 'FAIL  people/%s.md %s\n' "$bd_slug" "$(block_problem "$bd_f" "$bd_b")" >&2
  printf '      Nothing was written. Guessing where that section starts and stops could delete your own writing.\n' >&2
  # block_fix_line, never block_fix after a hard coded arrow. Five of the shapes
  # block_fix answers with are something to do in an editor rather than a command,
  # and printed after "→ run: " a founder pastes one and the shell answers about
  # the punctuation in a marker. block_fix_kind tells the two apart and this
  # prints the right arrow for each. The retry points forward at that line rather
  # than riding on the end of it.
  printf '      Do this, then run the same command again.\n' >&2
  block_fix_line "$bd_f" "$bd_b" '      ' >&2
  return 1
}

# Append one line to a marked block. The body goes through a file, so nothing is
# interpolated into any script, and the temp file sits beside the person file so
# the move is on one filesystem.
person_block_append() {               # <file> <block> <line>
  ba_f=$1; ba_b=$2; ba_line=$3
  ba_slug=${ba_f##*/}; ba_slug=${ba_slug%.md}
  # block_read is silent on both of the ways it fails, so the reason is named
  # here. A verb that returns 1 with nothing at all on the screen leaves the
  # founder retrying the same command, and every retry costs another snapshot.
  person_block_ready "$ba_f" "$ba_b" || return 1
  ba_tmp="$ba_f.ge-body.$$"
  # Asked before the redirect that matters, because a read only people folder is
  # the OneDrive and iCloud case and the shell's own answer to it names our line
  # number and a temp file the founder has never heard of.
  #
  # true, not the colon, and stderr redirected before the file: a redirection that
  # fails on a special built-in ends the whole shell under dash, which is /bin/sh
  # on most Linux machines, and the founder would get the raw line and nothing else.
  true 2>/dev/null > "$ba_tmp" || {
    person_fail "people/$ba_slug.md could not be written, so nothing changed." \
                "$(person_write_fix "$GE_P_DIR")" "$(person_write_why "$GE_P_DIR")"
    return 1
  }
  block_read "$ba_f" "$ba_b" > "$ba_tmp" 2>/dev/null || {
    rm -f "$ba_tmp"
    # Quoted: this slug is a filename read off disk, so a file somebody copied in
    # by hand can carry a space, and bare it names somebody who is not there.
    person_fail "people/$ba_slug.md could not be read, so nothing changed." \
                "ge person get $(ge_quote "$ba_slug")" \
                'That prints what is in the file, so you can see what stopped it being read.'
    return 1
  }
  printf '%s\n' "$ba_line" >> "$ba_tmp"
  # Silent on failure. block_write names the file, says nothing was changed and
  # gives a recovery line on every one of the ways it can fail, so a second FAIL
  # here read as two things breaking rather than one, with two differently worded
  # ways out of the same locked file. It owns that sentence; this does not.
  block_write "$ba_f" "$ba_b" "$ba_tmp" || { rm -f "$ba_tmp" 2>/dev/null; return 1; }
  rm -f "$ba_tmp" 2>/dev/null
  return 0
}

person_block_lines() {                # <file> <block>: how many lines it holds
  block_read "$1" "$2" 2>/dev/null | grep -c . || true
}

# ---------------------------------------------------------------- add

person_new_file() {                   # writes the whole person file from the A_* values
  nf_tmp="$1.ge-tmp.$$"
  # Same probe as person_block_append: a read only people folder is the OneDrive
  # and iCloud case, and the shell's own answer to a failed redirect names our
  # line number and a temp file the founder has never heard of. The caller has a
  # sentence ready, so this stays silent and lets that one be the only one shown.
  true 2>/dev/null > "$nf_tmp" || return 1
  {
    printf '<!-- Written by ge person. The fields and the marked blocks are ge'"'"'s. Everything under ## Yours is yours. -->\n'
    printf 'key: %s\n' "$A_key"
    printf 'kind: %s\n' "$A_kind"
    printf 'name: %s\n' "$A_name"
    printf 'status: %s\n' "$A_status"
    printf 'source: %s\n' "$A_source"
    printf 'created: %s\n' "$A_created"
    [ -n "$A_email" ] && printf 'email: %s\n' "$A_email"
    [ -n "$A_platform" ] && printf 'platform: %s\n' "$A_platform"
    [ -n "$A_handle" ] && printf 'handle: %s\n' "$A_handle"
    [ -n "$A_plabel" ] && printf 'platform_label: %s\n' "$A_plabel"
    [ -n "$A_company" ] && printf 'company: %s\n' "$A_company"
    [ -n "$A_title" ] && printf 'title: %s\n' "$A_title"
    [ -n "$A_found_via" ] && printf 'found_via: %s\n' "$A_found_via"
    [ -n "$A_why_them" ] && printf 'why_them: %s\n' "$A_why_them"
    [ -n "$A_priority" ] && printf 'priority: %s\n' "$A_priority"
    printf '\n## Touch log\n'
    block_start TOUCH; printf '\n'
    block_end TOUCH; printf '\n'
    printf '\n## Opener\n'
    block_start OPENER; printf '\n'
    block_end OPENER; printf '\n'
    printf '\n## Notes\n'
    block_start NOTES; printf '\n'
    [ -n "$A_note" ] && printf '%s\n' "$A_note"
    block_end NOTES; printf '\n'
    printf '\n## Yours\n'
    printf 'Anything below this heading is yours. ge never writes here.\n'
  } > "$nf_tmp" 2>/dev/null || { rm -f "$nf_tmp" 2>/dev/null; return 1; }
  # Nothing to keep on a first write, and this is one, so it is a no-op here on
  # every ordinary run. It stays because the mv below replaces whatever is at
  # that name, and a helper that keeps the mode only sometimes is a helper the
  # next caller has to check.
  ge_keep_mode "$1" "$nf_tmp"
  # 2>/dev/null on the move as well: a target the sync client has locked answers
  # with a raw rename line carrying the temp filename, and the caller's own
  # sentence then reads as a second, different problem.
  mv "$nf_tmp" "$1" 2>/dev/null || { rm -f "$nf_tmp" 2>/dev/null; return 1; }
  return 0
}

person_add() {
  A_kind=${1:-}
  case $A_kind in
    prospect|target) shift ;;
    # Two shapes, so neither can go on the recovery line: a founder pastes what
    # follows the arrow whole, and two commands with the word "or" between them
    # is not one command. The shapes are evidence, and the help page carries them
    # both with the flags as well.
    *) printf 'FAIL  ge person add needs prospect or target first.\n' >&2
       printf '      ge person add prospect <their email> "<their name>"\n' >&2
       printf '      ge person add target ig <their handle> "<their name>"\n' >&2
       printf '      → run: ge person help\n' >&2
       return 1 ;;
  esac

  A_key=''; A_name=''; A_status=''; A_source=manual; A_created=$(today_iso)
  A_email=''; A_platform=''; A_handle=''; A_plabel=''; A_company=''
  A_title=''; A_found_via=''; A_why_them=''; A_priority=''; A_note=''
  ad_note_text=''; ad_note_source=''

  if [ "$A_kind" = prospect ]; then
    A_status=candidate
    ad_raw=${1:-}; A_name=${2:-}
    [ -n "$ad_raw" ] || { person_fail 'ge person add prospect needs an email address.' \
        'ge person add prospect someone@example.com "Their Name"'; return 1; }
    [ $# -ge 2 ] && shift 2 || shift $#
    person_not_a_flag "$ad_raw" 'email address' || return 1
    case $ad_raw in
      *@*) ;;
      *) person_fail "\"$ad_raw\" is not an email address, and a prospect is keyed on their address." \
                     'ge person add prospect someone@example.com "Their Name"'
         return 1 ;;
    esac
    A_key=$(person_normkey "$ad_raw")
    A_email=$A_key
  else
    A_status=target
    A_platform=${1:-}; ad_raw=${2:-}; A_name=${3:-}
    [ -n "$ad_raw" ] || { person_fail 'ge person add target needs a platform and a handle.' \
        'ge person add target ig their.handle "Their Name"'; return 1; }
    [ $# -ge 3 ] && shift 3 || shift $#
    person_not_a_flag "$A_platform" 'platform' || return 1
    person_not_a_flag "$ad_raw" 'handle' || return 1
    A_platform=$(printf '%s' "$A_platform" | tr 'A-Z' 'a-z')
    if ! person_in_list "$A_platform" "$GE_P_PLATFORM"; then
      person_enum_fail 'ge person add target ig their.handle "Their Name"' platform "$A_platform" $GE_P_PLATFORM
      return 1
    fi
    A_handle=$(printf '%s' "$ad_raw" | tr 'A-Z' 'a-z')
    A_handle=${A_handle#@}
    A_key="$A_platform:$A_handle"
  fi

  [ -n "$A_name" ] || { person_fail 'a person needs a name, so you can read the file later.' \
      'the same command with the name in quotes at the end'; return 1; }
  person_not_a_flag "$A_name" 'name' || return 1

  while [ $# -gt 0 ]; do
    # A flag typed with nothing after it is caught here. Without this the shift
    # below is a fatal shell error on the founder floor, and a founder who
    # forgot a closing quote sees a shell message with no way out of it.
    case $1 in
      --*) [ $# -ge 2 ] || { person_fail "$1 needs a value after it." \
             "the same command with the value in quotes after $1"; return 1; }
           # And the value must not itself be an option. A founder who drops a
           # closing quote, or types two options in a row, otherwise has the
           # second one recorded as the first one's value: "--company" saved as
           # the source, which reads as real data and nobody ever spots it.
           case ${2:-} in
             --*) person_fail "$1 was given $2, which is another option rather than a value." \
                    "the same command with the value for $1 in quotes"; return 1 ;;
           esac ;;
    esac
    case $1 in
      --company)        A_company=${2:-}; shift 2 ;;
      --title)          A_title=${2:-}; shift 2 ;;
      --source)         A_source=${2:-}; shift 2 ;;
      --found-via)      A_found_via=${2:-}; shift 2 ;;
      --why-them)       A_why_them=${2:-}; shift 2 ;;
      --priority)       A_priority=${2:-}; shift 2 ;;
      --platform-label) A_plabel=${2:-}; shift 2 ;;
      --note)           ad_note_text=${2:-}; shift 2 ;;
      --note-source)    ad_note_source=${2:-}; shift 2 ;;
      *) person_fail "ge person add does not have a flag called $1." \
                     'ge person help' 'The help page lists the flags it does have.'
         return 1 ;;
    esac
  done

  # The key is in the list because it is founder text too: it is typed, it is
  # written into the file as a field, and a marker in it would be written down
  # with everything else.
  for ad_v in "$A_key" "$A_name" "$A_company" "$A_title" "$A_found_via" "$A_why_them" \
              "$ad_note_text" "$ad_note_source" "$A_plabel"; do
    person_value_ok "$ad_v" 'value' || return 1
  done

  person_in_list "$A_source" "$GE_P_SOURCE" || { person_enum_fail "the same command with --source manual" source "$A_source" $GE_P_SOURCE; return 1; }
  if [ -n "$A_priority" ]; then
    person_in_list "$A_priority" "$GE_P_PRIORITY" || { person_enum_fail "the same command with --priority 3" priority "$A_priority" $GE_P_PRIORITY; return 1; }
  fi
  if [ "$A_kind" = target ] && [ "$A_platform" = other ] && [ -z "$A_plabel" ]; then
    person_fail 'platform: other needs --platform-label, naming the real platform.' \
                'the same command with --platform-label "LinkedIn"'
    return 1
  fi
  if [ -n "$ad_note_text" ]; then
    if [ -n "$ad_note_source" ]; then
      A_note="- $A_created $ad_note_text (source: $ad_note_source)"
    else
      A_note="- $A_created $ad_note_text"
    fi
  fi

  ad_slug=$(person_slug "$A_key")
  [ -n "$ad_slug" ] || { person_fail "\"$A_key\" has nothing in it a filename can be made from." \
      'the same command with a real address or handle'; return 1; }

  # Was this folder still just the seed file? Asked before the write, answered after.
  ad_first=1
  for ad_f in "$GE_P_DIR"/*.md; do
    [ -e "$ad_f" ] || break
    case ${ad_f##*/} in README.md) continue ;; esac
    ad_first=0; break
  done

  ad_n=1; ad_note_line=''; ad_taken=''
  while [ "$ad_n" -le 9 ]; do
    if [ "$ad_n" -eq 1 ]; then ad_name=$ad_slug; else ad_name="$ad_slug-$ad_n"; fi
    ad_file="$GE_P_DIR/$ad_name.md"
    if [ ! -f "$ad_file" ]; then break; fi
    ad_have=$(person_get_field "$ad_file" key)
    if [ "$ad_have" = "$A_key" ]; then
      printf 'FAIL  %s is already there, at people/%s.md.\n' "$A_key" "$ad_name" >&2
      # A key is founder text too. A handle is not checked for spaces anywhere,
      # so "ig:my handle" is a key ge will build, and bare it names a person by
      # the first word alone.
      printf '      That prints what you already wrote about them.\n' >&2
      printf '      → run: ge person get %s\n' "$(ge_quote "$A_key")" >&2
      return 1
    fi
    [ "$ad_n" -eq 1 ] && ad_note_line="  note: $ad_name.md is already held by $ad_have"
    ad_taken="$ad_taken      $ad_name.md holds $ad_have$GE_NL"
    ad_n=$((ad_n + 1))
    ad_file=''
  done

  if [ -z "${ad_file:-}" ]; then
    printf 'FAIL  nine filenames derived from %s are already held by nine other people.\n' "$A_key" >&2
    printf '%s' "$ad_taken" >&2
    printf '      Look at those nine before you add a tenth.\n' >&2
    printf '      → run: ge person list\n' >&2
    return 1
  fi

  # Asked before anything is written. The loop above only proved there is no
  # ordinary FILE at that name. A folder answers -f the same way a free name
  # does, and the rename inside person_new_file then moved ge's new file INSIDE
  # that folder, came back 0, and ge printed "added people/....md" over a person
  # it had not written down anywhere a reader can find. Never report success
  # after failing to write.
  person_replaceable "$ad_file" || return 1

  person_new_file "$ad_file" || {
    person_fail "the file for $A_key could not be written." \
                "$(person_write_fix "$GE_P_DIR")" "$(person_write_why "$GE_P_DIR")"
    return 1
  }

  printf 'added people/%s.md  %s  %s  %s\n' "$ad_name" "$A_kind" "$A_status" "$A_key"
  [ -n "$ad_note_line" ] && printf '%s\n' "$ad_note_line"
  if [ "$ad_first" -eq 1 ]; then
    # SAID ONCE, ON THE FIRST PERSON, AND IT HAS TO BE TRUE WHEREVER IT IS READ.
    # It named shared drives and git, which are two things on a laptop and
    # neither of them is a thing in a browser. A founder reading a warning about
    # a risk that does not exist where they are learns to skip the next one, and
    # the next one might be about the risk that does. What is true on every
    # surface is the sentence underneath both: these are other people's details,
    # they arrived here for one purpose, and copying them anywhere else is the
    # move that ends badly. Pasting them into a document is the browser's
    # version of the same mistake, and this covers that too.
    printf '  this folder now holds real people'"'"'s details. Keep it to yourself and do not copy it anywhere else\n'
  fi
  [ "$A_kind" = prospect ] && person_sheet_stale
  return 0
}

# ---------------------------------------------------------------- set

person_set() {
  se_who=${1:-}; se_field=${2:-}
  [ -n "$se_who" ] && [ -n "$se_field" ] && [ $# -ge 3 ] || {
    person_fail 'ge person set needs who, which field, and the new value.' \
                'ge person set <who> <field> <value>' \
                'Put their address or handle in place of the first gap. ge person help lists the fields.'
    return 1
  }
  shift 2
  se_value=$1

  # Who, before anything about their fields. Every refusal below prints the
  # person back into a command to paste, and until this line has run ge has no
  # idea whether there is anybody by that name. A founder who types the name they
  # wrote down rather than the address they added, "Sam Carter" instead of
  # sam@northfield.io, used to be told that kind cannot be changed and handed
  # "ge person remove Sam Carter", which answered that there is nobody called Sam
  # Carter: a second refusal, further from the truth than the first. person_resolve
  # reads the name field now, so that line names somebody ge can find, and the
  # refusal for a name nobody in the folder has is the only one left.
  # person_purge and person_remove have always asked in this order.
  person_resolve "$se_who" || { person_no_such "$se_who"; return 2; }

  # One sentence per field. These three are fixed for three different reasons and
  # the shared sentence was true of only the first: it told a founder that created
  # is what the file is named from and what every command finds them by, which
  # they can see is not so, in the one verb whose refusals are otherwise exact.
  if person_in_list "$se_field" "$GE_P_IMMUTABLE"; then
    case $se_field in
      key)
        # The field named here follows the person's kind. It always said email,
        # and email belongs to a prospect: handed to a target, which is what a
        # B2C founder has and nothing else, ge refuses it as a field of the other
        # kind. That is half the room being sent to a command ge will not run.
        # The kind is read rather than assumed, and where it cannot be read ge
        # names neither field and offers the one line that works for both.
        printf 'FAIL  key cannot be changed. It is what the file is named from and what every other command finds them by.\n' >&2
        case $(person_get_field "$P_FILE" kind) in
          prospect)
            printf '      If the address is wrong, change the address you send to and leave the key alone.\n' >&2
            printf '      → run: ge person set %s email <the right address>\n' "$(ge_quote "$se_who")" >&2 ;;
          target)
            printf '      If the handle is wrong, change the handle you reach them at and leave the key alone.\n' >&2
            printf '      → run: ge person set %s handle <their handle>\n' "$(ge_quote "$se_who")" >&2 ;;
          *)
            printf '      Change the address or the handle you reach them at instead, and leave the key alone.\n' >&2
            printf '      That prints what is in their file now.\n' >&2
            printf '      → run: ge person get %s\n' "$(ge_quote "$se_who")" >&2 ;;
        esac ;;
      kind)
        printf 'FAIL  kind cannot be changed. It decides which statuses this person can have and which fields their file carries.\n' >&2
        printf '      A prospect is reached at an email address and a target at a platform and a handle, so the file would stop matching the name it is under.\n' >&2
        printf '      Remove them, then add them again as the other one.\n' >&2
        printf '      → run: ge person remove %s\n' "$(ge_quote "$se_who")" >&2 ;;
      created)
        printf 'FAIL  created cannot be changed. It records the day this file was made, which is not a fact about the person.\n' >&2
        printf '      If you meant the day you next want to reach them, that is follow_up_on.\n' >&2
        printf '      → run: ge person set %s follow_up_on 2026-09-25\n' "$(ge_quote "$se_who")" >&2 ;;
      *)
        printf 'FAIL  %s cannot be changed.\n' "$se_field" >&2
        printf '      That prints what is in their file now.\n' >&2
        printf '      → run: ge person get %s\n' "$(ge_quote "$se_who")" >&2 ;;
    esac
    return 1
  fi
  if ! person_in_list "$se_field" "$GE_P_FIELDS"; then
    printf 'FAIL  there is no field called %s, so nothing was written.\n' "$se_field" >&2
    printf '      The fields are: %s\n' "$GE_P_FIELDS" >&2
    # The value is quoted by ge_quote rather than wrapped in double quotes here.
    # It has not been through person_value_ok yet, so it can still hold a double
    # quote of its own, and one of those closes the pair early and hands the rest
    # of the founder's own text to the shell as something to run.
    printf '      → run: ge person set %s <one of those> %s\n' "$(ge_quote "$se_who")" "$(ge_quote "$se_value")" >&2
    return 1
  fi
  person_not_a_flag "$se_value" "$se_field" || return 1
  person_value_ok "$se_value" "$se_field" || return 1
  [ -n "$se_value" ] || { person_fail "$se_field cannot be empty. A field you do not have is a field that is not in the file." \
      "ge person set $(ge_quote "$se_who") $se_field \"<the value>\""; return 1; }

  person_require_valid "$P_FILE" || return 1

  se_kind=$(person_get_field "$P_FILE" kind)

  # A field belonging to the other kind. platform, handle and platform_label are
  # how a target is reached and email is how a prospect is reached, so a file
  # carrying both is one person in both tracks, which is the one thing the two
  # track rule forbids. It leaks too: ge person list --platform ig then answers
  # with prospects, on the sheet a B2C founder works down by hand. The status
  # enums were checked against kind from the first commit; these never were.
  case "$se_kind $se_field" in
    'prospect platform'|'prospect handle'|'prospect platform_label')
      printf 'FAIL  %s belongs to a target, and %s is a prospect.\n' "$se_field" "$se_who" >&2
      printf '      A prospect is reached at an email address and a target at a platform and a handle. Nobody is both.\n' >&2
      printf '      If you meant to add them as a target, this is the shape.\n' >&2
      printf '      → run: ge person add target ig <their handle> "<their name>"\n' >&2
      return 1 ;;
    'target email')
      printf 'FAIL  email belongs to a prospect, and %s is a target.\n' "$se_who" >&2
      printf '      A target is reached at a platform and a handle and a prospect at an email address. Nobody is both.\n' >&2
      printf '      If you meant to add them as a prospect, this is the shape.\n' >&2
      printf '      → run: ge person add prospect <their address> "<their name>"\n' >&2
      return 1 ;;
  esac

  case $se_field in
    status)
      se_allowed=$(person_status_enum "$se_kind")
      if ! person_in_list "$se_value" "$se_allowed"; then
        printf 'FAIL  "%s" is not a status for a %s.\n' "$se_value" "$se_kind" >&2
        printf '      The six that work are: %s\n' "$se_allowed" >&2
        printf '      → run: ge person set %s status <one of those six>\n' "$(ge_quote "$se_who")" >&2
        return 1
      fi ;;
    platform)     person_in_list "$se_value" "$GE_P_PLATFORM" || { person_enum_fail "ge person set $(ge_quote "$se_who") platform ig" platform "$se_value" $GE_P_PLATFORM; return 1; } ;;
    source)       person_in_list "$se_value" "$GE_P_SOURCE" || { person_enum_fail "ge person set $(ge_quote "$se_who") source manual" source "$se_value" $GE_P_SOURCE; return 1; } ;;
    priority)     person_in_list "$se_value" "$GE_P_PRIORITY" || { person_enum_fail "ge person set $(ge_quote "$se_who") priority 3" priority "$se_value" $GE_P_PRIORITY; return 1; } ;;
    follow_up_on)
      # Free text was accepted here and then dropped, without a word, by the one
      # command that reads it: ge person list --needs followup. The founder was
      # told it was set, the follow-up list never named that person again, and
      # nothing anywhere said why.
      person_date_ok "$se_value" || {
        printf 'FAIL  "%s" is not a date ge can read.\n' "$se_value" >&2
        printf '      A date here is the year, the month and the day, in that order, like 2026-09-25.\n' >&2
        printf '      → run: ge person set %s follow_up_on 2026-09-25\n' "$(ge_quote "$se_who")" >&2
        return 1
      } ;;
    email_status)
      # Which Apollo field these read from is unknown until spike S-07 lands, and
      # a mapping nobody has confirmed would be a fact about a person we invented.
      if [ "$se_value" != unverified ]; then
        printf 'FAIL  email_status can only be unverified for now.\n' >&2
        printf '      Spike S-07 decides which Apollo field the other three read from, and until it lands ge will not write a value nobody has checked.\n' >&2
        printf '      → run: ge person set %s email_status unverified\n' "$(ge_quote "$se_who")" >&2
        return 1
      fi ;;
  esac

  se_before=$(person_get_field "$P_FILE" "$se_field")
  # Asked before the snapshot rather than after it, for the reason
  # person_block_ready gives above: a write ge is going to refuse anyway must
  # not spend one of the twenty backup slots first, and a founder retrying a
  # command that can never work would spend the rest of them on copies of the
  # same file.
  person_replaceable "$P_FILE" || return 1
  person_snapshot "people/$P_SLUG.md" || return 1
  person_set_field "$P_FILE" "$se_field" "$se_value" || {
    person_fail "people/$P_SLUG.md could not be written, so nothing changed." \
                "$(person_write_fix "$GE_P_DIR")" "$(person_write_why "$GE_P_DIR")"
    return 1
  }
  if [ -n "$se_before" ]; then
    printf 'set people/%s.md  %s  %s -> %s\n' "$P_SLUG" "$se_field" "$se_before" "$se_value"
  else
    printf 'set people/%s.md  %s  %s\n' "$P_SLUG" "$se_field" "$se_value"
  fi
  # The five fields that are columns in outreach-firstlines.csv. Changing any of
  # them, status cut most of all, leaves the exported sheet saying something else.
  if [ "$se_kind" = prospect ]; then
    case $se_field in
      status|email|first_name|name|company) person_sheet_stale ;;
    esac
  fi
  return 0
}

# ---------------------------------------------------------------- get

person_get() {
  ge_who=${1:-}
  [ -n "$ge_who" ] || { person_fail 'ge person get needs to know who.' \
      'ge person get <who>' \
      'Put their address, their handle, or the name you wrote down in place of the gap.'; return 1; }
  person_resolve "$ge_who" || { person_no_such "$ge_who"; return 2; }

  ge_field=${2:-}
  if [ -n "$ge_field" ]; then
    person_get_values "$P_FILE" "$ge_field"
  else
    # Asked before the read, not after it. A sentence of our own is owed here,
    # because a file that is there but cannot be read otherwise answers with the
    # reader's own error, naming this file and a line number in it, and says
    # nothing about what to do next. But it cannot hang off the reader's exit
    # code: a founder who pipes this into head or into more closes the pipe
    # early, which ends the reader too, and they would be told their file could
    # not be read every time they looked at the top of it.
    if [ ! -r "$P_FILE" ]; then
      # The file, named, and the chmod that opens it. Sending the founder to the
      # doctor here only had them run one command to be told the next one, and ge
      # is holding the path already. It is the file every time: getting this far
      # means the folder could be walked and the file found in it, so the only
      # thing left refusing is the file's own permission.
      person_fail "people/$P_SLUG.md is there, but it could not be read." \
                  "chmod u+r $(ge_quote "$P_FILE")" \
                  'That puts the read permission back. Then run the same command again.'
      return 1
    fi
    person_show "$P_FILE" 2>/dev/null
  fi

  # Surface, never hide: the person is printed first, and the faults are named
  # underneath. The exit is 1 all the same, per section 09, because a skill has
  # to tell a sound file from a damaged one without reading the words, and every
  # other verb already answers 1 on this file. Printing the person and returning
  # 0 told a skill the file was fine and it carried on with whatever it had
  # parsed out of a file the founder had broken.
  ge_out=$(person_validate "$P_FILE") || {
    printf 'WARN  people/%s.md is malformed. What it holds was read out all the same.\n' "$P_SLUG" >&2
    printf '%s\n' "$ge_out" | person_faults_plain >&2
    printf '      That prints the file, so you can fix those lines in your editor.\n' >&2
    printf '      → run: ge person get %s\n' "$(ge_quote "$P_SLUG")" >&2
    return 1
  }
  return 0
}

# ---------------------------------------------------------------- list

person_first_name_fallback() {        # <name>
  ff_v=$(printf '%s' "$1" | awk '{print $1}')
  ff_v=${ff_v%,}
  ff_v=${ff_v%.}
  printf '%s' "$ff_v"
}

# The shape is checked before the dashes come out, not after. 2026-9-1 stripped
# to 202691 and compared against 20260827 as a number, which made a date eight
# months away read as due today.
person_iso_number() {                 # <YYYY-MM-DD> -> 20260919, or nothing
  person_date_ok "$1" || return 1
  printf '%s' "$1" | tr -d '-'
}

# Every key that appears in more than one file. Collected once by the two readers
# that see the whole folder, so a duplicate is reported rather than half read.
person_dupkeys() {                    # <outfile>
  true 2>/dev/null > "$1" || return 1
  for dk_f in "$GE_P_DIR"/*.md; do
    [ -e "$dk_f" ] || break
    case ${dk_f##*/} in README.md) continue ;; esac
    dk_k=$(person_get_field "$dk_f" key)
    [ -n "$dk_k" ] && printf '%s\n' "$dk_k"
  done | LC_ALL=C sort | LC_ALL=C uniq -d > "$1"
  return 0
}

person_list() {
  li_kind=''; li_status=''; li_platform=''; li_source=''; li_priority=''
  li_needs=''; li_long=0
  while [ $# -gt 0 ]; do
    case $1 in
      --long) ;;
      --*) [ $# -ge 2 ] || { person_fail "$1 needs a value after it." \
             "ge person list $1 <a value>"; return 1; }
           # And the value must not itself be an option. A founder who drops a
           # closing quote, or types two options in a row, otherwise has the
           # second one recorded as the first one's value: "--company" saved as
           # the source, which reads as real data and nobody ever spots it.
           case ${2:-} in
             --*) person_fail "$1 was given $2, which is another option rather than a value." \
                    "the same command with the value for $1 in quotes"; return 1 ;;
           esac ;;
    esac
    case $1 in
      --kind)     li_kind=${2:-}; shift 2 ;;
      --status)   li_status=${2:-}; shift 2 ;;
      --platform) li_platform=${2:-}; shift 2 ;;
      --source)   li_source=${2:-}; shift 2 ;;
      --priority) li_priority=${2:-}; shift 2 ;;
      --needs)    li_needs=${2:-}; shift 2 ;;
      --long)     li_long=1; shift ;;
      *) person_fail "ge person list does not have a flag called $1." \
                     'ge person help' 'The help page lists the flags it does have.'
         return 1 ;;
    esac
  done
  # Every filter is checked, not just --needs. A count like
  # ge person list --kind prospect --status cut | wc -l is what the gate and the
  # status skill read, and a plural, a capital letter or a status from the other
  # kind used to come back as no rows and exit 0, which reads as "you have
  # nobody" rather than "that is not one of the values". The two are the same
  # answer and they mean opposite things.
  if [ -n "$li_needs" ] && ! person_in_list "$li_needs" 'opener followup touch'; then
    person_fail "--needs takes opener, followup or touch, not $li_needs." \
                'ge person list --needs opener'
    return 1
  fi
  if [ -n "$li_kind" ] && ! person_in_list "$li_kind" 'prospect target'; then
    person_enum_fail 'ge person list --kind prospect' kind "$li_kind" prospect target
    return 1
  fi
  if [ -n "$li_status" ] \
     && ! person_in_list "$li_status" "$GE_P_ST_PROSPECT" \
     && ! person_in_list "$li_status" "$GE_P_ST_TARGET"; then
    printf 'FAIL  "%s" is not a status.\n' "$li_status" >&2
    printf '      For a prospect: %s\n' "$GE_P_ST_PROSPECT" >&2
    printf '      For a target: %s\n' "$GE_P_ST_TARGET" >&2
    printf '      → run: ge person list --status candidate\n' >&2
    return 1
  fi
  if [ -n "$li_platform" ] && ! person_in_list "$li_platform" "$GE_P_PLATFORM"; then
    person_enum_fail 'ge person list --platform ig' platform "$li_platform" $GE_P_PLATFORM
    return 1
  fi
  if [ -n "$li_source" ] && ! person_in_list "$li_source" "$GE_P_SOURCE"; then
    person_enum_fail 'ge person list --source manual' source "$li_source" $GE_P_SOURCE
    return 1
  fi
  if [ -n "$li_priority" ] && ! person_in_list "$li_priority" "$GE_P_PRIORITY"; then
    person_enum_fail 'ge person list --priority 3' priority "$li_priority" $GE_P_PRIORITY
    return 1
  fi

  # Asked after the flags, because a flag that is not one is still the first
  # thing to say, and before any of the work below. Without it a folder a sync
  # client had shut for a moment answered the walk with no files, and this told
  # a founder with sixty prospects in it that growth-engine/people/ is empty.
  # A check may not claim more than it examined, and this one had examined
  # nothing at all.
  person_folder_readable 'nobody could be listed' \
    'Everybody in it is still there. Nothing here can see them while it is shut.' \
    || return 1
  person_state_writable || return 1
  li_tmp="$GE_P_HOME/.state/ge-person-list.$$"
  li_dup="$GE_P_HOME/.state/ge-person-dup.$$"
  li_pairs="$GE_P_HOME/.state/ge-person-pairs.$$"
  li_late="$GE_P_HOME/.state/ge-person-late.$$"
  li_bad="$GE_P_HOME/.state/ge-person-bad.$$"
  li_live="$GE_P_HOME/.state/ge-person-live.$$"
  # person_state_writable has already asked whether .state can be written, so a
  # failure here is the folder changing underneath us mid run. Rare, and a silent
  # return leaves the founder looking at nothing at all and no way to tell that
  # from an empty folder.
  if ! true 2>/dev/null > "$li_tmp" \
     || ! true 2>/dev/null > "$li_pairs" \
     || ! true 2>/dev/null > "$li_late" \
     || ! true 2>/dev/null > "$li_bad" \
     || ! true 2>/dev/null > "$li_live" \
     || ! person_dupkeys "$li_dup"; then
    rm -f "$li_tmp" "$li_pairs" "$li_late" "$li_bad" "$li_live" "$li_dup" 2>/dev/null
    person_fail 'the .state folder inside growth-engine stopped being writable part way through, so the list was not finished.' \
                "$(person_write_fix "$GE_P_HOME/.state")" "$(person_write_why "$GE_P_HOME/.state")"
    return 1
  fi
  li_today=$(person_iso_number "$(today_iso)")
  # Counted, because "you have nobody" and "your filter matched nobody" used to
  # be the same answer: no rows and exit 0. They mean opposite things and a
  # founder acts differently on each.
  li_seen=0; li_broken=0; li_firstbad=''

  # The filters in force, in the founder's own words, for the sentence that says
  # nothing matched them. Built from the values after they were checked, so
  # nothing unchecked is ever read back out.
  li_flags=''
  [ -n "$li_kind" ]     && li_flags="$li_flags --kind $li_kind"
  [ -n "$li_status" ]   && li_flags="$li_flags --status $li_status"
  [ -n "$li_platform" ] && li_flags="$li_flags --platform $li_platform"
  [ -n "$li_source" ]   && li_flags="$li_flags --source $li_source"
  [ -n "$li_priority" ] && li_flags="$li_flags --priority $li_priority"
  [ -n "$li_needs" ]    && li_flags="$li_flags --needs $li_needs"
  li_flags=${li_flags# }

  for li_f in "$GE_P_DIR"/*.md; do
    [ -e "$li_f" ] || break
    case ${li_f##*/} in README.md) continue ;; esac
    li_slug=${li_f##*/}; li_slug=${li_slug%.md}
    li_seen=$((li_seen + 1))

    li_faults=$(person_validate "$li_f")
    li_rc=$?
    li_key=$(person_get_field "$li_f" key)
    if [ -n "$li_key" ] && [ -s "$li_dup" ] && grep -F -x -q -- "$li_key" "$li_dup"; then
      li_faults="DUPKEY:file	the key $li_key is in another file as well$GE_NL$li_faults"
      li_rc=1
    fi
    if [ "$li_rc" -ne 0 ]; then
      # A malformed row ignores every filter. The fields a filter reads are the
      # fields that cannot be trusted in a file that failed to parse.
      #
      # The two founder-facing columns used to carry the parser's own tokens:
      # "BADLINE:line 8" in the status column and, where a marker line had been
      # deleted, "HALFMARKED:file", with the filename slug standing in for the
      # person's name. A colon-tagged token is not something anybody can act on.
      # So the column says where the trouble is, the name column says who this
      # is, and the reason itself is a sentence printed under the table.
      li_broken=1
      li_first=$(printf '%s\n' "$li_faults" | sed -n '1p')
      # The recovery under the table opens one of these files, so it may only
      # ever name one the founder can actually open. A file this computer will
      # not let ge read is not one of those, and sending them to look at it is a
      # way out that does not go anywhere.
      case $li_first in
        UNREADABLE:*) ;;
        *) [ -n "$li_firstbad" ] || li_firstbad=$li_slug ;;
      esac
      li_who=$(person_get_field "$li_f" name)
      [ -n "$li_who" ] || li_who=$li_slug
      printf '%-9s %-15s %s %s %s\n' MALFORMED "$(person_fault_where "$li_first")" \
        "$(person_pad "$li_slug" 30)" "$(person_pad "$li_who" 17)" "people/$li_slug.md" >> "$li_tmp"
      printf '  %s\n' "$li_slug" >> "$li_bad"
      printf '%s\n' "$li_faults" | person_faults_plain '    ' >> "$li_bad"
      continue
    fi

    person_scan "$li_f"

    # Collected before the filters, because who belongs on the outreach sheet is
    # not a question about what this run was asked to show. Same two rules the
    # export itself uses: prospects, and not the ones that were cut.
    if [ "$P_kind" = prospect ] && [ "$P_status" != cut ] && [ -n "$P_email" ]; then
      printf '%s\n' "$P_email" >> "$li_live"
    fi

    [ -n "$li_kind" ] && [ "$li_kind" != "$P_kind" ] && continue
    [ -n "$li_status" ] && [ "$li_status" != "$P_status" ] && continue
    [ -n "$li_platform" ] && [ "$li_platform" != "$P_platform" ] && continue
    [ -n "$li_source" ] && [ "$li_source" != "$P_source" ] && continue
    if [ -n "$li_priority" ]; then
      li_p=$P_priority
      [ -n "$li_p" ] || li_p=3
      [ "$li_priority" != "$li_p" ] && continue
    fi

    li_touch=$(block_read "$li_f" TOUCH 2>/dev/null | grep '^- ' | sed -n '$p')
    li_opencount=$(person_block_lines "$li_f" OPENER)
    case $li_needs in
      opener)   [ "$li_opencount" -eq 0 ] || continue ;;
      touch)    [ -z "$li_touch" ] || continue ;;
      followup)
        # A date this cannot read is collected rather than dropped. The row is
        # still not in the list, because there is no day to compare, but the
        # founder is told which people those are and what the date should look
        # like. Silently skipping them is how a follow-up is missed for ever.
        li_due=$(person_iso_number "$P_follow_up_on") || {
          [ -n "$P_follow_up_on" ] && printf '%s\t%s\n' "$li_slug" "$P_follow_up_on" >> "$li_late"
          continue
        }
        [ -n "$li_today" ] || continue
        [ "$li_due" -le "$li_today" ] || continue ;;
    esac

    if [ "$P_kind" = target ]; then li_tail=$P_platform; else li_tail=$P_company; fi
    # person_pad, not %-17s, on the two columns that hold a founder's own words.
    # LC_ALL=C makes printf pad by bytes, so one accented letter in a name pulled
    # every column after it left and the table stopped being a table.
    if [ "$li_long" -eq 1 ]; then
      li_when=$(printf '%s' "$li_touch" | awk '{print $2}')
      li_dir=$(printf '%s' "$li_touch" | awk '{print $4}' | tr -d ':')
      [ -n "$li_when" ] || li_when='-'
      [ -n "$li_dir" ] || li_dir='-'
      if [ "$li_opencount" -eq 0 ]; then li_op='no opener'; else li_op='opener'; fi
      printf '%-9s %-15s %-30s %s %s %-11s %-4s %s\n' \
        "$P_kind" "$P_status" "$li_slug" "$(person_pad "$P_name" 17)" \
        "$(person_pad "$li_tail" 24)" "$li_when" "$li_dir" "$li_op" >> "$li_tmp"
    else
      printf '%-9s %-15s %-30s %s %s\n' \
        "$P_kind" "$P_status" "$li_slug" "$(person_pad "$P_name" 17)" "$li_tail" >> "$li_tmp"
    fi

    # For the advisory only, and only over the rows this run is showing. An
    # Apollo list produces near duplicates an exact key cannot catch, and the
    # whole response is to show the founder and let the founder decide. Nothing
    # is ever matched at write time, because that is how a fuzzy resolver gets in.
    if [ -n "$P_email" ]; then
      li_sur=$(printf '%s' "$P_name" | awk '{print tolower($NF)}' | tr -d '.,')
      li_dom=${P_email#*@}
      [ -n "$li_sur" ] && printf '%s\t%s\t%s\n' "$P_email" "$li_sur" "$li_dom" >> "$li_pairs"
    fi
  done

  LC_ALL=C sort "$li_tmp"

  # Everything that is not a person row goes to stderr, so a count of the rows
  # stays a count of the people.

  # Why each malformed row is malformed, in the same plain sentences ge person
  # note and ge person touch print, under the person they belong to.
  if [ -s "$li_bad" ]; then
    printf 'these files could not be read as a person, so their rows carry the name and nothing else:\n' >&2
    cat "$li_bad" >&2 2>/dev/null
    # Said here rather than in the sheet check further down, because the sheet
    # check goes quiet while this is true and a founder should not have to work
    # out why. ge person export firstlines refuses while any one person file is
    # malformed, on purpose: an export that quietly leaves somebody out is worse
    # than no export at all.
    [ -f "$GE_P_HOME/outreach-firstlines.csv" ] && \
      printf '  growth-engine/outreach-firstlines.csv cannot be written again until that is fixed.\n' >&2
    if [ -n "$li_firstbad" ]; then
      # Quoted for the same reason as person_require_valid: this slug is a
      # filename read off disk, so it can hold a space, and a file copied in by
      # hand is the one that lands here.
      printf '  That prints the first of them, so you can fix those lines.\n' >&2
      printf '  → run: ge person get %s\n' "$(ge_quote "$li_firstbad")" >&2
    else
      # A description of a thing to go and look at, and it stays one. Reaching
      # here means rows were bad and not one of them carried a name, so there is
      # no file to open and no folder to unlock: the folder was read, or the
      # rows would not exist. The doctor is the only thing ge can honestly name.
      printf '  ge check reads the folder and says whether it can be read at all.\n' >&2
      printf '  → run: ge check\n' >&2
    fi
  fi

  if [ -s "$li_pairs" ]; then
    li_hits=$(LC_ALL=C sort -k2,3 "$li_pairs" | awk -F'\t' '
      { k = $2 "@" $3
        if (k in seen) { print seen[k] "\tand\t" $1 } else { seen[k] = $1 } }')
    if [ -n "$li_hits" ]; then
      printf 'possible duplicates, decide yourself:\n' >&2
      printf '%s\n' "$li_hits" | while IFS='	' read -r li_a li_and li_b; do
        printf '  %s %s %s\n' "$li_a" "$li_and" "$li_b" >&2
        printf '  Look at the second one before you decide.\n' >&2
        printf '  → run: ge person get %s\n' "$(ge_quote "$li_b")" >&2
      done
    fi
  fi

  if [ -s "$li_late" ]; then
    printf 'not in this list, because the date in follow_up_on is not one ge can read:\n' >&2
    while IFS=$GE_TAB read -r la_slug la_val || [ -n "$la_slug" ]; do
      printf '  %s   follow_up_on says %s\n' "$la_slug" "$la_val" >&2
      printf '  → run: ge person set %s follow_up_on 2026-09-25\n' "$(ge_quote "$la_slug")" >&2
    done < "$li_late"
  fi

  # No rows at all used to be zero bytes and exit 0, whether the folder held
  # nobody or the filter matched nobody. A founder reads silence as "I have no
  # prospects" and stops, when what happened was a capital letter in a status.
  # Both sentences go to stderr, so a count of the rows is still a count of the
  # people. The exit stays 0: a report that reported is 0, and section 09 counts
  # people with ge person list | wc -l.
  li_rows=$(grep -c . "$li_tmp" 2>/dev/null || true)
  [ -n "$li_rows" ] || li_rows=0
  if [ "$li_rows" -eq 0 ]; then
    if [ "$li_seen" -eq 0 ]; then
      # Not "nobody yet": this is also what a founder sees the day they remove
      # the last person, and being told they have not started is wrong then.
      printf 'growth-engine/people/ is empty, so there is nobody to list.\n' >&2
      # The gaps are in angle brackets and the founder fills them in. It named
      # someone@example.com and "Their Name" before, which runs, and which puts
      # a person nobody has ever met into the folder this file exists to keep
      # true. A gap they can see beats a value that looks real.
      printf '  Put their own address and name in place of the two gaps.\n' >&2
      printf '  → run: ge person add prospect <their email> "<their name>"\n' >&2
    else
      # Reachable only with a filter: with none, every file is a row, sound or
      # not, so no rows and files present cannot happen without one.
      if [ "$li_seen" -eq 1 ]; then li_have='1 person'; else li_have="$li_seen people"; fi
      printf 'nobody here matches %s. growth-engine/people/ holds %s.\n' "$li_flags" "$li_have" >&2
      printf '  With no filter on it, the list names everybody you have.\n' >&2
      printf '  → run: ge person list\n' >&2
    fi
  fi

  # The membership half of "is the exported sheet still true", skipped while a
  # file is unreadable, because the fix it would offer refuses in that state.
  [ "$li_broken" -eq 0 ] && person_sheet_diff "$li_live"

  rm -f "$li_tmp" "$li_dup" "$li_pairs" "$li_late" "$li_bad" "$li_live" 2>/dev/null
  return 0
}

# ---------------------------------------------------------------- note, touch

person_note() {
  no_who=${1:-}; no_text=${2:-}
  [ -n "$no_who" ] && [ $# -ge 2 ] || {
    person_fail 'ge person note needs who, and the note.' \
                'ge person note <who> "<what you saw>" --source "<where you saw it>"' \
                'Put their address or handle in place of the first gap. The source is optional.'
    return 1
  }
  shift 2
  no_source=''
  while [ $# -gt 0 ]; do
    case $1 in
      --*) [ $# -ge 2 ] || { person_fail "$1 needs a value after it." \
             "the same command with the value in quotes after $1"; return 1; }
           # And the value must not itself be an option. A founder who drops a
           # closing quote, or types two options in a row, otherwise has the
           # second one recorded as the first one's value: "--company" saved as
           # the source, which reads as real data and nobody ever spots it.
           case ${2:-} in
             --*) person_fail "$1 was given $2, which is another option rather than a value." \
                    "the same command with the value for $1 in quotes"; return 1 ;;
           esac ;;
    esac
    case $1 in
      --source) no_source=${2:-}; shift 2 ;;
      *) person_fail "ge person note does not have a flag called $1." \
                     'ge person note <who> "<what you saw>" --source "<where you saw it>"' \
                     '--source is the only flag it has. Put their address or handle in place of the first gap.'
         return 1 ;;
    esac
  done
  # Who, before anything about the note, for the reason set out in person_set.
  person_resolve "$no_who" || { person_no_such "$no_who"; return 2; }

  person_not_a_flag "$no_text" 'note' || return 1
  person_value_ok "$no_text" 'note' || return 1
  person_value_ok "$no_source" 'source' || return 1
  # The person the founder typed, not a stand-in address. What is missing here is
  # the note, not the person, and naming somebody who is not in the folder turns
  # one refusal into two.
  [ -n "$no_text" ] || { person_fail 'an empty note records nothing.' \
      "ge person note $(ge_quote "$no_who") \"what you saw\""; return 1; }

  person_require_valid "$P_FILE" || return 1

  if [ -n "$no_source" ]; then
    no_line="- $(today_iso) $no_text (source: $no_source)"
  else
    no_line="- $(today_iso) $no_text"
  fi
  person_block_ready "$P_FILE" NOTES || return 1
  person_snapshot "people/$P_SLUG.md" || return 1
  person_block_append "$P_FILE" NOTES "$no_line" || return 1
  # The note is read back so the founder can see what was recorded. A note pasted
  # out of a document can be a hundred thousand characters, and echoing that fills
  # the session and pushes everything that came before it off the screen.
  if [ "${#no_text}" -le 72 ]; then
    printf 'noted people/%s.md  %s\n' "$P_SLUG" "$no_text"
  else
    printf 'noted people/%s.md  (a long note, so it is not read back here)\n' "$P_SLUG"
  fi
  return 0
}

person_touch() {
  to_who=${1:-}; to_ch=${2:-}; to_dir=${3:-}; to_text=${4:-}
  [ -n "$to_who" ] && [ $# -ge 4 ] || {
    person_fail 'ge person touch needs who, the channel, the direction, and what happened.' \
                'ge person touch <who> email out "<what happened>"' \
                'Put their address or handle in place of the gap. in or out says which way it went.'
    return 1
  }
  # Who, before anything about the channel, for the reason set out in person_set:
  # every refusal below hands the person back inside a command to paste, and a
  # person ge has not looked for is a person that command cannot find.
  person_resolve "$to_who" || { person_no_such "$to_who"; return 2; }

  # Both the person and the channel are quoted. Whatever the founder typed for
  # the channel is being handed straight back to them, and a shell splits a
  # two word one exactly as it splits a two word name.
  person_in_list "$to_ch" "$GE_P_CHANNEL" || { person_enum_fail "ge person touch $(ge_quote "$to_who") email out \"what happened\"" channel "$to_ch" $GE_P_CHANNEL; return 1; }
  person_in_list "$to_dir" "$GE_P_DIRECTION" || { person_enum_fail "ge person touch $(ge_quote "$to_who") $(ge_quote "$to_ch") out \"what happened\"" direction "$to_dir" $GE_P_DIRECTION; return 1; }
  person_not_a_flag "$to_text" 'text' || return 1
  person_value_ok "$to_text" 'touch' || return 1
  # As in person_note: what is missing is the text, and ge is holding the person.
  [ -n "$to_text" ] || { person_fail 'a touch with no text records nothing.' \
      "ge person touch $(ge_quote "$to_who") $(ge_quote "$to_ch") $(ge_quote "$to_dir") \"sent the opener\""; return 1; }

  person_require_valid "$P_FILE" || return 1

  person_block_ready "$P_FILE" TOUCH || return 1
  person_snapshot "people/$P_SLUG.md" || return 1
  person_block_append "$P_FILE" TOUCH "- $(today_iso) $to_ch $to_dir: $to_text" || return 1

  # The one narrow advance. Recording an outbound DM to a target is the send, so
  # writing it twice is bookkeeping the founder pays for on the busiest afternoon.
  # It only moves forward, and only from the two states where the meaning is plain.
  to_kind=$(person_get_field "$P_FILE" kind)
  to_was=$(person_get_field "$P_FILE" status)
  if [ "$to_kind" = target ] && [ "$to_ch" = dm ] && [ "$to_dir" = out ]; then
    if [ "$to_was" = target ] || [ "$to_was" = opener_written ]; then
      person_set_field "$P_FILE" status sent || {
        person_fail "the touch was written, but the status could not be." \
                    "ge person set $(ge_quote "$to_who") status sent"
        return 1
      }
      printf 'touched people/%s.md  %s %s    status  %s -> sent\n' "$P_SLUG" "$to_ch" "$to_dir" "$to_was"
      return 0
    fi
  fi
  printf 'touched people/%s.md  %s %s\n' "$P_SLUG" "$to_ch" "$to_dir"
  return 0
}

# ---------------------------------------------------------------- opener

person_opener() {
  op_who=${1:-}; op_src=${2:-}
  [ -n "$op_who" ] && [ -n "$op_src" ] || {
    # The gap is in angle brackets, because ge has nobody in hand here: the
    # founder typed neither. It named someone@example.com, which is not a person
    # in anybody's folder, so pasting that line was a second refusal.
    person_fail 'ge person opener needs who, and where the text comes from.' \
                'ge person opener <who> -' \
                'Put their address or handle in place of the gap, then type the opening line and press ctrl-d.'
    return 1
  }
  shift
  # Who, before anything about where the text comes from, for the reason set out
  # in person_set: the three refusals below hand the person back in a command.
  person_resolve "$op_who" || { person_no_such "$op_who"; return 2; }
  op_path=''
  case $1 in
    --file) op_path=${2:-}
            # The person the founder typed, and the form that needs no path at
            # all. This named someone@example.com and a file called opener.txt:
            # the wrong person, and a file that is not on their machine either,
            # so pasting it was two refusals rather than a way out. Typing the
            # line in is the one route ge can be sure works from here.
            [ -n "$op_path" ] || { person_fail 'ge person opener --file needs a path.' \
                "ge person opener $(ge_quote "$op_who") -" \
                'Then type the opening line and press ctrl-d.'; return 1; }
            # The person the founder typed, and a command they can paste. This
            # named someone@example.com and a bracketed placeholder, so it failed
            # twice over: the wrong person, and nothing to type in the brackets.
            [ -f "$op_path" ] || { person_fail "there is no file at $op_path." \
                "ge person opener $(ge_quote "$op_who") -" \
                'Then type the opening line and press ctrl-d.'; return 1; } ;;
    -) ;;
    *) person_fail "ge person opener reads from a file or from stdin, not from $1." \
                   "ge person opener $(ge_quote "$op_who") -" \
                   'Then type the opening line and press ctrl-d.'
       return 1 ;;
  esac

  person_require_valid "$P_FILE" || return 1

  op_body="$P_FILE.ge-open.$$"
  # The same question person_block_append asks, and for the same two reasons: the
  # read only folder, and dash ending the shell on a special built-in.
  true 2>/dev/null > "$op_body" || {
    person_fail "people/$P_SLUG.md could not be written, so nothing changed." \
                "$(person_write_fix "$GE_P_DIR")" "$(person_write_why "$GE_P_DIR")"
    return 1
  }
  if [ -n "$op_path" ]; then
    tr -d '\r' < "$op_path" > "$op_body"
  else
    tr -d '\r' > "$op_body"
  fi || {
    rm -f "$op_body"
    person_fail "the opener could not be read, so nothing was written." \
                "ge person opener $(ge_quote "$op_who") -" \
                'Then type the opening line and press ctrl-d.'
    return 1
  }
  op_lines=$(grep -c . "$op_body" || true)
  if [ "$op_lines" -eq 0 ]; then
    rm -f "$op_body"
    person_fail 'an empty opener says nothing, so nothing was written.' \
                "ge person opener $(ge_quote "$op_who") -" \
                'Then type the opening line and press ctrl-d.'
    return 1
  fi

  # An opener is the line or two you send first. --file pointed at the wrong file,
  # a content plan or a brain dump, went in whole and came back out again inside
  # dm-openers.md, a quarter of a megabyte reported as a success. Both sizes are
  # named because the two wrong files look different: one is thousands of lines,
  # the other is one line thousands of characters long.
  op_bytes=$(wc -c < "$op_body" 2>/dev/null | tr -d ' ')
  [ -n "$op_bytes" ] || op_bytes=0
  if [ "$op_lines" -gt 12 ] || [ "$op_bytes" -gt 2000 ]; then
    rm -f "$op_body"
    if [ "$op_lines" -gt 12 ]; then
      printf 'FAIL  that opener is %s lines, and an opener is the line or two you send first.\n' "$op_lines" >&2
    else
      printf 'FAIL  that opener is longer than a page, and an opener is the line or two you send first.\n' >&2
    fi
    printf '      Nothing was written. Something that long is usually the wrong file.\n' >&2
    printf '      Then type the opening line and press ctrl-d.\n' >&2
    printf '      → run: ge person opener %s -\n' "$(ge_quote "$op_who")" >&2
    return 1
  fi

  # Read before it is written, and refused rather than repaired. A marker inside
  # the body ends the OPENER block early, and a person file whose markers no
  # longer pair can never be written to again. It does not stop at this founder
  # either: ge person export openers refuses while any one file is malformed, so
  # one pasted line takes every other target's opener with it.
  op_hit=$(grep -n -F -e '<!-- GE:' "$op_body" | sed -n '1p' | cut -d: -f1)
  if [ -n "$op_hit" ]; then
    rm -f "$op_body"
    printf 'FAIL  line %s of the opener carries "<!-- GE:", which is how ge marks the parts of a file it owns.\n' "$op_hit" >&2
    printf '      Nothing was written. Left in, that line would break this person and stop ge person export openers for all of them.\n' >&2
    if [ -n "$op_path" ]; then
      # Both quoted. The path is the founder's own, so it is as likely as not to
      # sit under a folder named after their business and carry a space, and
      # bare it split into three arguments and named a file that is not there.
      printf '      Run that once line %s of that file has the text taken out.\n' "$op_hit" >&2
      printf '      → run: ge person opener %s --file %s\n' \
        "$(ge_quote "$op_who")" "$(ge_quote "$op_path")" >&2
    else
      printf '      Type it again, without that text on line %s.\n' "$op_hit" >&2
      printf '      → run: ge person opener %s -\n' "$(ge_quote "$op_who")" >&2
    fi
    return 1
  fi
  op_kind=$(person_get_field "$P_FILE" kind)
  if [ "$op_kind" = prospect ] && [ "$op_lines" -gt 1 ]; then
    rm -f "$op_body"
    printf 'FAIL  a prospect opener is one line, and this one is %s.\n' "$op_lines" >&2
    printf '      It becomes one cell in outreach-firstlines.csv, which is why more than one line cannot work.\n' >&2
    printf '      Then type the one line you want and press ctrl-d.\n' >&2
    printf '      → run: ge person opener %s -\n' "$(ge_quote "$op_who")" >&2
    return 1
  fi

  person_block_ready "$P_FILE" OPENER || { rm -f "$op_body"; return 1; }
  person_snapshot "people/$P_SLUG.md" || { rm -f "$op_body" 2>/dev/null; return 1; }
  # Silent on failure, for the same reason as person_block_append: block_write
  # has already named the file, said nothing was changed and given a way out.
  block_write "$P_FILE" OPENER "$op_body" || { rm -f "$op_body" 2>/dev/null; return 1; }
  rm -f "$op_body" 2>/dev/null
  printf 'opener people/%s.md  %s line' "$P_SLUG" "$op_lines"
  [ "$op_lines" -eq 1 ] || printf 's'
  printf '\n'
  return 0
}

# ---------------------------------------------------------------- remove, purge

person_remove() {
  re_who=${1:-}
  [ -n "$re_who" ] || { person_fail 'ge person remove needs to know who.' \
      'ge person remove <who>' \
      'Put their address, their handle, or the name you wrote down in place of the gap.'; return 1; }
  person_resolve "$re_who" || { person_no_such "$re_who"; return 2; }
  person_require_valid "$P_FILE" || return 1
  re_kind=$(person_get_field "$P_FILE" kind)
  person_snapshot "people/$P_SLUG.md" || return 1
  # 2>/dev/null: a people folder the sync client has locked answers with a raw rm
  # line naming the file, above the sentence written for the founder, so one
  # problem arrives looking like two and the first one is written in shell.
  rm -f "$P_FILE" 2>/dev/null || { person_fail "people/$P_SLUG.md could not be deleted." \
      "$(person_write_fix "$GE_P_DIR")" "$(person_write_why "$GE_P_DIR")"; return 1; }
  printf 'removed people/%s.md\n' "$P_SLUG"
  re_stamp=$(person_last_stamp "$P_SLUG")
  # The whole relative path is quoted as one argument, not just the slug, so the
  # founder pastes one word where ge restore expects one. The slug here is a
  # filename read off disk, so it can hold a space that a derived one never does.
  printf '  The backup is still there. This puts the file back.\n'
  if [ -n "$re_stamp" ]; then
    printf '  → run: ge restore %s %s\n' "$(ge_quote "people/$P_SLUG.md")" "$re_stamp"
  else
    printf '  → run: ge restore %s\n' "$(ge_quote "people/$P_SLUG.md")"
  fi
  [ "$re_kind" = prospect ] && person_sheet_stale
  return 0
}

# THE TWO FILES A PURGE HAS TO REACH AFTER THE PERSON FILE IS GONE.
#
# WHY IT EXISTS: purge destroyed the person file and every backup of it, and
# stopped there. outreach-firstlines.csv is written whole from people/ and holds
# every prospect's email address, and it is the file a founder loads into a mail
# tool and sends twenty five messages from. Left as it was, a prospect who asked
# to be taken out was destroyed everywhere ge looks and still sat in the sheet
# about to be sent from, and the only thing that would have taken them off it
# was the founder happening to run the export again. A deletion that leaves the
# address in the file the messages go out of is not a deletion.
#
# BOTH EXPORTS, and only the ones that are already there. Writing an export a
# founder has never asked for would put a file in their folder as a side effect
# of a deletion, which is not what they asked ge to do.
#
# IT NEVER FAILS THE PURGE, and the exit code says so. The person file is
# already destroyed by the time this runs, and it cannot be put back. A caller
# reading a non-zero code here would take it as "the purge did not happen" and
# is the one thing that would be worse than a stale sheet, because whatever it
# did next would be built on a person who is gone. What it cannot finish it says
# out loud instead, on the error stream, with the command that finishes it.
person_purge_exports() {              # prints its own outcome, never fails the purge
  if [ -f "$GE_P_HOME/outreach-firstlines.csv" ]; then
    if person_export_firstlines; then
      :
    else
      # The person is already gone, so this cannot be rolled back and must not
      # be reported as done. The sheet is named, what is still on it is said in
      # as many words, and the one command that clears it is handed over. The
      # export itself has already printed why it could not write.
      printf '  growth-engine/outreach-firstlines.csv could not be written again, so their address is still on it.\n' >&2
      printf '  → run: ge person export firstlines\n' >&2
    fi
  fi
  if [ -f "$GE_P_HOME/dm-openers.md" ]; then
    if person_export_openers; then
      :
    else
      printf '  the targets section of growth-engine/dm-openers.md could not be written again.\n' >&2
      printf '  → run: ge person export openers\n' >&2
    fi
  fi
  return 0
}

# The backups of an export, destroyed after it has been written again.
#
# WHY IT EXISTS: person_export_firstlines backs the sheet up before replacing
# it, which is right for every other caller and is the one thing a purge cannot
# leave behind. That backup is a copy of the sheet as it was a moment ago, which
# is to say a copy holding the address the founder just asked ge to destroy. So
# the purge, and only the purge, empties that file's ring: the copy it just made
# and every older one, all of which hold the same address.
#
# ONE EXPORT'S RING, NOT BOTH. outreach-firstlines.csv is written whole from
# people/ and holds nothing else, so nothing is lost by emptying its ring.
# dm-openers.md is not: ge owns one marked section of it and the audience engine
# owns the rest, so its backups hold the founder's own writing and emptying them
# would destroy work that has nothing to do with the person being purged. Which
# ring is emptied therefore follows the kind being purged, and a prospect never
# appears in dm-openers.md at all.
person_purge_ring() {                 # <filename inside the growth-engine folder>
  pg_dir="$GE_P_HOME/.state/snapshots"
  pg_n=0
  [ -d "$pg_dir" ] || { printf '%s' "$pg_n"; return 0; }
  for pg_s in "$pg_dir"/*; do
    [ -e "$pg_s" ] || break
    pg_b=${pg_s##*/}
    case $pg_b in
      "$1".*) rm -f "$pg_s" 2>/dev/null && pg_n=$((pg_n + 1)) ;;
    esac
  done
  printf '%s' "$pg_n"
  return 0
}

person_purge() {
  pu_who=${1:-}
  [ -n "$pu_who" ] || { person_fail 'ge person purge needs to know who.' \
      'ge person purge <who>' \
      'Put their address, their handle, or the name you wrote down in place of the gap.'; return 1; }
  person_resolve "$pu_who" || { person_no_such "$pu_who"; return 2; }
  person_require_valid "$P_FILE" || return 1

  pu_status=$(person_get_field "$P_FILE" status)
  pu_kind=$(person_get_field "$P_FILE" kind)
  if [ "$pu_status" != stopped ] && [ "$pu_status" != cut ]; then
    printf 'FAIL  %s is at status %s, and purge only acts on stopped or cut.\n' "$pu_who" "$pu_status" >&2
    printf '      Purge destroys the file and every backup of it, so it cannot be the first thing you reach for.\n' >&2
    # stopped and cut are both prospect statuses. A target's six are target,
    # opener_written, sent, replied, booked and no_reply, so a target can never
    # be at either one and can never be purged at all. This line said "set them
    # to stopped, then purge again" whatever the kind, and for a target that is
    # two commands ge refuses in a row: the set, because stopped is not a status
    # a target can hold, and the purge that was never going to follow it. Every
    # B2C founder in the room works in targets and nothing else. ge person remove
    # is the command that does what they came here to do: it deletes the file and
    # leaves the backups, which is the part purge would have destroyed.
    if [ "$pu_kind" = target ]; then
      printf '      A target is never at stopped or cut, so purge is not the verb for one.\n' >&2
      printf '      Remove deletes the file and keeps the backups.\n' >&2
      printf '      → run: ge person remove %s\n' "$(ge_quote "$pu_who")" >&2
    else
      printf '      Set them to stopped first, then purge again.\n' >&2
      printf '      → run: ge person set %s status stopped\n' "$(ge_quote "$pu_who")" >&2
    fi
    return 1
  fi

  # ASKED BEFORE ANYTHING IS DESTROYED, because after the destroy there is no
  # way back. A purge has two halves: the person file and its backups, and the
  # exports that carry their address. The second half cannot be undone by
  # running the command again, since the first half has already gone, so a purge
  # that starts without being able to finish leaves the founder with a sheet
  # they have to be told about instead of one that is simply right. Both files
  # are probed here, and a folder that will not take them stops the whole thing
  # while the person is still there to purge again in a minute.
  #
  # person_replaceable prints the refusal itself, so each branch adds only the
  # sentence saying what did not happen because of it.
  if [ -f "$GE_P_HOME/outreach-firstlines.csv" ]; then
    person_replaceable "$GE_P_HOME/outreach-firstlines.csv" || {
      printf '      Purging would take them out of people/ and leave their address on that sheet.\n' >&2
      printf '      Nothing was destroyed.\n' >&2
      return 1
    }
  fi
  if [ -f "$GE_P_HOME/dm-openers.md" ]; then
    person_replaceable "$GE_P_HOME/dm-openers.md" || {
      printf '      Purging would take them out of people/ and leave that file describing people who are gone.\n' >&2
      printf '      Nothing was destroyed.\n' >&2
      return 1
    }
  fi
  person_state_writable || return 1

  pu_snaps=0
  pu_dir="$GE_P_HOME/.state/snapshots"
  if [ -d "$pu_dir" ]; then
    for pu_s in "$pu_dir"/*; do
      [ -e "$pu_s" ] || break
      pu_b=${pu_s##*/}
      case $pu_b in
        "people__$P_SLUG".md.*)
          rm -f "$pu_s" 2>/dev/null && pu_snaps=$((pu_snaps + 1)) ;;
      esac
    done
  fi
  # 2>/dev/null for the same reason as remove: the raw rm line names the file and
  # arrives above the sentence written for the founder.
  rm -f "$P_FILE" 2>/dev/null || { person_fail "people/$P_SLUG.md could not be deleted." \
      "$(person_write_fix "$GE_P_DIR")" "$(person_write_why "$GE_P_DIR")"; return 1; }

  # The counts are the whole receipt. There is no log line to go and check
  # afterwards, and the slug already in ops-log.md is the one thing left.
  printf 'purged people/%s.md\n' "$P_SLUG"
  printf '  destroyed 1 person file and %s snapshot' "$pu_snaps"
  [ "$pu_snaps" -eq 1 ] || printf 's'
  printf '. This cannot be undone\n'

  # The exports are written again from what is left in people/, in place of the
  # line that used to tell the founder to do it themselves. That line was the
  # whole of the gap: it was printed on the error stream, under a receipt saying
  # the person was destroyed, and if it was missed the address stayed on the
  # sheet the twenty five emails go out of.
  person_purge_exports

  # THE RING IS EMPTIED AFTER THE EXPORT AND NOT BEFORE IT, and the order is the
  # whole of the point. Writing the sheet again backs up the sheet as it was a
  # moment ago, which is a fresh copy of the file still holding the address, so
  # emptying the ring first destroys ten old copies and then makes an eleventh.
  # Measured, not reasoned about: the first version of this did exactly that and
  # the address was sitting in .state/snapshots afterwards.
  pu_rings=0
  case $pu_kind in
    prospect) pu_rings=$(person_purge_ring 'outreach-firstlines.csv') ;;
    target)   pu_rings=$(person_purge_ring 'dm-openers.md') ;;
  esac
  if [ "$pu_rings" -gt 0 ]; then
    printf '  destroyed %s backup' "$pu_rings"
    [ "$pu_rings" -eq 1 ] || printf 's'
    printf ' of the exported sheet, which held the same details\n'
  fi

  printf '  The list shows who is left.\n'
  printf '  → run: ge person list\n'
  return 0
}

# ---------------------------------------------------------------- export

# Every cell wrapped, every inner quote doubled. An unquoted comma shifts every
# later column right, Apollo imports the company into the first line, and the
# founder finds out when twenty five emails have gone out.
person_csv_cell() {                   # <value>
  printf '"%s"' "$(printf '%s' "$1" | sed 's/"/""/g')"
}

person_export_guard() {               # refuses while any person file is malformed
  # Asked here, so both exports get it and neither can be given a new caller
  # that forgets it. It also stops this guard claiming more than it examined: a
  # folder it cannot list holds no files it can call malformed, and returning 0
  # on that is the same silence the exports used to keep.
  person_folder_readable 'nothing was exported' \
    'Nobody in it could be read, so an export now would hold nobody at all.' \
    'The file it writes is left exactly as it was.' || return 1
  eg_bad=''
  for eg_f in "$GE_P_DIR"/*.md; do
    [ -e "$eg_f" ] || break
    case ${eg_f##*/} in README.md) continue ;; esac
    person_validate "$eg_f" > /dev/null || eg_bad="$eg_bad      people/${eg_f##*/}$GE_NL"
  done
  [ -z "$eg_bad" ] && return 0
  printf 'FAIL  these person files are malformed, so nothing was exported.\n' >&2
  printf '%s' "$eg_bad" >&2
  printf '      An export that quietly leaves someone out is worse than no export.\n' >&2
  printf '      The list names the reason beside each one.\n' >&2
  printf '      → run: ge person list\n' >&2
  return 1
}

person_export_firstlines() {
  person_export_guard || return 1
  person_state_writable || return 1
  ex_out="$GE_P_HOME/outreach-firstlines.csv"
  # Asked before the snapshot for the same reason ge person set asks before its
  # own: a refusal that has already taken a backup spends one of the twenty
  # slots on a file nothing changed.
  person_replaceable "$ex_out" || return 1
  person_snapshot 'outreach-firstlines.csv' || return 1

  # Every one of these used to be a bare "return 1". The founder ran the export
  # that feeds their twenty five cold emails, saw nothing at all on either
  # stream, and had no way to tell a quiet success from a folder that refused
  # the write. The sheet was then absent, or a week old, and nothing said so.
  ex_rows="$GE_P_HOME/.state/ge-person-rows.$$"
  true 2>/dev/null > "$ex_rows" || {
    person_fail 'the .state folder inside growth-engine could not be written, so nothing was exported.' \
                "$(person_write_fix "$GE_P_HOME/.state")" "$(person_write_why "$GE_P_HOME/.state")"
    return 1
  }
  ex_empty=0; ex_fallback=0; ex_count=0
  for ex_f in "$GE_P_DIR"/*.md; do
    [ -e "$ex_f" ] || break
    case ${ex_f##*/} in README.md) continue ;; esac
    person_scan "$ex_f"
    [ "$P_kind" = prospect ] || continue
    [ "$P_status" = cut ] && continue
    ex_slug=${ex_f##*/}; ex_slug=${ex_slug%.md}
    ex_first=$P_first_name
    if [ -z "$ex_first" ]; then
      ex_first=$(person_first_name_fallback "$P_name")
      ex_fallback=$((ex_fallback + 1))
    fi
    ex_line=$(block_read "$ex_f" OPENER 2>/dev/null | grep . | sed -n '1p')
    [ -n "$ex_line" ] || ex_empty=$((ex_empty + 1))
    ex_count=$((ex_count + 1))
    printf '%s\t%s,%s,%s,%s,%s\n' "$ex_slug" \
      "$(person_csv_cell "$P_email")" "$(person_csv_cell "$ex_first")" \
      "$(person_csv_cell "$P_company")" "$(person_csv_cell "$ex_line")" \
      "$(person_csv_cell "$P_status")" >> "$ex_rows"
  done

  ex_tmp="$ex_out.ge-tmp.$$"
  # Three steps, one answer. Written out rather than chained, because the mode
  # has to go across between building the new sheet and moving it into place,
  # and there is nothing to read it from after the move. One flag, so all three
  # ways of failing still print the single sentence below and no more.
  ex_ok=1
  # Same write probe as person_new_file, for the same reason: the export target
  # sits in the growth-engine folder, which a sync client can lock just as easily.
  true 2>/dev/null > "$ex_tmp" || ex_ok=0
  if [ "$ex_ok" -eq 1 ]; then
    { printf '"email","first_name","company","first_line","status"\n'
      LC_ALL=C sort "$ex_rows" | cut -f2-
    } > "$ex_tmp" 2>/dev/null || ex_ok=0
  fi
  if [ "$ex_ok" -eq 1 ]; then
    # The founder's own permissions go onto the new sheet before it lands. This
    # is the file holding every prospect's address, so a founder who set it to
    # owner only meant it, and the rename would otherwise leave ge's umask there
    # and say nothing about having done it.
    ge_keep_mode "$ex_out" "$ex_tmp"
    # 2>/dev/null on the move, so a locked target cannot answer with a raw
    # rename line naming the temp file.
    mv "$ex_tmp" "$ex_out" 2>/dev/null || ex_ok=0
  fi
  if [ "$ex_ok" -eq 0 ]; then
    rm -f "$ex_tmp" "$ex_rows" 2>/dev/null
    person_fail 'growth-engine/outreach-firstlines.csv could not be written, so nothing changed.' \
                "$(person_write_fix "$ex_out")" "$(person_write_why "$ex_out")"
    return 1
  fi
  rm -f "$ex_rows" 2>/dev/null

  printf 'wrote growth-engine/outreach-firstlines.csv  %s prospect' "$ex_count"
  [ "$ex_count" -eq 1 ] || printf 's'
  printf '\n'
  printf '  %s with no opening line yet, %s first names taken from the name\n' "$ex_empty" "$ex_fallback"
  person_ignore_export 'outreach-firstlines.csv'
  return 0
}

person_export_openers() {
  person_export_guard || return 1
  person_state_writable || return 1
  eo_out="$GE_P_HOME/dm-openers.md"
  person_snapshot 'dm-openers.md' || return 1
  if [ ! -f "$eo_out" ]; then
    # 2>/dev/null on the redirect, not only on the command. Without it the shell
    # answered a locked folder itself, naming this file, this line number and the
    # path, above the sentence written for the founder.
    { printf '# DM openers\n\nSend these by hand, spread out, from your own account.\n' > "$eo_out"; } 2>/dev/null || {
      person_fail 'growth-engine/dm-openers.md could not be created.' \
                  "$(person_write_fix "$eo_out")" "$(person_write_why "$eo_out")"
      return 1
    }
  fi
  block_ensure "$eo_out" TARGETS 'Targets' || return 1

  eo_rows="$GE_P_HOME/.state/ge-person-openers.$$"
  eo_body="$GE_P_HOME/.state/ge-person-body.$$"
  true 2>/dev/null > "$eo_rows" || {
    person_fail 'the .state folder inside growth-engine could not be written, so nothing was exported.' \
                "$(person_write_fix "$GE_P_HOME/.state")" "$(person_write_why "$GE_P_HOME/.state")"
    return 1
  }
  eo_count=0; eo_empty=0
  for eo_f in "$GE_P_DIR"/*.md; do
    [ -e "$eo_f" ] || break
    case ${eo_f##*/} in README.md) continue ;; esac
    person_scan "$eo_f"
    [ "$P_kind" = target ] || continue
    eo_slug=${eo_f##*/}; eo_slug=${eo_slug%.md}
    eo_pri=$P_priority
    # An absent priority sorts as 3, so the order is total and the file is
    # byte-identical run to run.
    [ -n "$eo_pri" ] || eo_pri=3
    eo_count=$((eo_count + 1))
    [ "$(person_block_lines "$eo_f" OPENER)" -eq 0 ] && eo_empty=$((eo_empty + 1))
    printf '%s\t%s\t%s\n' "$eo_pri" "$eo_slug" "$eo_f" >> "$eo_rows"
  done

  true 2>/dev/null > "$eo_body" || {
    rm -f "$eo_rows" 2>/dev/null
    person_fail 'the .state folder inside growth-engine could not be written, so nothing was exported.' \
                "$(person_write_fix "$GE_P_HOME/.state")" "$(person_write_why "$GE_P_HOME/.state")"
    return 1
  }
  LC_ALL=C sort "$eo_rows" | while IFS=$GE_TAB read -r eo_p eo_s eo_file; do
    person_scan "$eo_file"
    printf '### %s  (%s:%s)\n' "$P_name" "$P_platform" "$P_handle" >> "$eo_body"
    printf 'priority %s\n' "$eo_p" >> "$eo_body"
    [ -n "$P_why_them" ] && printf 'why them: %s\n' "$P_why_them" >> "$eo_body"
    printf '\n' >> "$eo_body"
    # A target with nothing written yet gets a line saying so, rather than a
    # heading with blank space under it. This is the file a founder works down
    # by hand, and an empty heading is a person they scroll past and send nothing
    # to, counted in the total as though they were ready.
    if [ "$(person_block_lines "$eo_file" OPENER)" -eq 0 ]; then
      printf 'no opening line yet\n' >> "$eo_body"
    else
      block_read "$eo_file" OPENER 2>/dev/null >> "$eo_body"
    fi
    printf '\n' >> "$eo_body"
  done

  block_write "$eo_out" TARGETS "$eo_body" || { rm -f "$eo_rows" "$eo_body" 2>/dev/null; return 1; }
  rm -f "$eo_rows" "$eo_body" 2>/dev/null
  printf 'wrote the targets block in growth-engine/dm-openers.md  %s target' "$eo_count"
  [ "$eo_count" -eq 1 ] || printf 's'
  printf '\n'
  printf '  %s with no opening line yet\n' "$eo_empty"
  person_ignore_export 'dm-openers.md'
  return 0
}

person_export() {
  case ${1:-} in
    firstlines) person_export_firstlines ;;
    openers)    person_export_openers ;;
    *) person_fail 'ge person export writes firstlines or openers.' \
                   'ge person export firstlines'
       return 1 ;;
  esac
}

# ---------------------------------------------------------------- help

person_help() {
  cat <<'USAGE'
ge person, the people you are selling to. One file each, in growth-engine/people/.

  add prospect <email> "<name>"        [--company X] [--title X] [--source apollo|manual|import|form]
  add target <ig|fb|other> <handle> "<name>"  [--platform-label X] [--source manual|import|form]
      both also take                   [--found-via "X"] [--why-them "X"] [--priority 1|2|3]
                                       [--note "X"] [--note-source "X"]

  set <who> <field> <value>            one field. key, kind and created cannot change
  get <who> [<field>]                  the whole file, or one value
  list [--kind X] [--status X] [--platform X] [--source X] [--priority 1|2|3]
       [--needs opener|followup|touch] [--long]

  note <who> "<text>" [--source "<where>"]
  touch <who> <email|dm|call|form|other> <in|out> "<text>"
  opener <who> --file <path>           or  opener <who> -   to type it
  remove <who>                         backs up first, and tells you how to put it back
  purge <who>                          destroys the file and every backup. stopped or cut only
  export firstlines                    writes growth-engine/outreach-firstlines.csv
  export openers                       writes the targets block in growth-engine/dm-openers.md

<who> is the email address or the platform:handle you added them with. The
filename works too, and so does the name you wrote down, as long as only one
person here has it. Nothing here sends anything to anybody.
USAGE
}

# ---------------------------------------------------------------- dispatch

person_main() {
  pm_verb=${1:-help}
  [ $# -gt 0 ] && shift
  case $pm_verb in
    help|-h|--help) person_help; return 0 ;;
  esac
  person_home || return 1
  case $pm_verb in
    add)    person_add "$@" ;;
    set)    person_set "$@" ;;
    get)    person_get "$@" ;;
    list)   person_list "$@" ;;
    note)   person_note "$@" ;;
    touch)  person_touch "$@" ;;
    opener) person_opener "$@" ;;
    remove) person_remove "$@" ;;
    purge)  person_purge "$@" ;;
    export) person_export "$@" ;;
    *)
      printf 'FAIL  ge person does not have a verb called "%s".\n' "$pm_verb" >&2
      printf '      → run: ge person help\n' >&2
      return 1 ;;
  esac
}

person_main "$@"
