---
name: setup
description: Check, repair, and update the founder's Launchhouse setup. Verifies the plugin is installed and current, finds or creates the working folder, explains the difference between Cowork and Claude Code, and diagnoses common problems. Trigger on "check my setup", "am I set up right", "something is broken", "update the plugin", "which folder should I use", "cowork or claude code", "/doctor", or whenever another skill reports it cannot find the working folder.
---

# Setup and Diagnostics

The founder's self-service repair tool. Most support messages during the runway will be one of the problems below, and this skill should resolve them without a mentor.

Be plain and unhurried. Many founders on this programme are not technical and will already feel behind.

## Run these checks in order

### 1. Which surface are they on

Ask, or infer from context, whether they are in **Cowork** or **Claude Code**.

Both work. They share the same plugin, so nothing needs installing twice.

- **Cowork** is the default recommendation. Pick a folder, type what you want, Claude does the work across multiple steps. No terminal.
- **Claude Code** suits founders who want to see and edit files directly and move faster.

If they are unsure which they are using or which to use, tell them to stay in Cowork. It is the lower-friction path and nothing in this programme requires Claude Code.

### 2. Is the plugin loaded

If this skill is running, it is. Say so plainly, because founders often assume something is broken when it is not.

Report the plugin version from the plugin's own manifest, `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, if it is readable. Do not read `.claude-plugin/plugin.json` as a relative path, because that resolves against the founder's working folder, not the plugin.

### 3. Find the working folder

The single most common problem in the programme. Founders open Claude Code or Cowork in a different folder each time, so their work scatters and later skills cannot find the Brain.

Look for `./growth-engine/`. If it is not in the current folder, check the parent folder and the home directory before concluding it does not exist.

**If you find it somewhere unexpected**, tell the founder exactly where it is, in full, and tell them to open that same folder every time from now on.

**If you find more than one**, this is a real problem. Show them each location with what it contains and how recently it was modified. Help them decide which is the real one. Do not merge them automatically or delete anything. Tell them to move the others aside rather than delete, in case something useful is in them.

**If none exists**, create `./growth-engine/` in the current folder, tell them the full path, and tell them to note it down. Then route them to `/growth-engine:brain`, or tell them to say "build my founder brain".

### 4. Check progress

Hand off to the status skill rather than duplicating it here.

### 5. Time-critical items

Read `./growth-engine/founder-brain.md` if it exists and check the Flags section.

- **B2B**: is the sending domain sorted, with SPF, DKIM and DMARC configured? If the Brain flags a fresh domain and nothing has happened, raise it now.
- **B2C**: is Instagram converted to Business or Creator and linked to a Facebook Page? Nothing publishes or captures inbound without it.

Raise these even if the founder asked about something else. They are the two items that quietly break the weekend.

## Updating

The plugin will be updated during the runway. Founders do not get updates automatically.

To update, the route depends on where they are:

- **Claude Code (terminal):** run `/plugin marketplace update launchhouse`, then reinstall the plugin if prompted.
- **Desktop app or Cowork:** open Plugins from the + menu next to the message box and update `growth-engine` there.

Updating or reinstalling never touches the founder's `growth-engine/` folder. Their work lives in their own folder, not inside the plugin. Say this if they hesitate.

If a founder reports behaviour that does not match what they were told in a session, updating is the first thing to try.

## Common problems

**"The commands are not there."** Three causes, in order of likelihood. First: they typed the command without its prefix. Every command starts with `/growth-engine:`, so the check is `/growth-engine:setup`, and plain language works too. Second: the plugin installed but has not loaded yet. Run `/reload-plugins`, or quit and reopen the app. Third: they are in a different Claude account from the one they installed on. Send them back to the pre-work doc only if all three fail.

**"It asked me about my business again."** They are in the wrong folder. Run check 3. Their existing Brain is almost certainly intact somewhere else.

**"It gave me LinkedIn posts and I sell to consumers."** The track field in their Brain is wrong. Open `founder-brain.md`, correct the `track` line to `b2c`, and regenerate the content.

**"My files disappeared."** Almost never true. Run check 3.

**"It will not let me automate Instagram DMs."** Correct behaviour, not a bug. Automated cold DMs get accounts restricted. Explain the inbound machine instead.

**"I cannot get any of this working."** Do not keep troubleshooting past two failed attempts. Tell them to post in the Slack channel and that someone will sort it individually. A founder stuck alone for an hour is worse than a founder who asked for help after ten minutes.

## What this skill does not do

It cannot install the plugin, because the plugin must be installed for this skill to run. First-time installation is covered in the pre-work document.

It does not change any founder content. Diagnosis and repair of setup only.
