#!/bin/sh
# 22-shim.sh: reaching ge through a shortcut, and what a damaged copy of ge says.
#
# WHY IT EXISTS: bin/ge is what lands on PATH, so founders and mentors link it
#                into a folder on PATH to save typing the long path, and that
#                used to end in one line of shell error naming a folder nobody
#                had ever typed. The other half is an install that arrived
#                incomplete: a download cut short, a file quarantined, a sync
#                client still writing. Both are answered by the same promise,
#                that a founder is never shown a shell error, a line number
#                inside ge, or a stop with nothing to try next. The dot command
#                and exec are special built-ins, so a shell that trips over one
#                ends there, and this drives the guards that keep it from
#                tripping under both shell families.
# CALLED BY:     tests/run.sh
# READS:         plugins/growth-engine/   WRITES: tests/.work/<shell>/22-shim/ and a copy
#                of the plugin inside the sandbox, which is what gets damaged
# POSTURE:       fail-closed. Every damaged shape has to refuse, open with FAIL
#                and end on a recovery line, and none of them may print a path
#                from inside ge or a raw shell error.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. The dash pass is skipped, and
#                said to be skipped, on a machine with no dash.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"
# For rl_command_ok and rl_every_arrow. This is the one stop a founder can reach
# with no working ge at all, so the line it ends on is the only thing they have.
. "$TESTS/lib/recovery.sh"

t_start 22-shim

PLUGIN="$SANDBOX/plugin"
cp -R "$REPO/plugins/growth-engine" "$PLUGIN" \
  || t_die "the plugin would not copy into the sandbox." "df -h ${TMPDIR:-/tmp}"
COPY="$PLUGIN/bin/ge"
chmod +x "$COPY" || t_die "the copied bin/ge would not be made runnable." "ls -l $COPY"

WORKDIR="$SANDBOX/work"
HIDDEN="$SANDBOX/hidden"
KEEP="$SANDBOX/keep"
mkdir -p "$WORKDIR" || t_die "the work folder could not be made." "df -h ${TMPDIR:-/tmp}"
cd "$WORKDIR" || t_die "the work folder is not there." "sh tests/run.sh again"

# The shell every run below is made with. The second pass points sh at dash, so
# the product itself runs under dash rather than only the harness around it.
RUN_PATH=$PATH

VERSION=$(sh "$COPY" version)
[ -n "$VERSION" ] || t_die "the copied ge would not report its version." "sh $COPY version"

# ------------------------------------------------------------------ shortcuts

# 1. Linked into a folder on PATH, which is the case the founder is told bin/ is
#    for. Answering with the version proves the shortcut was followed all the
#    way to the toolkit rather than to the shortcut's own parent.
mkdir -p "$SANDBOX/bin" || t_die "the bin folder could not be made." "df -h ${TMPDIR:-/tmp}"
ln -s "$COPY" "$SANDBOX/bin/ge" || t_die "the shortcut could not be made." "ln -s $COPY $SANDBOX/bin/ge"
PATH="$SANDBOX/bin:$RUN_PATH" ge version > "$CASEWORK/onpath.out" 2>&1
assert_exit 0 $? "ge on PATH through a shortcut exits 0"
assert_equals "$VERSION" "$(cat "$CASEWORK/onpath.out")" "ge on PATH through a shortcut answers"

# 2. A shortcut to a shortcut, the second one written relative to its own folder,
#    which is what ln -s ../bin/ge leaves behind.
mkdir -p "$SANDBOX/bin2" || t_die "the second bin folder could not be made." "df -h ${TMPDIR:-/tmp}"
ln -s ../bin/ge "$SANDBOX/bin2/ge" || t_die "the second shortcut could not be made." "ln -s"
sh "$SANDBOX/bin2/ge" version > "$CASEWORK/chain.out" 2>&1
assert_exit 0 $? "a shortcut to a shortcut exits 0"
assert_equals "$VERSION" "$(cat "$CASEWORK/chain.out")" "a shortcut to a shortcut answers"

