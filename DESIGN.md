# Working on the design

The app is built so the look can be changed without touching any logic. This
file is the map.

## The one rule

**Logic never lives in a component, and styling never lives outside CSS.**

- Every component in `src/components/` receives data through props and reports
  clicks through callbacks. None of them fetch, decide, or store anything.
- Everything that fetches or decides lives in `src/hooks/` and `src/lib/`.

So a component can be restyled, restructured, or thrown away and rebuilt, and
nothing else in the app breaks — as long as it still takes the same props.

---

## See every screen in 30 seconds

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

Then open <http://localhost:3000> and click **"Skip sign-in and use demo
data"**.

Before the first run, fill in the two secrets in `.env` — generate each with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
The **Google keys can stay blank**: the "Skip sign-in" button exists precisely
so design work needs no Google account. (That button is development-only; the
route behind it returns 404 in a production build.)

`db:seed` fills the database with a realistic mailbox covering **every** state
the interface has. Run it again any time to reset.

Scanning and real unsubscribes will fail in this mode, since there is no
mailbox behind the demo account. Every screen still renders.

---

## Start here: `src/styles/tokens.css`

Every colour, font size, spacing step, radius and shadow in the product is a
CSS variable defined in that one file. No component contains a hex code or a
hard-coded pixel value.

The Tidely palette is already in place:

```css
:root {
  --color-primary: #7065f0;        /* buttons, active nav, links */
  --color-primary-hover: #6257df;
  --color-primary-soft: #eeecff;   /* soft purple — "Roll up", active tab */
  --color-success: #56c9a3;        /* "Keep" */
  --color-success-soft: #e8f8f2;
  --color-danger: #f47d75;         /* coral — "Unsubscribe" */
  --color-danger-soft: #fff0ee;
  --color-bg: #f7f8fc;             /* page background */
  --color-surface: #ffffff;        /* cards, rows, sidebar */
  --color-text: #20212a;
  --color-text-subtle: #a4a7b3;    /* muted */
}
```

> **One value to check.** The brand sheet's *Background* hex was too small to
> read reliably in the exported image, so `--color-bg` is set to the colour
> sampled from the swatch itself (`#f7f8fc`). If the design file says something
> different, change that one line — nothing else depends on it.

Dark mode is the same variable names with different values, in the
`@media (prefers-color-scheme: dark)` block at the bottom of the file. If you
add a new colour, add it to both blocks and the app follows automatically.

### Type

Manrope is loaded from `@fontsource-variable/manrope`, imported once in
`src/app/layout.tsx`. It is self-hosted — no request to Google, no layout
shift, and it works offline. Weights 200–800 all come from a single variable
font file. To change typeface, install a different `@fontsource` package,
change that import, and update `--font-sans`.

### Icons

