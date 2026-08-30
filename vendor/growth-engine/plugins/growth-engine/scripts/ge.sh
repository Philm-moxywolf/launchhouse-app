#!/bin/sh
# ge.sh: the dispatcher. Every brain subcommand enters here.
#
# WHY IT EXISTS: one entry point means one place that resolves the founder's
#                folder, one place that loads the libraries, and one place where
#                an unknown verb produces a useful answer instead of a traceback.
# CALLED BY:     bin/ge, which is what lands on PATH
# READS:         scripts/lib/*.sh   WRITES: nothing itself, subcommands own their files
# POSTURE:       fail-open on help and context, fail-closed on every write path.
#                Loading is fail-closed too: a file of ge's own that is missing,
#                unreadable or half written is answered with a sentence, because
#                the dot command is a special built-in and a shell that trips
#                over one ends there with nothing said.
#                A reader who stops early is not a failure. Every line a founder
#                reads on the screen is written by a child, so a pipe closed by
#                head, by grep -q or by a pager the founder quit ends that child
#                quietly and ends the run at zero.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. BSD+GNU date via lib/date_compat.sh.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

GE_VERSION_FILE_NOTE="version comes from .claude-plugin/plugin.json, read at runtime"

# The answer to an install that arrived half finished, was quarantined by
# antivirus, or is still being written by a file sync client. A founder reads any
# stop as their own work being gone, so this says whose files are affected before
# it says what to do.
#
# TWO COPIES OF THIS MESSAGE, and they have to say the same thing. The other is
# in bin/ge, which speaks in the one case this function cannot: when this whole
# file is the thing that would not load. That is why they are not shared, and why
# changing one alone leaves a founder two different answers to the same fault.
# Grep for this heading and change both.
ge_damaged() {                          # <the part of ge that would not load>
  printf 'FAIL  ge cannot start, because one of its own files is missing or damaged.\n' >&2
  printf '      It could not read %s. Nothing in your folder was touched.\n' "$1" >&2
  # The reason goes on its own line, above the arrow. Everything after "run: " is
  # the command, to the end of the line, because a founder selects the whole line
  # and pastes it. An English clause on the end of it arrives as more arguments.
  printf '      Installing the plugin again puts a clean copy back.\n' >&2
  printf '      → run: /plugin install growth-engine@launchhouse\n' >&2
  exit 1
}

GE_HOME_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd) || GE_HOME_DIR=''
[ -n "$GE_HOME_DIR" ] || ge_damaged "the folder the plugin is installed in"

# The founder-facing invocation form. Pinned in one place so no skill invents
# its own. The spike's GATE B2 VERDICT settles which of these is correct on each
# surface; until it is recorded in planning/spike-findings.md this is the
# documented default and schemas/brain.md carries the same string.
#
# THREE SURFACES, ONE STRING, AND IT CANNOT BE THE SAME STRING ON ALL THREE.
# Every skill copies this line into what a founder reads, so it has to be a line
# that works where they are reading it. Inside Claude Code with the plugin
# installed, that is a shell and the plugin's own folder, which is the default
# below and the reason it was written that way. Nowhere else is it true: there
# is no shell to name and no plugin folder to name it from, and a founder handed
# that line has been given something that cannot run and cannot be made to.
#
# So the surface says, and only the surface knows. Set GE_INVOCATION in the
# environment and it is used exactly as given. Set nothing and a pinned folder
# is taken as the answer on its own, because a pin is set by something that
# started ge itself rather than by a founder in a terminal, and there the verb
# on its own is the form: it is what every recovery line in this toolkit already
# prints, so a founder reads one form and not two.
if [ -n "${GE_INVOCATION:-}" ]; then
  :
elif [ -n "${GE_HOME:-}" ]; then
  GE_INVOCATION='ge'
else
  GE_INVOCATION='sh "$CLAUDE_PLUGIN_ROOT/bin/ge"'
fi

# What ge was part way through when the shell stopped. A dot command that trips
# over a half written file ends the shell where it stands under dash, which is
# /bin/sh on most of Linux, so the exit trap is the only place left to speak.
GE_LOADING=''
GE_RUNNING=''

# One sentence for a run that was cut short, said in one place so that the same
# stop can never be reported twice. It clears the field the exit trap reads,
# because that trap runs last and would otherwise say all of this again.
ge_cut_short() {
  [ -n "$GE_RUNNING" ] || return 0
  ge_cs_verb=$GE_RUNNING
  GE_RUNNING=''
  printf 'FAIL  ge stopped part way through %s, so it did not finish.\n' "$ge_cs_verb" >&2
  # The same rule as ge_damaged, and this line broke it for every one of the
  # fourteen verbs, because ctrl-c reaches all of them. "ge check, to see what
  # state your folder is in" pasted back reached ge as a verb called "check,"
  # and was answered with a second refusal, which is the last thing a founder
  # needs from a run they stopped themselves. The reason moves up a line, and the
  # arrow keeps the command alone.
  printf '      A check reads your folder and says what state it is in.\n' >&2
  printf '      → run: ge check\n' >&2
}