# -------------------------------------------------------------- damaged copies

# broke <label> <ge arguments...>: run the damaged copy and hold it to what every
# founder-visible stop owes them. Not piped anywhere, because a check that runs
# on the right of a pipe is counted in a subshell and thrown away with it.
broke() {                               # <label> <ge arguments...>
  br_label=$1
  shift
  PATH="$RUN_PATH" sh "$COPY" "$@" > "$CASEWORK/out" 2>&1
  br_rc=$?

  assert_exit 1 "$br_rc" "$br_label: exits 1"

  if grep -q '^FAIL' "$CASEWORK/out"; then
    t_pass
  else
    t_note "$br_label: no FAIL banner"
    cat "$CASEWORK/out" >> "$CASEWORK/diff.txt"
    t_fail "$br_label: the refusal does not open with FAIL"
  fi

  # The way out, held to the whole rule and not only to carrying an arrow.
  #
  # This used to ask whether the last line contained "→ run:" and stop there,
  # which is the same hole both recovery cases had: nothing read what was after
  # the arrow. A founder whose install arrived half written has no folder to
  # fall back on and no second command to try, so this line has to paste and run
  # exactly as it stands. rl_every_arrow then reads any others in the message,
  # because a stop that names two things to do can be selected from twice.
  # The shape of the last line here, and the rule for every arrow in the message
  # from rl_every_arrow. Split that way so a fault is reported once: a stop with
  # one arrow on its last line would otherwise be named twice for one thing.
  br_last=$(rl_last_line "$CASEWORK/out")
  rl_arrow "$br_last"
  assert_equals run "$RL_FORM" "$br_label: the stop ends on a command to paste"
  rl_every_arrow "$CASEWORK/out" "$br_label"

  # The four shapes a raw shell error takes when a dot command or an exec trips.
  # A founder reading any of these has no idea the answer is to install again.
  assert_lacks "$CASEWORK/out" "$SANDBOX" "$br_label: no path from inside ge"
  assert_lacks "$CASEWORK/out" 'No such file' "$br_label: no raw missing file error"
  assert_lacks "$CASEWORK/out" 'Permission denied' "$br_label: no raw permission error"
  assert_lacks "$CASEWORK/out" 'yntax error' "$br_label: no raw parse error"
}

# healthy <label>: the copy answers again once the damage is put back, so a check
# above cannot pass because ge is broken for some other reason.
healthy() {                             # <label>
  PATH="$RUN_PATH" sh "$COPY" version > "$CASEWORK/well.out" 2>&1
  assert_exit 0 $? "$1: the copy works again"
}

