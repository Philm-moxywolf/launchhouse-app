#!/bin/sh
# validate.sh: the automated check for this repo. Run before every commit.
# CI runs it on every push via .github/workflows/validate.yml.
#
# Errors block a commit. Warnings are things with a deadline attached.
# Founder-facing means README.md, docs/, and everything under plugins/.
#
# POSIX sh, so the one gate this project has runs the same under dash, under
# bash and under whatever /bin/sh is on the machine of whoever runs it.

set -u
export LC_ALL="en_US.UTF-8"

# The repo root, worked out from the path this script was reached by, so it runs
# from any directory. A name with no slash in it means it was found on PATH, and
# command -v turns that back into a path.
SELF=$0
case "$SELF" in
  */*) ;;
  *) SELF=$(command -v -- "$0" 2>/dev/null) || SELF=$0 ;;
esac
REPO=$(CDPATH= cd -- "$(dirname -- "$SELF")/.." && pwd)
PLUGIN="$REPO/plugins/growth-engine"

ERRORS=0
WARNINGS=0

# One newline, for building up a list of findings a line at a time. Written once
# here because a bare newline inside a case arm reads like a mistake.
NL='
'

err()  { printf 'FAIL  %s\n' "$1"; ERRORS=$((ERRORS + 1)); }
warn() { printf 'WARN  %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }
ok()   { printf 'ok    %s\n' "$1"; }
head_() { printf '\n== %s\n' "$1"; }
rel() { sed "s|$REPO/||g"; }
# Every line of the evidence is indented, not only the first. Some of the checks
# below list a dozen files, and a block where line one is indented and the rest
# are not reads as though the list ended at line one.
show() { printf '%s\n' "$1" | rel | cut -c1-150 | sed 's/^/        /'; }

founder_files() {
  {
    [ -f "$REPO/README.md" ] && echo "$REPO/README.md"
    find "$REPO/docs" "$PLUGIN" -name '*.md' -type f 2>/dev/null
  } | sort
}

# Shell sources ship to founders too, and their comments are read whenever
# something breaks, so the house style rules apply to them. Two ways of being
# one, and both are needed. A shebang alone missed every file under scripts/cmd,
# because the dispatcher sources them and a sourced file carries no shebang: the
# dash scan then read six files out of twenty and reported the whole tree clean.
# The extension alone misses bin/ge, which has no extension at all.
shell_sources() {
  find "$PLUGIN" -type f ! -name '*.md' 2>/dev/null | sort | while read -r f; do
    case "$f" in
      *.sh) printf '%s\n' "$f"; continue ;;
    esac
    case "$(head -1 "$f" 2>/dev/null)" in '#!'*) printf '%s\n' "$f" ;; esac
  done
}

# ---------------------------------------------------------------- manifests

head_ "Manifests"

if [ -f "$REPO/.claude-plugin/marketplace.json" ]; then
  ok ".claude-plugin/marketplace.json is at the repo root"
else
  err "no .claude-plugin/marketplace.json at the repo root. /plugin marketplace add will fail"
fi

for f in "$REPO/.claude-plugin/marketplace.json" "$PLUGIN/.claude-plugin/plugin.json"; do
  if [ ! -f "$f" ]; then
    err "missing: $(echo "$f" | rel)"
  elif python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" 2>/dev/null; then
    ok "$(echo "$f" | rel) parses"
  else
    err "$(echo "$f" | rel) is not valid JSON"
  fi
done

if [ -f "$REPO/.claude-plugin/marketplace.json" ]; then
  MKT_NAME=$(python3 -c "import json;print(json.load(open('$REPO/.claude-plugin/marketplace.json'))['name'])" 2>/dev/null || echo "")
  if [ -n "$MKT_NAME" ]; then
    BAD_SUFFIX=$(grep -rn 'plugin install growth-engine@' "$REPO/README.md" "$REPO/docs" 2>/dev/null \
      | grep -v "growth-engine@${MKT_NAME}" || true)
    if [ -n "$BAD_SUFFIX" ]; then
      err "install suffix does not match marketplace name '${MKT_NAME}':"
      show "$BAD_SUFFIX"
    else
      ok "install suffix matches marketplace name '${MKT_NAME}'"
    fi
  fi

  OWNER_URL=$(python3 -c "import json;print(json.load(open('$REPO/.claude-plugin/marketplace.json')).get('owner',{}).get('url',''))" 2>/dev/null || echo "")
  ADD_PATH=$(grep -rhom1 'plugin marketplace add [A-Za-z0-9._-]*/[A-Za-z0-9._-]*' "$REPO/README.md" "$REPO/docs" 2>/dev/null \
    | head -1 | sed 's|.*add ||')
  if [ -n "$ADD_PATH" ] && [ -n "$OWNER_URL" ]; then
    if [ "$OWNER_URL" = "https://github.com/$ADD_PATH" ]; then
      ok "owner.url matches the documented install path ($ADD_PATH)"
    else
      err "owner.url is '$OWNER_URL' but founders are told to add '$ADD_PATH'"
    fi
  fi

  # Versions in both manifests should agree, and stay 0.x until the freeze.
  V1=$(python3 -c "import json;print(json.load(open('$REPO/.claude-plugin/marketplace.json')).get('version',''))" 2>/dev/null || echo "")
  V2=$(python3 -c "import json;print(json.load(open('$PLUGIN/.claude-plugin/plugin.json')).get('version',''))" 2>/dev/null || echo "")
  if [ "$V1" = "$V2" ] && [ -n "$V1" ]; then
    ok "manifest versions agree ($V1)"
  else
    err "manifest versions disagree: marketplace '$V1' vs plugin '$V2'"
  fi