# ge_say: every line a founder reads on the screen leaves through here, and it
# leaves from a child.
#
# WHY: a shell that holds an exit trap does not die when the reader closes the
# pipe. It has a trap to run first, so the signal is held back, the write comes
# back as an error instead, and the shell prints its own complaint naming this
# file and a line number inside it. That is what a founder saw from
# ge version | head. Trapping PIPE here makes it worse rather than better,
# because catching the signal is the very thing that turns the death into a
# reported error, and it adds the same complaint to dash, which was silent. A
# child holds none of our traps, so it ends on the signal itself, silently, and
# hands back 141. head, grep -q and a pager the founder quit all close the pipe
# early, the skills do it, and none of them is a fault. The command path below
# does the same thing for the same reason, with its own bookkeeping.
ge_say() {                              # <the command that writes the output>
  ( "$@" )
  ge_say_rc=$?
  # 141 is what a child hands back when it was killed by a closed pipe. Nothing
  # is wrong and nothing was left half done: whoever was reading stopped reading.
  [ "$ge_say_rc" -eq 141 ] && ge_say_rc=0
  return "$ge_say_rc"
}

ge_exit_trap() {
  # The status that is already on its way out, read before anything here can
  # change it. ge remember and ge snapshot answer ctrl-c with 130, which is the
  # number that says interrupted, and losing it here would turn every interrupt
  # into a plain refusal.
  ge_trap_rc=$?
  [ -z "$GE_LOADING" ] || ge_damaged "$GE_LOADING"
  if [ -n "$GE_RUNNING" ]; then
    # The last resort, for a stop that nothing nearer the command caught. A
    # reader who closed the pipe cannot land here: commands write from a child
    # of their own, and a child that ends on a closed pipe is answered where it
    # was started rather than here.
    ge_cut_short
    [ "$ge_trap_rc" -eq 0 ] && ge_trap_rc=1
    exit "$ge_trap_rc"
  fi
  return 0
}
trap ge_exit_trap EXIT

# ge_load: one library, proved to have arrived whole before anything uses it.
ge_load() {                             # <path inside the plugin> <function it ends with>
  ge_ld_file="$GE_HOME_DIR/$1"
  [ -f "$ge_ld_file" ] && [ -r "$ge_ld_file" ] && [ -s "$ge_ld_file" ] || ge_damaged "$1"
  GE_LOADING=$1
  # The redirect sits on the group, never on the dot itself: a redirect that
  # fails on a special built-in ends the shell outright. What it hides is the
  # shell's own complaint about a half written file, which quotes a line number
  # inside ge and means nothing to a founder. The trap above and the check below
  # turn that into a sentence instead.
  { . "$ge_ld_file"; } 2>/dev/null
  GE_LOADING=''
  # A file cut short mid-download can still parse, so existence is not proof.
  # Each library ends by defining the function named here, which makes it the
  # cheap proof that all of the file arrived. Rename one of these in lib/ and it
  # has to be renamed here too. The golden suite says so loudly if it is not.
  command -v "$2" >/dev/null 2>&1 || ge_damaged "$1"
}

ge_load scripts/lib/date_compat.sh iso_to_epoch
ge_load scripts/lib/paths.sh ge_anchor
ge_load scripts/lib/table.sh no_sep
ge_load scripts/lib/blocks.sh block_ensure

# Every verb the dispatcher answers is listed here, and nothing is listed that
# it does not answer. A founder who cannot find the verb they need asks a mentor
# for it, and at the event there are 130 of them and three days.
ge_usage() {
  cat <<'USAGE'
ge, the Launchhouse brain. Everything it writes lives in your growth-engine folder.

Start here
  ge init                 make your growth-engine folder. Safe to run again
  ge context              a short summary of where your work stands
  ge check                checks your folder and shows what it found
  ge help                 this page

Your work
  ge log <type> "<text>"  add one line to your ops log
  ge remember <kind> ...  add one line to your curated memory
  ge person <verb> ...    the people you are selling to
  ge ledger <verb> ...    your content pieces
  ge receipt <verb> ...   the record of what your setup checks found
  ge accounts <verb> ...  the social accounts you can post to

Going back
  ge snapshot <file>      keep a copy of one file before you change it
  ge restore <file>       put an older copy of that file back
                          more than one copy, and it lists them for you to pick
  ge undo                 undo the last change ge made to one of your files

Keeping it tidy
  ge index                rebuild the table of which files are ready
  ge lint                 warnings about the shape of your files. It changes nothing

Used by the skills
  ge version              which version of the toolkit you have
  ge invocation           the line a skill uses to call ge

Six of these do more than one thing. Type one on its own, for example ge person,
and it prints its own list: log, remember, person, ledger, receipt and accounts.

If something looks wrong, start with ge check.
USAGE
}