# damage_sweep <label>: every damaged shape, under whichever shell PATH now
# leads to. The shapes are written by hand rather than cut from the real files,
# so that a change to a library or a command file cannot quietly turn one of
# these into a file that still parses.
damage_sweep() {                        # <pass label>
  ds=$1

  # A library that never arrived.
  mv "$PLUGIN/scripts/lib/table.sh" "$HIDDEN" || t_die "table.sh would not move." "ls -l $PLUGIN/scripts/lib"
  broke "$ds, a library missing" version
  mv "$HIDDEN" "$PLUGIN/scripts/lib/table.sh" || t_die "table.sh would not move back." "ls -l $HIDDEN"
  healthy "$ds, a library missing"

  # A library a sync client has claimed but not yet written.
  cp "$PLUGIN/scripts/lib/table.sh" "$KEEP" || t_die "table.sh would not copy." "df -h ${TMPDIR:-/tmp}"
  true 2>/dev/null > "$PLUGIN/scripts/lib/table.sh"
  broke "$ds, a library left empty" version
  cp "$KEEP" "$PLUGIN/scripts/lib/table.sh" || t_die "table.sh would not copy back." "ls -l $KEEP"
  healthy "$ds, a library left empty"

  # A library cut off part way through a function, which is what a download that
  # stopped leaves. It does not parse, and the shell that reads it ends there.
  printf 'row_field() {\n  printf "%%s" "$1"\n' > "$PLUGIN/scripts/lib/table.sh"
  broke "$ds, a library half written" version
  cp "$KEEP" "$PLUGIN/scripts/lib/table.sh" || t_die "table.sh would not copy back." "ls -l $KEEP"
  healthy "$ds, a library half written"

  # A library that parses but stops before the end. Nothing complains on the way
  # in, so the only proof it is short is the function it should have ended with.
  printf 'GE_SEP="|"\n' > "$PLUGIN/scripts/lib/table.sh"
  broke "$ds, a library that stops short" version
  cp "$KEEP" "$PLUGIN/scripts/lib/table.sh" || t_die "table.sh would not copy back." "ls -l $KEEP"
  healthy "$ds, a library that stops short"

  # The same two shapes for a command file, which runs as it loads and so has no
  # moment afterwards to be proved whole in.
  cp "$PLUGIN/scripts/cmd/context.sh" "$KEEP" || t_die "context.sh would not copy." "df -h ${TMPDIR:-/tmp}"
  true 2>/dev/null > "$PLUGIN/scripts/cmd/context.sh"
  broke "$ds, a command left empty" context
  cp "$KEEP" "$PLUGIN/scripts/cmd/context.sh" || t_die "context.sh would not copy back." "ls -l $KEEP"
  healthy "$ds, a command left empty"

  printf 'ge_ctx_main() {\n  printf "half a file\\n"\n' > "$PLUGIN/scripts/cmd/context.sh"
  broke "$ds, a command half written" context
  cp "$KEEP" "$PLUGIN/scripts/cmd/context.sh" || t_die "context.sh would not copy back." "ls -l $KEEP"
  healthy "$ds, a command half written"

  # No manifest, so there is no version to give. An empty line and a clean exit
  # would tell whoever asked that the toolkit is fine.
  mv "$PLUGIN/.claude-plugin/plugin.json" "$HIDDEN" || t_die "the manifest would not move." "ls -l $PLUGIN"
  broke "$ds, no manifest" version
  mv "$HIDDEN" "$PLUGIN/.claude-plugin/plugin.json" || t_die "the manifest would not move back." "ls -l $HIDDEN"
  healthy "$ds, no manifest"

  # The dispatcher itself, which is the one the shim has to answer for on its
  # own, because exec cannot be followed by anything.
  mv "$PLUGIN/scripts/ge.sh" "$HIDDEN" || t_die "ge.sh would not move." "ls -l $PLUGIN/scripts"
  broke "$ds, the dispatcher missing" version
  mv "$HIDDEN" "$PLUGIN/scripts/ge.sh" || t_die "ge.sh would not move back." "ls -l $HIDDEN"
  healthy "$ds, the dispatcher missing"
}

# Whichever shell this pass of the suite is reading ge with. run.sh runs
# everything twice and points sh at dash for the second pass, so the label says
# which one is being driven rather than guessing.
PASS_SHELL=${GE_T_SHELL:-sh}
damage_sweep "under $PASS_SHELL"

# The same sweep with sh pointed at dash, because dash is /bin/sh on most of
# Linux and it is the shell that ends outright when a special built-in trips.
# bin/ge hands off with exec sh, so putting dash first on PATH is what makes the
# product itself run under dash rather than only the harness around it. Skipped
# when the pass is already dash, where it would be the same sweep twice.
DASH=$(command -v dash 2>/dev/null || true)
if [ "$PASS_SHELL" = dash ]; then
  :
elif [ -n "$DASH" ] && [ -x "$DASH" ]; then
  mkdir -p "$SANDBOX/dashpath" || t_die "the dash folder could not be made." "df -h ${TMPDIR:-/tmp}"
  ln -s "$DASH" "$SANDBOX/dashpath/sh" || t_die "the dash shortcut could not be made." "ln -s"
  RUN_PATH="$SANDBOX/dashpath:$PATH"
  damage_sweep 'under dash'
  RUN_PATH=$PATH
else
  printf '      22-shim: no dash on this machine, so the dash pass was skipped\n' >&2
fi

t_done
