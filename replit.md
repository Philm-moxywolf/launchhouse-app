# Replit setup

## Run

This project runs as one Fastify process. The `Start application` workflow uses:

```bash
npm run start
```

It listens on port 5000 and serves both the API and the built React app. The `prestart`
script builds `dist/web` when the browser bundle is not already present. The server applies
database migrations at boot.

The project requires Node 22. Dependencies are installed from `package-lock.json`, and the
vendored `vendor/growth-engine` content is already present in this copy.

## First run

This file was written against the original workspace, where a database was already attached.
**A copy brought in from GitHub does not inherit that.** It gets a fresh, empty database and
no connection to the original, so the first step below is a real step and not a formality.
The same was true of a remix, which is how founders used to take their copy.

The app starts safely with all of this missing. It serves a page headed "Start here" that
names whatever is not done yet and what to do about each one, so nothing here has to be
memorised. Sign-in stays unavailable until:

1. Open the Database pane and create a Postgres database. Replit fills in `DATABASE_URL`
   itself. The app applies its own migrations at boot, so there is nothing to run by hand.
2. Add `OWNER_PASSPHRASE` in Replit Secrets. Use at least 12 characters. This is the only
   way into the app and it is not something the app asks you to invent on screen.
3. Open the app and sign in.
4. Add the founder's Anthropic API key on the in-app Setup screen.

Do not place vendor credentials in process-level environment variables. The app stores
founder-specific credentials in its database instead.

## Useful commands

```bash
npm run start       # production-style server used by the workflow
npm run dev         # watched Fastify server
npm run build       # typecheck and build the browser bundle
npm run typecheck   # typecheck server and browser
npm test            # run the Node test suite
```

The checked-in project currently builds and typechecks successfully. The full test command
still reports two existing failures in the deployment probe and timezone pin tests; those are
not part of the Replit runtime setup.