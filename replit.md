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

The Replit Postgres database is connected and the schema has been applied automatically. The
app starts safely without user credentials, but sign-in remains unavailable until:

1. Add `OWNER_PASSPHRASE` in Replit Secrets. Use at least 12 characters.
2. Open the app and sign in.
3. Add the founder's Anthropic API key on the in-app Setup screen.

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