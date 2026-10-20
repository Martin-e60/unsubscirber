# Tidely

A Gmail cleanup app built with Next.js, React and TypeScript. Review mailing
lists, keep the senders you want, request unsubscribes, and organise existing
messages. Confirmed removals, requests sent and manual steps are shown separately.

## Run the sample demo

Use Node.js 24 (see `.nvmrc`) and npm. Node.js 22.12 or later is also supported.

```sh
npm ci
npm run dev
```

Open [localhost:3000/demo](http://localhost:3000/demo). The demo runs the app's
screens against sample data in your browser. It needs no Google credentials,
connected mailbox or database setup and sends no email. Reset demo restores the
sample state.

## Connect a real Gmail account

1. Copy `.env.example` to `.env` and set `APP_URL` to your app's origin.
2. Generate **two separate** keys with the command below. Set `SESSION_SECRET`
   and `ENCRYPTION_KEY` to one each.
3. Create a Google OAuth web client, enable the Gmail API, configure the consent
   screen and add your Google account as a test user while the app is in testing.
4. Register `${APP_URL}/api/auth/google/callback` as the authorised redirect URI,
   then fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Run `npm run db:migrate`, start the app and sign in.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

SQLite uses `file:./local.db` locally. For a hosted deployment, set `DATABASE_URL`
and `DATABASE_AUTH_TOKEN` for Turso in the hosting environment, then apply the
committed migrations to that database. Database commands load `.env*` with the
same precedence as Next.js. Existing process variables take priority.

Reading mail and organising it use different Gmail permissions. Clear out asks
for the additional modify grant when needed. Password recovery uses Resend when
`RESEND_API_KEY` and `EMAIL_FROM` are configured; development reset emails go to
the server log.

## Commands and checks

- `npm run check` — TypeScript, unused files/dependencies and the test suite.
- `npm run build` — production compilation and prerendering.
- `npm start` — serve the production build.
- `npm run db:generate` — generate a migration after a schema change.
- `npm run db:migrate` — apply committed migrations.
- `npm run db:studio` — inspect the configured database locally.
- `npm run db:push` — directly synchronise a disposable development database.
- `npm run db:seed` — replace the local development account's sample data.

Use `/demo` for UI development. The optional seed requires keys and a migrated
local database; `/api/auth/dev` opens its development account. Both seeding and
development sign-in refuse production. Seed data has placeholder Gmail tokens,
so real Gmail operations fail on that account.

GitHub Actions runs the checks, production build and a production dependency
audit for pull requests and pushes to `main`. Tests use isolated fixtures and
mock external mail requests; they do not need Google credentials or a live mailbox.

## Code map

```text
src/app/          Next.js pages and API route handlers
src/components/   UI grouped by feature; shared controls in ui/
src/hooks/        Client state and API workflows
src/lib/api/      Typed clients, response helpers and request scoping
src/lib/auth/     Authentication and password recovery
src/lib/mail/     Gmail provider, metadata and token management
src/lib/mailbox/  Mailbox ownership, selection and connection lifecycle
src/lib/scan/     Resumable scanning and transactional sender updates
src/lib/unsubscribe/  Unsubscribe methods and guarded outbound requests
src/lib/clearout/ Message filters and organising actions
src/lib/demo/     Browser-only sample implementation of the API contract
src/db/           SQLite schema and connection
drizzle/          Committed migrations and snapshots
tests/            Behaviour and integration tests
```

Keep route handlers small: validate input, resolve the user and mailbox, then
call a library operation. Mailbox operations must use the request's mailbox
scope; switching mailboxes cancels the previous client's work. Keep server-only
code out of client imports. TypeScript rejects unused declarations, and Knip
checks unreachable source files and unused dependencies.

Schema changes belong with a reviewed SQL migration. Keep older migration files,
redirect routes and the retired Rollups recovery page: they support existing
databases and saved links. New features should not create new rollup decisions.

## Maintenance notes

OAuth tokens are encrypted with `ENCRYPTION_KEY`; keep that key stable for an
existing database. Do not commit environment files, database files or logs.
Outbound unsubscribe requests validate public addresses and each redirect target,
limit response size and have a deadline. These hostname checks are not DNS
pinning; production infrastructure should also restrict private-network egress.

The production dependency audit is clean after the maintenance update. The full
audit still reports the development-only `drizzle-kit` → `@esbuild-kit/esm-loader`
→ `esbuild` chain. Track its upstream fix; `npm audit fix --force` currently
proposes a breaking Drizzle downgrade. Check with `npm audit` when updating tools.

Local checks cover compilation, sample UI behaviour and isolated server logic.
Live Google OAuth, Gmail permissions and hosted database connectivity also need
verification in the deployment environment.
