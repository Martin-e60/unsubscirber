# Tidely

*A tidier inbox, effortlessly.*

Finds every newsletter, promotion and mailing list buried in a Gmail inbox and
lets you keep, roll up or unsubscribe from them in bulk.

The interface follows the Tidely brand sheet. Every colour, size and radius
lives in one file — see [DESIGN.md](./DESIGN.md) for how to change the look
without touching any logic.

---

## Getting it running

### 1. Install

```bash
npm install
```

### 2. Get Google credentials

The app talks to Gmail on the user's behalf, so Google has to know about it.

1. Go to <https://console.cloud.google.com/> and create a project.
2. **APIs & Services → Library** → search for **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name and your email
   - **Scopes**: you can leave this empty here; the app requests what it needs
   - **Test users**: add your own Gmail address (required while the app is
     unverified — without this Google will refuse to sign you in)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorised redirect URIs**, add exactly:
     ```
     http://localhost:3000/api/auth/google/callback
     ```
5. Copy the **Client ID** and **Client secret**.

### 3. Configure

```bash
cp .env.example .env
```

Fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then generate the two
secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it twice — once for `SESSION_SECRET`, once for `ENCRYPTION_KEY`. They must
be different.

### 4. Create the database

```bash
npm run db:push
```

This creates `local.db`, a SQLite file. Nothing to install.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, connect Gmail, and scan.

### Want to see the UI without connecting Gmail?

Skip step 2 entirely — the Google keys can stay blank — and instead run:

```bash
npm run db:seed
```

Then `npm run dev`, open <http://localhost:3000>, and click
**"Skip sign-in and use demo data"** on the landing page.

The seed fills the database with a realistic mailbox covering every state the
interface has — subscribed, kept, rolled up, unsubscribed, failed, and the
awkward "needs a click" case, plus a history of attempts. Run it again any time
to reset.

Anything that actually talks to Gmail — running a scan, a real unsubscribe —
will fail in this mode, because there is no mailbox behind it. Everything else
works normally.

> The "Skip sign-in" route (`/api/auth/dev`) answers **404 in a production
> build** and the link is never rendered there, so it cannot become a way into
> a deployed instance. It is checked in the test suite.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Runs the test suite |
| `npm run typecheck` | TypeScript, no build |
| `npm run db:push` | Applies schema changes to the database |
| `npm run db:seed` | Fills the database with realistic sample data |
| `npm run db:studio` | Opens a browser UI to inspect the database |

---

## How it works

### Finding subscriptions

Scanning does **not** read the contents of your email. It asks Gmail for
message *headers* only, which is both far faster and far cheaper in API quota.

A message counts as a subscription when it carries one of these headers:

- `List-Unsubscribe` — the standard way senders advertise how to leave
- `List-Id` — mailing lists
- `Precedence: bulk` — older bulk mail

Messages from one address are collapsed into a single **sender** row with a
running count, the newest subject line as a preview, and whichever unsubscribe
methods were found.

Scans run **one page at a time, driven by the browser**: the server processes
about 100 messages per request and returns a cursor. This means no request ever
runs long enough to time out on a serverless host, the progress bar reflects
real work, and closing the tab pauses a scan instead of losing it — reopening
the dashboard resumes exactly where it stopped.

### Unsubscribing

Each sender can be **kept**, **rolled up** (bundled into a digest) or
**unsubscribed** from.

Senders offer several ways out and they are not equally trustworthy, so the
engine tries them in order of certainty:

| Order | Method | What happens | Counts as done? |
| --- | --- | --- | --- |
| 1 | **One-click** (RFC 8058) | A single `POST`. The standard guarantees no confirmation step. | Yes, on any 2xx |
| 2 | **Link** | The `https` URL from `List-Unsubscribe` is fetched. The response is read for wording like *"you have been unsubscribed"*. | Only if the page says so |
| 3 | **Email** | An unsubscribe email is sent from your own address to the `mailto:` target. | Yes |
| 4 | **Link in message** | No headers at all, so the last message body is scraped for an unsubscribe link and treated like #2. | Only if the page says so |

When a link needs a human click that the app cannot perform, the sender is
marked **Needs a click** and the URL is handed back to you rather than being
reported as a success. Every attempt — including failures — is written to the
history table, so nothing is silently swallowed.

### Safety

- Google refresh tokens are **AES-256-GCM encrypted** before they touch the
  database. A leaked database file is not a leaked mailbox.
- The session cookie is a signed JWT holding only a user id — no tokens, no
  email address.
