#!/bin/sh
# scrub.sh — makes one run's output comparable with a committed expectation.
#
# WHY IT EXISTS: three things in ge output change on every run and on every
#                machine: the sandbox path, the UTC snapshot stamp and the day
#                the test is run on. Compared raw, a golden test goes red for
#                reasons that have nothing to do with the code, everyone learns
#                to ignore it, and it stops being a test. This turns those three
#                into fixed tokens so a red result always means a real change.
# CALLED BY:     tests/lib/assert.sh and tests/cases/*.sh
# READS:         standard input      WRITES: standard output
# POSTURE:       fail-closed. It only ever masks the three things named above, so
#                anything else that moved still shows up as a difference.
# PORTABILITY:   POSIX sh. No bash/python/node/jq. POSIX awk only, and the
#                sandbox path is read from the environment rather than pasted
#                into the script, because a path can carry any character at all.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

# scrub_roots <sandbox path>: arms scrub with both spellings of the sandbox.
#
# macOS resolves /tmp to /private/tmp, so the path a founder-facing message
# prints and the path pwd returns can differ by that one prefix. A test that
# passed on Linux and failed on a Mac for only that reason would cost an
# afternoon before anyone believed the code was fine.
scrub_roots() {
  GE_T_ROOT=$1
  case $GE_T_ROOT in
    /private/*) GE_T_ROOT_ALT=${GE_T_ROOT#/private} ;;
    *)          GE_T_ROOT_ALT=/private$GE_T_ROOT ;;
  esac
  export GE_T_ROOT GE_T_ROOT_ALT
}

# scrub: standard in to standard out, with the three moving parts fixed.
#
#   the sandbox path     -> @ROOT@
#   20260925T091500Z     -> @STAMP@   (and the -002 form the ring uses)
#   2026-09-25           -> @DATE@
#   09:15                -> @TS@
#
# The path is read through ENVIRON, never through awk -v and never pasted into
# a sed script, because a value carrying a backslash or an ampersand would
# rewrite the script rather than be matched by it.
scrub() {
  awk '
    BEGIN {
      root = ENVIRON["GE_T_ROOT"]
      alt  = ENVIRON["GE_T_ROOT_ALT"]
    }
    {
      sub(/\r$/, "")
      # The longer spelling first. /tmp/x is a substring of /private/tmp/x, so
      # replacing the short one first would leave a stray /private in the line.
      first = root; second = alt
      if (length(alt) > length(root)) { first = alt; second = root }
      for (i = 1; i <= 2; i++) {
        needle = (i == 1 ? first : second)
        if (needle == "") continue
        out = ""
        while ((at = index($0, needle)) > 0) {
          out = out substr($0, 1, at - 1) "@ROOT@"
          $0 = substr($0, at + length(needle))
        }
        $0 = out $0
      }
      gsub(/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-[0-9][0-9][0-9]/, "@STAMP@")
      gsub(/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z/, "@STAMP@")
      gsub(/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/, "@DATE@")
      gsub(/[0-9][0-9]:[0-9][0-9]/, "@TS@")
      print
    }
  '
}
