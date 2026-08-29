# How to run the deployment probe

Written for somebody who is not a developer. You will not have to understand any of the
output. Your job is to get it on screen and copy it back.

## What this is, and why you are being asked to do it

Before the real app is built, five things have to be known about the machine it will run on.
None of them can be answered from a laptop, because a laptop is not that machine. Guessing
any of the five costs a rebuild later, and one of them costs founders their work.

The probe is a small program that answers all five and prints them on one page in plain
English. It holds no founder data, no keys and no passwords, and it prints no secret. It is
safe to run, safe to leave, and safe to delete.

It takes about twenty minutes, most of which is waiting.

## Before you start

You need:

- Access to the Replit workspace for `launchhouse-app`.
- Permission to create a Deployment.
- About twenty minutes, twice, with a gap between them.

You do not need to write any code. You will change one number, once, and it will be marked
clearly.

## Step 1. Get the code into Replit

If the repository is already open in Replit, skip this.

Otherwise import `launchhouse-app` from GitHub into Replit. It is a private repository, so
Replit will ask you to connect your GitHub account first.

## Step 2. Set up the Deployment

Open the **Deployments** pane and create a new deployment.

Choose **Reserved VM**. Not Autoscale. This matters more than it looks: one of the five
questions is about how long a quiet connection stays open, and Autoscale answers it
differently. Measuring the wrong kind of deployment gives a number that is confidently wrong,
which is worse than no number.

Set these two fields exactly:

| Field | What to type |
|---|---|
| Build command | `npm ci` |
| Run command | `npm run probe` |

The run command is the only thing that makes this the probe rather than the app. Change it
back when you are done.

Leave everything else at whatever Replit suggests.

## Step 3. Set one secret

Open the **Secrets** pane in the workspace, not in the deployment.

Add a secret called `PROBE_SECRET`. For the value, type any random string. `hello-from-the-
workspace-2026` is fine. It is thrown away afterwards and it protects nothing.

**Do not copy it into the deployment's own settings.** That is deliberate. Question three is
whether a secret set here reaches there on its own, and copying it by hand destroys the
answer.

## Step 4. Deploy, then open it

Press Deploy and wait. It takes a few minutes.

When it finishes, open the deployment's URL. You should see a page of plain text starting
with `LAUNCHHOUSE DEPLOYMENT PROBE`.

**Select the whole page, copy it, and paste it back.** That is the deliverable. If it looks
like an unreadable wall of text, that is what it is meant to look like.

## Step 5. Restart, and copy it again

Question one has two halves and the first one needs a restart.

In the Deployments pane, restart the deployment. Wait for it to come back, open the URL
again, and copy the page again.

The page will now say something different under question one. That difference is the answer.

## Step 6. Change one number, redeploy, and copy it a third time

This is the only code change you will make, and it is one digit.

Open `scripts/probe-deployment.ts`. Near the top, about seventy lines down, there is a line
that reads:

```
const BUILD_ID = 1;
```

Change the `1` to a `2`. Save. Redeploy.

When it comes back, open the URL and copy the page one last time.

That is the second half of question one, and after it the page should say `ANSWERED` next to
question one rather than `NEEDS A REDEPLOY`.

## Step 7. The connection test, which is the slow one

Question five measures how long a quiet connection stays open before something cuts it. It
cannot be rushed, because the waiting is the measurement.

Add `/sse-test` to the end of the deployment URL and open it. For example:

```
https://your-deployment-url.replit.app/sse-test
```

You will see a counter. Leave that tab open and go and do something else for fifteen
minutes. You do not need to watch it.

When you come back, one of two things has happened. Either the counter has stopped and the
page says it closed, which is the answer. Or it is still counting, which is also useful and
means the timeout is longer than fifteen minutes.

Then open the main page again and copy it. Question five will now carry a number.

There is a faster way if you would rather not hold a tab open. Set a second secret,
`PROBE_PUBLIC_URL`, to the deployment's own address with no trailing slash, and redeploy. The
probe then measures it by itself while nobody is watching. Fifteen minutes still has to pass
before the page can say anything.

## Step 8. Tidy up

When the answers have been copied back:

1. Delete the `PROBE_SECRET` secret, and `PROBE_PUBLIC_URL` if you set one.
2. Set the deployment's run command back to `npm run start`.
3. Change `BUILD_ID` back to `1` if you want, though it does no harm either way.

## What the page will say, and what to do about it

Each of the six sections carries a status. Only two of them ever need action from you.

| Status | What it means | What to do |
|---|---|---|
| `ANSWERED` | Done. Nothing needed | Nothing |
| `NEEDS A REDEPLOY` | The question needs the machine restarted or redeployed to answer | Steps 5 and 6 |
| `NEEDS ONE ACTION` | One specific thing is missing, and the page says what | Read the two lines under "What it means for the build" |
| `PARTLY ANSWERED` | It got half an answer | Paste it back anyway. Somebody will read it |
| `PROBLEM` | Something is wrong with the machine | Paste it back straight away. Do not try to fix it |

`PROBLEM` is not your fault and it is not an emergency. It is the probe doing its job. Finding
it now is the entire point of running this before anything is built.

## Things people ask

**Will this touch any founder data?** No. There is none yet, and the probe has no database
connection and no ability to make one.

**Will it print my secret?** No. It prints how many characters long it is and a short
fingerprint, which is a scrambled version that cannot be turned back. The value itself never
appears.

**I pasted the page and it is enormous.** That is correct. Paste all of it. The useful part is
often three lines deep in the evidence.

**The page will not load at all.** Open the deployment's Logs pane and copy what is in there
instead. A probe that cannot start is itself an answer, and the logs say why.

**I changed the run command and now the app does not work.** Set it back to `npm run start`.
The probe and the app are the same repository with two different run commands.

## What the probe cannot tell you

Worth saying plainly, so nobody reads more into the page than is there.

It cannot tell you whether the app works. It does not run the app.

It cannot tell you whether GoHighLevel or Apollo behave. Those need a real account and a
different test.

It cannot tell you how much memory a founder session uses. That needs the real agent loop
running, and it is measured later.

It cannot answer question five at all until somebody has left a connection open. Fifteen
minutes of nobody doing anything is the test.

Run steps 1 to 4 first, paste back what you get, and stop there if you want. The rest can
happen the next day.