- Unsubscribe URLs come from strangers, so every outbound fetch is guarded:
  http/https only, every redirect hop re-checked, private and link-local IP
  ranges refused (including the cloud metadata endpoint), a hard timeout, and a
  capped response read.
- OAuth uses a `state` parameter checked against an httpOnly cookie.

---

## Project layout

```
src/
  app/                    Next.js routes
    page.tsx              Landing / sign-in
    dashboard/            Home: stats and quick cleanup
    cleanup/              Triage what's left, and run scans
    senders/              Every sender, searchable
    rollups/              Senders bundled into a digest
    unsubscribed/         Lists you've left, plus attempt history
    settings/             Mailbox, permissions, disconnect
    api/                  All server endpoints
      auth/dev/           Development-only sign-in (404 in production)

  components/             Presentation only — no fetching, no business rules
    AppShell.tsx          Sidebar + top bar + shared session/stats context
    SenderWorkspace.tsx   The list screen, reused by four pages
    ui/                   Button, Select, Checkbox, Badge, Avatar, Notice…

  hooks/                  All client state and data fetching
    useSession.ts         Who is signed in
    useScan.ts            Drives the scan loop
    useSenders.ts         List, filter, search, selection
    useUnsubscribe.ts     Runs unsubscribes with limited parallelism
    useStats.ts           The Home screen's headline numbers

  lib/
    mail/
      provider.ts         The MailProvider interface — the seam for Outlook
      gmail.ts            Gmail REST implementation
      headers.ts          List-Unsubscribe and From parsing (pure, tested)
      tokens.ts           Access-token refresh
    scan/engine.ts        Chunked scanning and sender merging
    unsubscribe/
      engine.ts           Method selection and execution
      safe-fetch.ts       SSRF-guarded outbound fetch
      confirmation.ts     "Did the page actually confirm?" (pure, tested)
    google/oauth.ts       The OAuth dance, by hand with fetch
    api/                  Route helpers, stats, and the server/client contract
    crypto.ts             Token encryption
    constants.ts          Every status value in the app

  db/
    schema.ts             The database schema. No code generation.

  styles/
    tokens.css            Every colour, size and radius  ← start here to restyle
    globals.css           Reset and base styles

scripts/seed.mts          Sample data for looking at the UI
tests/                    Run with `npm test`
```

### Adding Outlook later

Nothing above `src/lib/mail/` knows Gmail exists. To add another provider:

1. Write `src/lib/mail/outlook.ts` implementing `MailProvider`.
2. Add a `case "outlook"` to `getProviderForAccount()` in `src/lib/mail/index.ts`.

The scan engine, the unsubscribe engine, every API route and the entire UI stay
as they are.

---

## Deploying

The database is the only thing that needs a decision.

**Vercel + Turso** (easiest — still SQLite):

1. Create a database at <https://turso.tech>, copy its URL and auth token.
2. Set `DATABASE_URL` (`libsql://…`) and `DATABASE_AUTH_TOKEN` in Vercel.
3. Set `APP_URL` to your real domain, and add
   `https://your-domain/api/auth/google/callback` to the authorised redirect
   URIs in Google Cloud Console.

**Postgres instead:** change the driver in `src/db/index.ts` to
`drizzle-orm/node-postgres` and the `dialect` in `drizzle.config.ts`. The schema
and every query stay identical.

Note that `local.db` is a file on disk, so it does **not** work on Vercel's
serverless filesystem — you need one of the two options above.

---

## Known limits

- **Rollups are only half built.** Choosing "Roll up" marks the sender and
  collects it on the Rollups page, but nothing sends the digest yet. That needs
  a scheduler and outbound mail — the marking is real, the delivery is not, and
  the Rollups page says so rather than implying otherwise.
- **Gmail only.** The provider seam exists; the second provider does not.
- **One mailbox per user.** The schema already supports several
  (`mail_accounts` is a one-to-many); the API picks the most recent one. Adding
  a mailbox switcher is a UI change plus an `accountId` parameter on the routes.
- **Unverified Google app.** Until you complete Google's verification, only
  addresses listed as test users can sign in, and the consent screen shows a
  warning. That is normal for a project at this stage.
- **Link unsubscribes can only go so far.** The app cannot click a button on
  someone else's confirmation page, which is why "Needs a click" exists rather
  than a false claim of success.
- **"Time saved" is an estimate.** It assumes five seconds of attention per
  email you no longer receive. The figure lives in `SECONDS_SAVED_PER_EMAIL` in
  `src/lib/constants.ts` and is stated in the app's own Settings screen.
