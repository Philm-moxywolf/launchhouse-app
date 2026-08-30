# Pre-work: do this now

Sent 4 September. Everything here must be done before Session 1 in the week of 7 September.

Two of these items are time-critical and cannot wait for the sessions. They are marked.

## 1. Get Claude

You need a paid Claude plan. Claude Code is included with it.

This is a real cost and it is required.

## 2. Install Claude Desktop

Download the desktop app and sign in.

One important thing: **install and sign in on the Claude account you will bring to Atlanta.** If you have a work account and a personal account, pick one now and stay on it. The plugin installs per account, and switching later means installing again and hunting for your files.

## 3. Install the toolkit

Two ways in. Use whichever matches where you are.

**In the desktop app:** click the + button next to the message box, choose Plugins, and add the marketplace `Philm-moxywolf/Atlanta`. Then install `growth-engine` from it.

**In Claude Code (the terminal):** paste these two lines exactly as written:

```
/plugin marketplace add Philm-moxywolf/Atlanta
/plugin install growth-engine@launchhouse
```

If neither route works on your machine, post in the Slack channel and we will get you installed individually. Do not lose an evening to it.

## 4. Check it worked

Start a new conversation and type:

```
/growth-engine:setup
```

You can also just say "check my setup". Both work.

It will check everything, tell you which folder your work will live in, and tell you if anything is wrong. If it reports you are set up and have not started yet, you are done. Stop there. We build the rest together in Session 1.

**If the command does not appear**, run `/reload-plugins`, or quit and reopen the app, then try again. That fixes it nearly every time.

If anything still does not work, type `/growth-engine:doctor` (or say "something is broken") and it will walk you through it. If that does not fix it, post in the Slack channel.

## Which one should I use, Cowork or Claude Code?

They share the same setup, so installing once covers both.

**Use Cowork.** Pick a folder, type what you want. No terminal, nothing to configure.

Use Claude Code instead only if you already work with files and code and would rather see them directly. Nothing in this programme requires it.

## Updates

We will improve the toolkit during the programme. Updates are not automatic.

**In Claude Code**, run:

```
/plugin marketplace update launchhouse
```

Then reinstall the plugin if prompted.

**In the desktop app**, open Plugins from the + menu and update `growth-engine` from there.

We will tell you in Slack when there is an update worth taking, with the exact steps.

## 5. TIME-CRITICAL if you sell to businesses

Work out whether you have a business domain that already sends email regularly.

**If you do not, buy one now.** You are sending 25 messages, which is low volume, so this is straightforward. What matters is that the domain is set up correctly rather than warmed for months.

Three records to get right, and your registrar or email provider will walk you through them: SPF, DKIM and DMARC. Without them your mail gets filtered regardless of how long the domain has existed.

Then send a small amount of normal email from it every weekday between now and Atlanta. Ten to twenty a day, real messages to real people. That is enough at this volume.

A fresh domain needs at least three weeks of this. If you are buying one after roughly 8 September, use an existing domain with real sending history instead, even if the name is less tidy. An older domain that already sends beats a perfect new one that does not.

Reply to the Slack thread if you are unsure and we will sort it individually.

## 6. TIME-CRITICAL if you sell to consumers

Convert your Instagram to a Business or Creator account and link it to a Facebook Page.

Two minutes. Nothing publishes or captures inbound without it.

## Costs, so nothing surprises you

| What | When | Cost |
|---|---|---|
| Claude paid plan | Now | Monthly |
| Domain, if needed | Now | Roughly 15 USD/year |
| Apollo, B2B only | Session 3 | Free. Works with Gmail and Google Workspace. On Microsoft 365 you will send by hand instead, which costs nothing and works fine at 25 messages |
| GoHighLevel Starter | Setup clinic, 23 September | 97 USD/month plus usage |

GoHighLevel is your CRM, your social publishing and your automation. Required for both tracks. Pay for it at the clinic rather than starting a trial, because a trial will expire during the weekend.

## Where the work lives

Everything the plugin produces goes into a folder called `growth-engine`.

**Pick one folder on your computer and always open that same folder**, whether you are in Cowork or Claude Code. If you open a different folder each time, your work will be scattered and you will not find it in Atlanta.

## Stuck

Post in the Slack channel. Do not wait for the session.