ge_cmd=${1:-help}
[ $# -gt 0 ] && shift

# Asked once, here, rather than by each verb in its own words. A founder standing
# in a folder that cannot be read makes pwd fail, and an empty answer used as a
# path becomes the root of the disk: ge init announced it could not create
# /growth-engine and offered "chmod u+w /". help, version and invocation are let
# through, because none of them looks at the folder and a founder in this state
# is exactly who needs to be able to read the help.
case $ge_cmd in
  help|-h|--help|version|invocation) ;;
  *)
    # THE PIN IS CHECKED BEFORE THE WORKING DIRECTORY IS, because a pin that
    # cannot be used is the one fault where the working directory does not
    # matter at all. lib/paths.sh read it once at load and refused to repair it.
    # Answered here, once, so fourteen verbs cannot each decide for themselves
    # whether to carry on without the boundary they were told to keep.
    if [ -n "$GE_PIN_BAD" ]; then
      ge_pin_refusal >&2
      exit 1
    fi
    if ! ge_here >/dev/null 2>&1; then
      ge_nowhere_refusal >&2
      exit 1
    fi ;;
esac

case "$ge_cmd" in
  help|-h|--help)
    ge_say ge_usage
    exit $? ;;
  version)
    # Read at runtime rather than pinned here, so there is one version in the
    # plugin and not two that can disagree. No manifest means no answer: an empty
    # line and a clean exit would tell a caller the toolkit is fine.
    ge_manifest=.claude-plugin/plugin.json
    ge_ver=''
    if [ -r "$GE_HOME_DIR/$ge_manifest" ]; then
      ge_ver=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
        "$GE_HOME_DIR/$ge_manifest" 2>/dev/null | sed -n '1p')
    fi
    [ -n "$ge_ver" ] || ge_damaged "$ge_manifest"
    ge_say printf '%s\n' "$ge_ver"
    exit $? ;;
  invocation)
    ge_say printf '%s\n' "$GE_INVOCATION"
    exit $? ;;
  init|check|context|log|remember|person|ledger|snapshot|restore|undo|index|lint|receipt|accounts)
    ge_sub="scripts/cmd/$ge_cmd.sh"
    ge_sub_file="$GE_HOME_DIR/$ge_sub"
    [ -f "$ge_sub_file" ] && [ -r "$ge_sub_file" ] && [ -s "$ge_sub_file" ] \
      || ge_damaged "$ge_sub"
    # Read for shape before it is run. A command file cut short mid-download
    # still opens, and the dot command below is a special built-in: one that
    # trips ends the shell where it stands under dash, and under any shell it
    # prints a line number inside ge that a founder cannot act on. The libraries
    # above are proved whole a cheaper way, by the function each one ends with,
    # but a command file runs as it loads and has no such moment.
    sh -n "$ge_sub_file" 2>/dev/null || ge_damaged "$ge_sub"
    GE_RUNNING=$ge_cmd
    # ctrl-c, a closed terminal, or a stop sent by hand. Answered here rather
    # than left to the exit trap, because dash ends the shell on the signal
    # itself and never reaches that trap, so under dash a founder was told
    # nothing at all. The command runs in a child, and the wait for that child
    # finishes before this runs, so the command's own tidy-up is already done.
    trap 'ge_cut_short; exit 130' INT HUP TERM
    # The command writes from a child of its own, and that is the whole point of
    # the brackets. Founders pipe a long list into head, into grep -q, or into a
    # pager they quit, and every one of those stops reading part way through. A
    # shell holding an exit trap answers a closed pipe with a complaint naming a
    # file and a line inside ge, and then says the command failed on a folder
    # where nothing is wrong. A child holds no exit trap, so it ends there
    # quietly and hands back 141, the number that says the reader had gone.
    # Every command file ends by calling its own main, so the status the child
    # hands back is that command's own answer.
    ( . "$ge_sub_file" )
    ge_rc=$?
    case $ge_rc in
      141)
        # Nothing is wrong and nothing was left half done: whoever was reading
        # stopped reading. Say nothing, and end the way a finished run ends.
        GE_RUNNING=''
        exit 0 ;;
      130)
        # The stop reached the command alone. A ctrl-c typed at a keyboard
        # reaches this shell as well and is answered by the trap above, which
        # ends the run before this line is read.
        ge_cut_short
        exit 130 ;;
    esac
    GE_RUNNING=''
    exit "$ge_rc" ;;
  *)
    printf 'FAIL  ge does not have a command called "%s".\n' "$ge_cmd" >&2
    printf '      → run: ge help\n' >&2
    exit 1 ;;
esac
