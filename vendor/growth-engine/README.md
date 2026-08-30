# Oneday Launchhouse: The AI Growth Engine

Claude plugin for Launchhouse Atlanta, 25 to 27 September 2026.

> **Pre-release.** This is version 0.1.0 and is still being built and tested. Founders on the programme receive the finished version, with setup instructions, on 4 September. Nothing here is final until then.

## Install

You install once. Cowork and Claude Code share the same plugin, so it is available in both.

**In the Claude desktop app:** click the + button next to the message box, choose Plugins, and add the marketplace `Philm-moxywolf/Atlanta`. Then install `growth-engine` from it.

**In Claude Code (the terminal):**

```
/plugin marketplace add Philm-moxywolf/Atlanta
/plugin install growth-engine@launchhouse
```

If the commands do not appear straight after installing, run `/reload-plugins` or restart the app, then check again.

Full setup guide: [docs/PRE-WORK.md](docs/PRE-WORK.md)

## Commands

Every command starts with `/growth-engine:` because that is how installed plugins are addressed. If you would rather not type commands, say the plain-language version instead. Both do the same thing.

| Command | Or just say | What it does |
|---|---|---|
| `/growth-engine:setup` | "check my setup" | Checks your install and finds your working folder. Run this first |
| `/growth-engine:brain` | "build my founder brain" | Your Founder Brain. Start here |
| `/growth-engine:content` | "build my content engine" | Pillars and your 30 posts or scripts |
| `/growth-engine:engine2` | "build my outreach engine" or "build my audience engine" | Outreach (B2B) or audience (B2C), picked automatically from your track |
| `/growth-engine:ops` | "find my bottleneck" | Bottleneck, snapshot choice, workflow copy |
| `/growth-engine:plan` | "build my 90 day plan" | Your 90-day plan |
| `/growth-engine:playbook` | "generate my playbook insert" | Your personalised playbook insert, delivered as a PDF |
| `/growth-engine:status` | "where am I up to" | Where you are up to |
| `/growth-engine:gate` | "build my gate submission" | Your gate submission summary, ready to paste into the gate form |
| `/growth-engine:doctor` | "something is broken" | Diagnoses and fixes problems |

Start with the Brain: `/growth-engine:brain`, or just say "build my founder brain". Everything else follows from that.

## What it does

| Skill | What it builds | Track |
|---|---|---|
| setup | Checks your install, finds your working folder, fixes the common problems | Both |
| founder-brain | Your business, audience, offer, proof and voice, in one locked file | Both |
| content-engine | 30 posts or scripts, ready to load into GHL | Both |
| outreach-b2b | List criteria, sequence copy, personalised first lines | B2B |
| audience-b2c | Targeting, 25 DM openers, hook bank, inbound scripts | B2C |
| ghl-workflows | Bottleneck diagnostic, snapshot choice, all workflow copy | Both |
| growth-plan | Your 90-day plan with kill criteria | Both |
| playbook-export | Your personalised playbook insert, as a PDF | Both |
| status | Where you are up to and what is outstanding | Both |

## The two tracks

You choose B2B or B2C once, in the Founder Brain. Every skill after that adapts automatically. You never choose again.

If you genuinely do both, pick the one that makes more money today.

## Cowork or Claude Code

Both work. They share the same plugin, so you install once and it is available in both.

**Use Cowork** unless you have a reason not to. Pick a folder, type what you want, no terminal.

**Use Claude Code** if you want to see and edit the files directly.

Nothing in this programme requires Claude Code.

## Everything lands in one folder

All output goes to `./growth-engine/` in whatever folder you are working in. Keep it. It is the input to the printed playbook and to the weekend.

Updating or reinstalling the plugin never touches that folder. Your work lives on your computer, not inside the plugin.

## What finished looks like

Two worked example founders live in [plugins/growth-engine/assets/examples/](plugins/growth-engine/assets/examples/), one per track. Read them to calibrate depth and tone before building your own.

## Support

Slack channel, or the drop-in clinics.
