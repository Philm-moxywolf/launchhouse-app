#!/bin/sh
# 01-help.sh — golden test for ge help and for an unknown verb.
#
# WHY IT EXISTS: help is the only page a founder reads before they have a folder,
#                and an unknown verb is the first thing a typo produces. If help
#                lists a command that no longer routes anywhere, or a typo prints
#                a shell error rather than a sentence, 130 people are stuck at the
#                first line of Session 1 with nothing to try next.
# CALLED BY:     tests/run.sh
# READS:         tests/fixtures/01-help/expect.out/   WRITES: tests/.work/<shell>/01-help/
# POSTURE:       fail-closed. Any difference from the committed text fails the case.
# PORTABILITY:   POSIX sh. No bash/python/node/jq.
# EVERY ERROR MESSAGE ENDS WITH A RECOVERY LINE ("→ run: ...").
set -u

. "$TESTS/lib/scrub.sh"
. "$TESTS/lib/assert.sh"

t_start 01-help
cd "$SANDBOX" || t_die "the sandbox for 01-help is not there." "sh tests/run.sh again"

# 1. ge help, word for word.
sh "$GE" help > "$CASEWORK/help.out" 2>&1
assert_exit 0 $? "ge help exits 0"
assert_raw_equal "$FIX/expect.out/help.txt" "$CASEWORK/help.out" "ge help text"

# 2. No verb at all is a founder asking what this is, not an error.
sh "$GE" > "$CASEWORK/bare.out" 2>&1
assert_exit 0 $? "ge with no verb exits 0"
assert_raw_equal "$FIX/expect.out/help.txt" "$CASEWORK/bare.out" "ge with no verb prints the same help"

# 3. Help and the dispatcher have to agree, both ways round. A page that names a
#    verb the dispatcher does not have is the worst kind of wrong: the founder
#    trusts it and gets a refusal. A verb the page leaves out is nearly as bad,
#    because a founder cannot find it at all, and receipt, accounts, version and
#    invocation were all missing from the page for exactly that reason.
#    help, version and invocation are answered by the dispatcher itself, so they
#    have no file of their own.
BUILTIN_VERBS=' help version invocation '
sed -n 's/^  ge \([a-z]*\).*/\1/p' "$CASEWORK/help.out" | LC_ALL=C sort -u > "$CASEWORK/verbs"
missing=0
while IFS= read -r v; do
  [ -n "$v" ] || continue
  case $BUILTIN_VERBS in *" $v "*) continue ;; esac
  [ -f "$REPO/plugins/growth-engine/scripts/cmd/$v.sh" ] && continue
  printf 'help lists "ge %s" but scripts/cmd/%s.sh is not there\n' "$v" "$v" >> "$CASEWORK/diff.txt"
  missing=$((missing + 1))
done < "$CASEWORK/verbs"
assert_equals 0 "$missing" "every verb help lists has a cmd file"

unlisted=0
for f in "$REPO"/plugins/growth-engine/scripts/cmd/*.sh; do
  v=${f##*/}
  v=${v%.sh}
  grep -q -F -x -e "$v" "$CASEWORK/verbs" && continue
  printf 'scripts/cmd/%s.sh exists but help never names "ge %s"\n' "$v" "$v" >> "$CASEWORK/diff.txt"
  unlisted=$((unlisted + 1))
done
for v in version invocation; do
  grep -q -F -x -e "$v" "$CASEWORK/verbs" && continue
  printf 'the dispatcher answers "ge %s" but help never names it\n' "$v" >> "$CASEWORK/diff.txt"
  unlisted=$((unlisted + 1))
done
assert_equals 0 "$unlisted" "every verb the dispatcher answers is on the help page"

# 4. A typo gets a sentence and a recovery line, never a shell error.
sh "$GE" nosuchverb > "$CASEWORK/unknown.out" 2>&1
assert_exit 1 $? "an unknown verb exits 1"
assert_raw_equal "$FIX/expect.out/unknown.txt" "$CASEWORK/unknown.out" "unknown verb refusal"
assert_contains "$CASEWORK/unknown.out" '→ run:' "the refusal carries a recovery line"

# 5. The closing sentence names six verbs that print their own list when they are
#    typed on their own. The page used to say that of every verb, and it was
#    false for eight of them: three refuse and five just run. A founder who
#    follows a sentence that is false reads the tool as broken, so the claim is
#    driven here, verb by verb, and the list in the sentence is held to the same
#    six the case drives.
assert_contains "$CASEWORK/help.out" 'log, remember, person, ledger, receipt and accounts' \
  "the closing sentence names the six verbs this case drives"
for v in log remember person ledger receipt accounts; do
  sh "$GE" "$v" > "$CASEWORK/$v.out" 2>&1
  assert_contains "$CASEWORK/$v.out" "ge $v" "ge $v on its own prints its own list"
done

t_done