[Lucide](https://lucide.dev) (`lucide-react`), which matches the outline style
on the brand sheet. Import the icon you want and set `size` and `strokeWidth`
— the app uses `strokeWidth={1.75}` throughout.

---

## The screens and the files behind them

| Screen | Component | Its stylesheet |
| --- | --- | --- |
| Landing / sign-in | `src/app/page.tsx` | `src/app/page.module.css` |
| Sidebar | `src/components/Sidebar.tsx` | `Sidebar.module.css` |
| Top bar (search, account) | `src/components/TopBar.tsx` | `TopBar.module.css` |
| Overall signed-in layout | `src/components/AppShell.tsx` | `AppShell.module.css` |
| Home | `src/components/HomeView.tsx` | `HomeView.module.css` |
| Stat card | `src/components/StatCard.tsx` | `StatCard.module.css` |
| Quick cleanup panel | `src/components/QuickCleanup.tsx` | `QuickCleanup.module.css` |
| Scan box | `src/components/ScanPanel.tsx` | `ScanPanel.module.css` |
| Filter tabs, search, bulk bar | `src/components/SenderToolbar.tsx` | `SenderToolbar.module.css` |
| The list | `src/components/SenderList.tsx` | `SenderList.module.css` |
| **One row in the list** | `src/components/SenderRow.tsx` | `SenderRow.module.css` |
| Result bar after unsubscribing | `src/components/ResultSummary.tsx` | `ResultSummary.module.css` |
| Attempt history | `src/components/HistoryList.tsx` | `HistoryList.module.css` |
| Settings | `src/components/SettingsView.tsx` | `SettingsView.module.css` |
| Page title block | `src/components/PageHeader.tsx` | `PageHeader.module.css` |

Shared building blocks are in `src/components/ui/`: `Button`, `Select`,
`Checkbox`, `Badge`, `Avatar`, `ProgressBar`, `Notice`, `EmptyState`.
Restyling `Button.module.css` restyles every button in the product.

**Cleanup, Senders, Rollups and Unsubscribed are all the same component** —
`SenderWorkspace.tsx` — with different starting filters. Change it once and all
four pages follow.

The landing page (`src/app/page.tsx`) is the most likely file to be replaced
wholesale. The only thing it must keep is the link to
`/api/auth/google/start` — that is what starts the Google login.

### Sender avatars

`ui/Avatar.tsx` draws a rounded square with the sender's initial, tinted from a
hash of the name so a sender always gets the same colour. The brand sheet shows
real logos; to use them, swap the contents of that one component for an `<img>`
and nothing else changes.

---

## Wording

All user-facing status wording is in one file,
`src/components/senderStatus.ts`:

```ts
export const STATUS_LABEL = {
  ACTIVE: "Subscribed",
  KEPT: "Keeping",
  ROLLED_UP: "Rolled up",
  UNSUBSCRIBING: "Working…",
  UNSUBSCRIBED: "Unsubscribed",
  FAILED: "Failed",
  MANUAL: "Needs a click",
};
```

Change the copy there and it changes everywhere, including the filter tabs.
This is also where a translation would start.

---

## The states a design has to cover

Easy to forget when designing from one full-looking mockup. Every one of these
already exists in the code, and `npm run db:seed` gives you most of them at
once:

1. **Signed out** — the landing page.
2. **Signed in, never scanned** — empty list, "Nothing scanned yet".
3. **Scanning** — progress bar, live message and sender counts, a Stop button.
4. **Loading the list** — shimmering skeleton rows.
5. **The list** — the normal case.
6. **A row in every status** — Subscribed, Working…, Unsubscribed, Keeping,
   Rolled up, Failed, and Needs a click (which also shows a "Finish" link out).
7. **Some rows selected** — the bulk action bar appears with a count.
8. **After a batch** — the result summary ("4 unsubscribed, 1 needs a click").
9. **Errors** — a coral bar above the list.
10. **An empty filter tab** — e.g. Failed with nothing in it.
11. **A brand-new account** — stat cards show `—` and no deltas, because there
    is genuinely nothing to compare against yet.

---

## Rules worth keeping

Accessibility and layout behaviours already in place. Keeping them costs
nothing; losing them is a real regression.

- **Focus rings.** `:focus-visible` in `globals.css` gives every control a
  visible keyboard focus ring. Replace the look if you like, but don't remove it.
- **Hidden labels, not missing labels.** Icon-only controls use a `.srOnly`
  class so screen readers still announce them. Keep the element, style it away.
- **Reduced motion.** `globals.css` disables animation for users who ask their
  OS for that. Any new animation inherits this automatically.
- **Tabular numbers.** Counts use `font-variant-numeric: tabular-nums` so
  columns don't jitter.
- **Text truncation.** Sender names, addresses and subjects truncate with an
  ellipsis rather than wrapping, which keeps rows a predictable height.
- **The list is a real `<ul>` of `<li>`s.** Keep the semantics.
- **Responsive breakpoints**, all in the stylesheets:
  - `64rem` — the sidebar drops its labels and becomes an icon rail; sender
    rows move their buttons to a second line.
  - `44rem` — the sidebar becomes a bottom tab bar; sender rows go to three
    lines so nothing has to truncate.

---

## If you'd rather use Tailwind

Nothing stops you. The components are plain JSX with `className` values — swap
the CSS modules for utility classes component by component, and keep
`tokens.css` as the source of the palette so both approaches agree. Do it
incrementally; nothing in the logic layer cares either way.
