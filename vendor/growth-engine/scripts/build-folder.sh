#!/usr/bin/env bash
# build-folder.sh: assemble the Launchhouse Folder, the artifact a founder
# downloads, unzips once, and opens every time they work on the programme.
#
# The folder carries the whole toolkit, not a pointer to it:
#   .claude/skills/     the nine skills
#   .claude/commands/   the ten commands, bare-named
#   CLAUDE.md           how Claude behaves here, plus install help if needed
#   growth-engine/      pre-created, so "where does my work go" answers itself
#
# On Claude Code (terminal) this makes the folder self-sufficient: skills and
# commands load from the folder, bare names work, nothing to install.
# On the desktop app, project-scoped skills are NOT known to load from an
# opened folder, so there the folder is the working folder and the skills
# arrive through the marketplace plugin instead. Test before relying on it.
#
# Rebuild after any change to skills or commands: ./scripts/build-folder.sh

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$REPO/plugins/growth-engine"
VERSION=$(python3 -c "import json;print(json.load(open('$PLUGIN/.claude-plugin/plugin.json'))['version'])")

OUT="$REPO/dist"
STAGE="$OUT/Launchhouse"

rm -rf "$STAGE" && mkdir -p "$STAGE/.claude" "$STAGE/growth-engine" "$OUT"

# One source of truth. Everything is copied from the plugin, never rewritten.
cp -R "$PLUGIN/skills"   "$STAGE/.claude/skills"
cp -R "$PLUGIN/commands" "$STAGE/.claude/commands"

cat > "$STAGE/growth-engine/README.md" <<'EOF'
Everything the toolkit builds for you lands in this folder: your Founder
Brain, your 30 pieces of content, your outreach or audience engine, your
operations copy, your 90-day plan. Leave it where it is.
EOF

cat > "$STAGE/CLAUDE.md" <<EOF
# Launchhouse working folder

This folder belongs to one founder on the Oneday Launchhouse Atlanta
programme, 25 to 27 September 2026. Toolkit version $VERSION.

## How to behave in this folder

- The nine Launchhouse skills live in .claude/skills/ inside this folder.
  Route any programme request (brain, content, outreach, audience, ops,
  plan, gate, playbook, status) to the matching skill.
- Every output lands in ./growth-engine/ in this folder. Never write
  programme output anywhere else.
- If those skills are somehow not available on this surface, the founder
  can install the same toolkit as a plugin instead. Walk them through it
  gently: desktop app, the + button next to the message box, then Plugins,
  add the marketplace Philm-moxywolf/Atlanta, install growth-engine.
  Claude Code terminal: /plugin marketplace add Philm-moxywolf/Atlanta
  then /plugin install growth-engine@launchhouse. If commands do
  not appear, /reload-plugins or restart the app. If that fails twice,
  send them to the Slack channel. Never leave them grinding.
- The founder may be non-technical and may feel behind. Be plain and
  unhurried. One next action at a time, not a list of six.

## The one rule for the founder

Always open this folder. Work done in any other folder gets scattered and
will not be found in Atlanta. If the founder seems to be missing work,
their Brain is almost certainly in another folder: help them find it and
bring it here.
EOF

cat > "$STAGE/READ-ME-FIRST.md" <<'EOF'
# Welcome to your Launchhouse folder

One rule: always open this folder when you work on Launchhouse.

1. Put this folder somewhere permanent. Documents is good.
2. Open it in Claude. In Cowork, pick this folder. In Claude Code, start here.
3. Say hello. Claude knows what this folder is and will take you from there.

Everything you build lands in the growth-engine folder inside this one.
That folder is what the weekend in Atlanta runs on. Keep it.
EOF

printf '%s\n' "$VERSION" > "$STAGE/VERSION"

( cd "$OUT" && rm -f Launchhouse.zip && zip -qr Launchhouse.zip Launchhouse -x '*.DS_Store' )

printf 'built dist/Launchhouse.zip  (toolkit %s)\n' "$VERSION"
printf '  %s skills, %s commands\n' \
  "$(find "$STAGE/.claude/skills" -name SKILL.md | wc -l | tr -d ' ')" \
  "$(find "$STAGE/.claude/commands" -name '*.md' | wc -l | tr -d ' ')"