fi

# plugin.json declares a license file that must ship inside the plugin dir,
# because the marketplace installs only ./plugins/growth-engine.
if grep -q 'SEE LICENSE IN LICENSE' "$PLUGIN/.claude-plugin/plugin.json" 2>/dev/null; then
  [ -f "$PLUGIN/LICENSE" ] && ok "LICENSE present inside the plugin directory" \
    || err "plugin.json says SEE LICENSE IN LICENSE but plugins/growth-engine/LICENSE does not exist"
fi

# ------------------------------------------------------------------- skills

head_ "Skills"

SKILL_COUNT=0
SKILL_NAMES=""
for d in "$PLUGIN"/skills/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  f="$d/SKILL.md"
  SKILL_COUNT=$((SKILL_COUNT + 1))
  SKILL_NAMES="$SKILL_NAMES $name"

  if [ ! -f "$f" ]; then
    err "skills/$name has no SKILL.md"
    continue
  fi

  if [ "$(sed -n '1p' "$f")" != "---" ]; then
    err "skills/$name/SKILL.md does not open with ---"
  elif [ -z "$(sed -n '2p' "$f" | tr -d '[:space:]')" ]; then
    err "skills/$name/SKILL.md has a blank line inside its frontmatter, line 2"
  fi

  declared=$(sed -n '1,12p' "$f" | grep -m1 '^name:' | sed 's/^name:[[:space:]]*//' | tr -d '[:space:]')
  if [ -z "$declared" ]; then
    err "skills/$name/SKILL.md has no name: field"
  elif [ "$declared" != "$name" ]; then
    err "skills/$name/SKILL.md declares name '$declared', directory says '$name'"
  fi

  if ! sed -n '1,12p' "$f" | grep -q '^description:'; then
    err "skills/$name/SKILL.md has no description: field"
  fi

  dupes=$(awk '/^```/{f=!f; next} !f && /^#{1,4} /' "$f" | sort | uniq -d)
  if [ -n "$dupes" ]; then
    warn "skills/$name/SKILL.md has repeated headings:"
    show "$dupes"
  fi
done
[ "$SKILL_COUNT" -eq 9 ] && ok "9 skills found" || warn "expected 9 skills, found $SKILL_COUNT"

# ----------------------------------------------------------------- commands

head_ "Commands"

CMD_COUNT=0
for f in "$PLUGIN"/commands/*.md; do
  [ -f "$f" ] || continue
  cmd=$(basename "$f" .md)
  CMD_COUNT=$((CMD_COUNT + 1))

  if [ "$(sed -n '1p' "$f")" != "---" ] || ! sed -n '1,6p' "$f" | grep -q '^description:'; then
    err "commands/$cmd.md needs frontmatter with a description:"
  fi

  for ref in $(grep -o '[a-z][a-z0-9-]* skill' "$f" | sed 's/ skill$//' | sort -u); do
    case " $SKILL_NAMES " in
      *" $ref "*) ;;
      *) err "commands/$cmd.md routes to skill '$ref', which does not exist" ;;
    esac
  done
done
[ "$CMD_COUNT" -eq 10 ] && ok "10 commands found" || warn "expected 10 commands, found $CMD_COUNT"

# Every check from here to the end of the locked facts reads this one list. An
# empty list is not proof that the tree is clean: it is a tree this script could
# not read, and every check below would print ok having looked at nothing.
FOUNDER_N=$(founder_files | grep -c . || true)
[ "$FOUNDER_N" -gt 0 ] \
  && ok "$FOUNDER_N founder-facing files to read" \
  || err "no founder-facing file could be read. Every check below this line examined nothing"

# ---------------------------------------------------- command namespacing

head_ "Command namespacing"

# Installed plugin commands only resolve as /growth-engine:<name>. A bare
# /brain in founder-facing text is an instruction that fails when typed.
# Allowed: the namespaced form, path-like uses (commands/gate.md), and bare
# forms inside a skill description's trigger list, which act as natural
# language safety nets.
CMDS='setup|doctor|brain|content|engine2|ops|plan|gate|playbook|status'
BARE=$(grep -rn "/" $(founder_files) /dev/null 2>/dev/null \
  | grep -v ':description:' \
  | sed 's|/growth-engine:[a-z0-9]*||g' \
  | grep -E "(^|[^[:alnum:]_-])/($CMDS)([^a-z0-9/-]|$)" || true)
if [ -n "$BARE" ]; then
  err "bare command reference. Founders typing it get nothing. Use /growth-engine:<name> or plain language:"
  show "$BARE"
else
  ok "no bare command references. All are namespaced or plain language"
fi

# ------------------------------------------------------------- placeholders

head_ "Placeholders"

PH=$(grep -rn 'ONEDAY_ORG\|REPO_NAME' $(founder_files) /dev/null 2>/dev/null || true)
if [ -n "$PH" ]; then
  err "unstamped install placeholder:"
  show "$PH"
else
  ok "no install placeholders in founder-facing files"
fi

TODOS=$(grep -rln 'TODO' "$PLUGIN/assets" 2>/dev/null || true)
if [ -n "$TODOS" ]; then
  warn "asset placeholders still open (six GHL share links, three form links, tracking sheet):"
  show "$TODOS"
fi

# -------------------------------------------------------------------- style

head_ "House style, founder-facing files only"

DASHES=$(grep -rn '[—–]' $(founder_files) /dev/null 2>/dev/null || true)
if [ -n "$DASHES" ]; then
  err "em dash or en dash in a founder-facing file:"
  show "$DASHES"
else
  ok "no em or en dashes"
fi

# The dash rule covers the whole tree, not only the markdown founder_files sees.
SHELL_SRC=$(shell_sources)
SHELL_N=$(printf '%s' "$SHELL_SRC" | grep -c . || true)
if [ -z "$SHELL_SRC" ]; then
  warn "no shell sources found under plugins/. The dash scan checked nothing"
else
  SH_DASHES=$(grep -Hn '[—–]' $SHELL_SRC 2>/dev/null || true)
  if [ -n "$SH_DASHES" ]; then
    err "em dash or en dash in a shell source under plugins/:"
    show "$SH_DASHES"
  else
    # The count is said out loud because this check once read six files and
    # reported on twenty.
    ok "no em or en dashes in $SHELL_N shell sources"
  fi
fi

BANNED='supercharge[a-z]*|unlock[a-z]*|revolutionary|seamless[a-z]*|leverage[a-z]*|effortless[a-z]*|synergy|turnkey'
BANNED_PHRASES='game[ -]changer|cutting[ -]edge|best[ -]in[ -]class'
BAD_WORDS=$( { grep -rniE "(^|[^-[:alnum:]])($BANNED)([^-[:alnum:]]|\$)" $(founder_files) /dev/null 2>/dev/null
               grep -rniE "($BANNED_PHRASES)" $(founder_files) /dev/null 2>/dev/null; } | sort -u || true)
if [ -n "$BAD_WORDS" ]; then
  err "banned marketing word:"
  show "$BAD_WORDS"
else
  ok "no banned marketing words"
fi

# ----------------------------------------------------------- design rules

head_ "Design rules"

PROMISE=$(grep -rniE 'guarantee[ds]? (a )?(reply|replies|response)|promise[ds]? (a )?(reply|replies)' $(founder_files) /dev/null 2>/dev/null \
  | grep -viE 'never|not |cannot|no one|nobody|none of' || true)
if [ -n "$PROMISE" ]; then
  err "output promises replies, which rule 3 forbids:"
  show "$PROMISE"
else
  ok "nothing promises replies"
fi

DM=$(grep -rniE 'automat[a-z]* (cold )?dm|dm automation' $(founder_files) /dev/null 2>/dev/null || true)
if [ -n "$DM" ]; then
  warn "DM automation mentioned. Confirm each line refuses it, never offers it:"
  show "$DM"
fi

if grep -rqi 'track' "$PLUGIN/commands/engine2.md"; then
  ok "engine2 routes on the track field"
else
  err "commands/engine2.md no longer reads the track field. The fork is broken"
fi

# ---------------------------------------------------------- locked facts

head_ "Locked facts"

CLINIC=$(grep -rn 'clinic' $(founder_files) /dev/null 2>/dev/null | grep -E '[0-9]{1,2} Sep' | grep -v '23 Sep' || true)
if [ -n "$CLINIC" ]; then
  err "clinic date other than 23 September in a founder-facing file:"
  show "$CLINIC"
else
  ok "clinic date consistent at 23 September"
fi

TF=$(grep -rni 'typeform' $(founder_files) /dev/null 2>/dev/null | grep -viE 'not typeform|never typeform|instead of typeform' || true)
if [ -n "$TF" ]; then
  err "Typeform named as the gate destination. Gates are Google Forms:"
  show "$TF"
else
  ok "gate forms named as Google Forms"
fi

DANGLING=$(grep -rnE '\b(TASKS|MASTERPLAN|RUNBOOK|AUDIT)\.md\b' $(founder_files) /dev/null 2>/dev/null || true)
if [ -n "$DANGLING" ]; then
  err "founder-facing file points at a document that is not in this repo:"
  show "$DANGLING"
else
  ok "no references to documents outside the repo"
fi

# ---------------------------------------------------------- runtime surface

head_ "Runtime surface"

# Founders receive what git holds, not what sits on this disk. The marketplace
# clones this repository and installs the one folder the manifest names, so a
# file that is here and untracked is a file that is not in their copy. Nothing
# else in this validator would notice: the checks above count skills and
# commands and never ask whether the thing those skills run is in git at all.
#
# Nothing below is a list of files written out by hand. The folder comes from
# the manifest, and the files come from what the manifest, the skills and the
# sources name. A hand-written list would be wrong the first time somebody adds
# a file, and wrong in the direction that reports a clean tree.

GIT_OK=no
if [ -d "$REPO/.git" ] && (cd "$REPO" && git rev-parse --git-dir) >/dev/null 2>&1; then
  GIT_OK=yes
fi

SRC_REL=$(sed -n 's/.*"source"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$REPO/.claude-plugin/marketplace.json" 2>/dev/null | sed -n '1p')
SRC_REL=${SRC_REL#./}
SRC_REL=${SRC_REL%/}

if [ -z "$SRC_REL" ]; then
  err "the marketplace manifest names no plugin source, so what an install copies could not be worked out. Nothing in this section ran"
elif [ ! -d "$REPO/$SRC_REL" ]; then
  err "the marketplace manifest installs '$SRC_REL' and there is no such folder here. Every install lands empty"
else
  SRC="$REPO/$SRC_REL"
  [ "$SRC" = "$PLUGIN" ] || \
    err "the manifest installs '$SRC_REL', and the rest of this validator reads plugins/growth-engine. One of the two is checking a folder nobody receives"

  MD_LIST=$(founder_files)
  SH_LIST=$(shell_sources)

  # Kept one path per line, and read one line at a time everywhere below. A
  # space in a file name is legal in git, and splitting this on spaces would
  # turn one such file into two names that match nothing.
  RT_TRACKED=''
  [ "$GIT_OK" = yes ] && RT_TRACKED=$(cd "$REPO" && git ls-files -- "$SRC_REL" 2>/dev/null)

  # The names directly inside the shipped folder. The scan below uses them to
  # tell a path into the plugin from a path into the founder's own folder,
  # because written in a line of code the two look the same.
  #
  # Built from what git holds as well as from what is on the disk. A folder
  # deleted from the disk and still in git would otherwise take every reference
  # to itself out of sight, and this check would report on what was left.
  TOPS_RE=''
  TOPS_LIST=' '
  ge_top() {                            # <one name directly inside the plugin>
    case "$TOPS_LIST" in *" $1 "*) return 0 ;; esac
    TOPS_LIST="$TOPS_LIST$1 "
    TOPS_RE="$TOPS_RE|$(printf '%s' "$1" | sed 's/[.]/\\./g')"
  }
  for t in "$SRC"/* "$SRC"/.*; do
    [ -e "$t" ] || continue
    b=${t##*/}
    [ "$b" = "." ] && continue
    [ "$b" = ".." ] && continue
    ge_top "$b"
  done
  RT_IFS=$IFS
  IFS=$NL
  for t in $RT_TRACKED; do
    IFS=$RT_IFS
    b=${t#"$SRC_REL"/}
    ge_top "${b%%/*}"
    IFS=$NL
  done
  IFS=$RT_IFS
  TOPS_RE=${TOPS_RE#|}

  # ge_paths: reads lines, writes the paths inside the plugin that they name.
  #
  # Three ways a line names a file in the plugin, and all three are in use: the
  # variable the skills are given, the variable a source works out for itself,
  # and a plain path written in code or in a comment. The variable names are not
  # pinned here. There are four of them already, and a fifth would be missed in
  # silence. What decides a match is the first part of the path being a name
  # that really is inside the shipped folder. A path with another path character
  # in front of it is the tail of a longer path, not a match of its own.
  ge_paths() {
    grep -oE "[\$][{]?[A-Za-z_][A-Za-z0-9_]*[}]?/[A-Za-z0-9._/-]+|(^|[^A-Za-z0-9_./\$-])(${TOPS_RE})/[A-Za-z0-9._/-]+" 2>/dev/null \
      | sed 's|^[$][{]\{0,1\}[A-Za-z_][A-Za-z0-9_]*[}]\{0,1\}/||; s|^[^A-Za-z0-9_.]||; s|[.]*$||' \
      | sort -u
  }

  # Everything reached through $CLAUDE_PLUGIN_ROOT, which is the folder itself.
  # Whatever follows that variable is a path inside the plugin by definition,
  # including a path into a folder that is not there, so these are held apart
  # and never measured against the names that are. Testing them the same way
  # answered "this names a folder that does not exist" by dropping the question,
  # and answered a deleted bin/ by counting one file fewer and saying all
  # present.
  ROOTREF=" $(grep -ho '[$][{]\{0,1\}CLAUDE_PLUGIN_ROOT[}]\{0,1\}/[A-Za-z0-9._/-]*' $MD_LIST $SH_LIST /dev/null 2>/dev/null \
    | sed 's|^[^/]*/||; s|[.]*$||' | sort -u | tr '\n' ' ')"

  # What runs a file, as against what only mentions one. A file that is sourced,
  # handed to sh, exec'd or loaded has to be there or the verb it belongs to
  # dies on the first command. A file that is only named can be absent on
  # purpose, and one of them is: the code tests for it and says so in its own
  # words. Treating the two the same would either paint a known gap red or let a
  # missing library through quietly.
  RUNS='[.] "|sh "|exec |^[[:space:]]*ge_load '

  NEED=$( {
    # What a skill is told to read. $CLAUDE_PLUGIN_ROOT is the only way a skill
    # can name a file inside the plugin, so this is the whole of that surface.
    printf '%s\n' $ROOTREF
    # What a source runs.
    grep -hE "$RUNS" $SH_LIST /dev/null 2>/dev/null | ge_paths
    # What the dispatcher routes to. Those file names are built from the verb,
    # so the path is never written out whole: the verbs come from the list of
    # them on the line above, and the shape of the path from the line itself.
    # Restructure that dispatcher and this finds nothing, which is why the count
    # of what was resolved is printed rather than a bare pass.
    awk '
      prev ~ /^[[:space:]]*[a-z][a-z0-9|_-]*\)[[:space:]]*$/ &&
      match($0, /[A-Za-z0-9._-]+\/[A-Za-z0-9._\/-]*[$][{]?[A-Za-z_][A-Za-z0-9_]*[}]?[A-Za-z0-9._-]*/) {
        tok = substr($0, RSTART, RLENGTH)
        d = index(tok, "$")
        pre = substr(tok, 1, d - 1)
        post = substr(tok, d + 1)
        sub(/^[{]?[A-Za-z_][A-Za-z0-9_]*[}]?/, "", post)
        arm = prev
        sub(/^[[:space:]]*/, "", arm)
        sub(/\)[[:space:]]*$/, "", arm)
        n = split(arm, v, "|")
        for (i = 1; i <= n; i = i + 1) print pre v[i] post
      }
      { prev = $0 }
    ' $SH_LIST /dev/null 2>/dev/null
  } | sort -u )

  # Everything else the tree names, run or not. A file named in a comment, or in
  # a sentence a founder reads, is still a claim that the file is there.
  MENT=$(cat $MD_LIST $SH_LIST /dev/null 2>/dev/null | ge_paths)

  NEED_SP=" $(printf '%s' "$NEED" | tr '\n' ' ')"

  RT_SEEN=0
  RT_DONE=''
  RT_GONE=''
  RT_SOFT=''
  RT_OFF=''
  for p in $NEED $MENT; do
    # Reached through the plugin folder's own variable, so it is ours whatever
    # it names. Otherwise it is ours only if the first part of the path is a
    # name inside the plugin: written in a line of code, a path into the
    # founder's own folder looks exactly the same.
    RT_MINE=no
    case "$ROOTREF" in *" $p "*) RT_MINE=yes ;; esac
    case "$TOPS_LIST" in *" ${p%%/*} "*) RT_MINE=yes ;; esac
    [ "$RT_MINE" = yes ] || continue
    case " $RT_DONE " in *" $p "*) continue ;; esac
    RT_DONE="$RT_DONE $p"
    RT_SEEN=$((RT_SEEN + 1))

    RT_HERE=no
    [ -f "$SRC/$p" ] && RT_HERE=file
    [ -d "$SRC/$p" ] && RT_HERE=folder

    if [ "$RT_HERE" = no ]; then
      # Named so whoever fixes it knows where the demand comes from. A name the
      # dispatcher builds from a verb is never written out whole, so the second
      # look is for the folder it would have been built in.
      RT_WHO=$(grep -lF -- "$p" $MD_LIST $SH_LIST /dev/null 2>/dev/null | sed -n '1p' | rel)
      [ -n "$RT_WHO" ] || \
        RT_WHO=$(grep -lF -- "${p%/*}/" $SH_LIST $MD_LIST /dev/null 2>/dev/null | sed -n '1p' | rel)
      [ -n "$RT_WHO" ] || RT_WHO="something in the tree"
      case "$NEED_SP" in
        *" $p "*) RT_GONE="$RT_GONE$p, run by $RT_WHO$NL" ;;
        *) RT_SOFT="$RT_SOFT$p, named by $RT_WHO$NL" ;;
      esac
    elif [ "$RT_HERE" = file ] && [ "$GIT_OK" = yes ]; then
      printf '%s\n' "$RT_TRACKED" | grep -qxF -- "$SRC_REL/$p" \
        || RT_OFF="$RT_OFF$p$NL"
    fi
  done

  if [ "$RT_SEEN" -eq 0 ]; then
    err "no file inside the plugin could be resolved from the manifest, the skills or the sources. This check examined nothing, so it proves nothing"
  elif [ -n "$RT_GONE" ]; then
    err "a file the plugin runs or is told to read is not in the tree. Whatever reaches it stops there:"
    show "$(printf '%s' "$RT_GONE")"
  else
    ok "$RT_SEEN files named by the manifest, the skills and the sources are all present"
  fi

  if [ -n "$RT_SOFT" ]; then
    warn "a file the tree names is not in this build. Whatever names it has to cope with its absence:"
    show "$(printf '%s' "$RT_SOFT")"
  fi

  # The whole shipped folder, not only the files something names. An install
  # copies the folder, so anything in it that git does not hold is missing from
  # every founder's copy, whether or not this validator can see who reads it.
  if [ "$GIT_OK" = no ]; then
    warn "this is not a git checkout, so nothing was compared against git. What founders would receive is unchecked"
  else
    STRAY=$(cd "$REPO" && git ls-files --others --exclude-standard -- "$SRC_REL" 2>/dev/null)
    if [ -n "$STRAY" ]; then
      STRAY_N=$(printf '%s' "$STRAY" | grep -c . || true)
      err "$STRAY_N file(s) under $SRC_REL are on this disk and not in git. An install copies what git holds, so founders receive none of them:"
      show "$(printf '%s\n' "$STRAY" | sed 's|/[^/]*$||' | sort | uniq -c \
        | sed 's/^ *\([0-9][0-9]*\) \(.*\)$/\2, \1 file(s)/')"
      if [ -n "$RT_OFF" ]; then
        RT_OFF_N=$(printf '%s' "$RT_OFF" | grep -c . || true)
        show "$RT_OFF_N of them are named directly by the manifest, the skills or the sources."
      fi
      show "git add $SRC_REL is the only thing that puts them in."
    else
      ok "every file under $SRC_REL is tracked, so all of it ships"
    fi

    # The same disagreement the other way round. These still ship, because an
    # install copies what git holds, so this is not a fault yet. It becomes one
    # at the next commit, and the scan above cannot see it: a file that is only
    # in git is not on the disk to be found.
    LOST=$(cd "$REPO" && git ls-files --deleted -- "$SRC_REL" 2>/dev/null)
    if [ -n "$LOST" ]; then
      LOST_N=$(printf '%s' "$LOST" | grep -c . || true)
      warn "$LOST_N file(s) under $SRC_REL are in git and not on this disk. Commit that and founders lose them:"
      show "$(printf '%s\n' "$LOST" | sed 's|/[^/]*$||' | sort | uniq -c \
        | sed 's/^ *\([0-9][0-9]*\) \(.*\)$/\2, \1 file(s)/')"
    fi

    # The same question for the rest of the repo. The test suite is the only
    # proof this toolkit works, and it is not shipped, so the sweep above would
    # never have looked at it.
    OTHER=''
    OTHER_IFS=$IFS
    IFS=$NL
    for p in $(cd "$REPO" && git ls-files --others --exclude-standard 2>/dev/null); do
      IFS=$OTHER_IFS
      case "$p" in
        "$SRC_REL"/*) ;;
        *) OTHER="$OTHER$p$NL" ;;
      esac
      IFS=$NL
    done
    IFS=$OTHER_IFS
    if [ -n "$OTHER" ]; then
      OTHER_N=$(printf '%s' "$OTHER" | grep -c . || true)
      err "$OTHER_N file(s) elsewhere in this repo are on this disk, not in git, and not ignored either. They are not in the repository at all:"
      show "$(printf '%s' "$OTHER" | sed 's|/.*||' | sort | uniq -c \
        | sed 's/^ *\([0-9][0-9]*\) \(.*\)$/\2, \1 file(s)/')"
      show "git add puts them in, a line in .gitignore keeps them out. They are neither."
    else
      ok "nothing else in the working tree is missing from git"
    fi
  fi
fi

# ------------------------------------------------------------------ hygiene

head_ "Hygiene"

if grep -q '^growth-engine/' "$REPO/.gitignore" 2>/dev/null; then
  err "unanchored 'growth-engine/' in .gitignore matches plugins/growth-engine/ too. Use '/growth-engine/'"
elif grep -q '^/growth-engine/' "$REPO/.gitignore" 2>/dev/null; then
  ok "/growth-engine/ is gitignored at the repo root"
else
  err "the founder's growth-engine/ output folder is not gitignored"
fi

if [ -d "$REPO/.git" ]; then
  TRACKED=$(cd "$REPO" && git ls-files | grep '^growth-engine/' || true)
  [ -n "$TRACKED" ] && err "founder output is tracked in git: $TRACKED" || ok "no founder output tracked"

  T_SKILLS=$(cd "$REPO" && git ls-files 'plugins/growth-engine/skills/*' | grep -c 'SKILL.md' || true)
  T_CMDS=$(cd "$REPO" && git ls-files 'plugins/growth-engine/commands/*' | wc -l | tr -d ' ')
  if [ "$T_SKILLS" -eq "$SKILL_COUNT" ] && [ "$T_CMDS" -eq "$CMD_COUNT" ]; then
    ok "all $SKILL_COUNT skills and $CMD_COUNT commands are tracked in git"
  else
    err "git tracks $T_SKILLS skills and $T_CMDS commands, but $SKILL_COUNT and $CMD_COUNT exist on disk. Check .gitignore"
  fi

  LEAKED=$(cd "$REPO" && git ls-files \
    | grep -iE '^(MASTERPLAN|TASKS|RUNBOOK|AUDIT|EXECUTE|STATE)\.md$|proposal|brief|mentor|rate-card|day-rate|retainer' || true)
  if [ -n "$LEAKED" ]; then
    err "internal material is tracked in the public-bound repo:"
    show "$LEAKED"
  else
    ok "no internal material tracked by name"
  fi

  # The other direction, and the one a name scan cannot answer. This repository
  # is public and the folder above it never is, so a tracked folder that no
  # install copies and no founder reads is worth one more look before the link
  # goes out. It is named here rather than judged: some of it is meant to be
  # public and some of it is the private folder's, and only the person who wrote
  # it can say which.
  #
  # The published surface: what the marketplace installs, what a founder reads,
  # and what the repo needs to check and build itself.
  PUBLISHED=" .claude-plugin .github .gitattributes .gitignore LICENSE README.md docs scripts tests ${SRC_REL%%/*} "
  OUTSIDE=''
  PUB_IFS=$IFS
  IFS=$NL
  for p in $(cd "$REPO" && git ls-files | sed 's|/.*||' | sort -u); do
    IFS=$PUB_IFS
    case "$PUBLISHED" in
      *" $p "*) ;;
      *) OUTSIDE="$OUTSIDE$p, $(cd "$REPO" && git ls-files -- "$p" | grep -c . || true) tracked file(s)$NL" ;;
    esac
    IFS=$NL
  done
  IFS=$PUB_IFS
  if [ -n "$OUTSIDE" ]; then
    warn "tracked, and nothing installs it or reads it. Read it before the repo goes public:"
    show "$(printf '%s' "$OUTSIDE")"
  else
    ok "nothing tracked outside the published surface"
  fi
fi

# ------------------------------------------------------------------- result

printf '\n%s\n' "----------------------------------------"
printf '%d error(s), %d warning(s)\n' "$ERRORS" "$WARNINGS"
[ "$ERRORS" -eq 0 ] && printf 'PASS\n' || printf 'FAIL. Do not commit until these are clear.\n'
exit $([ "$ERRORS" -eq 0 ] && echo 0 || echo 1)
