# Booking

A Mac app for running music-venue booking outreach. It reads and writes one
semicolon-delimited CSV of venues, works out who is due to be contacted, and
creates personalised drafts in Apple Mail.

It is a port of an internal React web app, rebuilt so it runs on any Mac without
the private repositories, tokens and servers the original depended on.

## Download

**[Download the latest release →](https://github.com/floherzog/booking_app_mac/releases/latest)**

Take `Booking-<version>-arm64.dmg` for Apple Silicon or `Booking-<version>-x64.dmg`
for an Intel Mac, and drag Booking into Applications.

> **The first launch has to be approved once.** The app is ad-hoc signed but not
> notarised, so macOS blocks it with *"Apple could not verify Booking is free of
> malware"*. Double-click it, let it be blocked, then go to **System Settings →
> Privacy & Security**, scroll to the bottom, and press **Open Anyway**.
>
> Right-click → Open used to do this in one step, but **Apple removed that
> bypass in macOS 15**; on Sequoia and later, Privacy & Security is the only way
> through. If you would rather not deal with it at all,
> `xattr -cr /Applications/Booking.app` in Terminal removes the quarantine flag
> and the app opens normally from then on.

> **The first launch can be slow — minutes, not seconds.** Before macOS runs an
> app it has never seen, it scans the whole bundle, and Booking is a ~300 MB
> Electron app. On a slower Mac that scan has taken **ten minutes of bouncing in
> the Dock** before the window appeared; it only happens once, and every launch
> afterwards is instant. `xattr -cr /Applications/Booking.app` before the first
> launch skips it. Also make sure you took the right build: running the **x64**
> DMG on an Apple Silicon Mac makes macOS translate the whole app through Rosetta
> on first launch, which is slow for the same reason and stays slower afterwards.

Afterwards, **Booking → Check for Updates…** tells you when there is a newer one.

## What an update keeps

Updating means replacing `Booking.app` in Applications. Nothing you own lives
inside the app bundle, so nothing is lost:

- **Your CSV** is wherever you put it. Untouched.
- **`settings.json`** — rules, bands, templates options, mail settings, storage
  choice — lives in `~/Library/Application Support/Booking/` and is read by the
  new version. New settings appear with their defaults; old ones are kept.
- **Templates and their images** live in the same folder.
- **The GitHub token and mail password** stay in the keychain. Because the app is
  ad-hoc signed, each build is a *different* app as far as the keychain is
  concerned, so macOS may ask once after an update whether Booking may use them —
  answer **Always Allow**. (A Developer ID signature would remove that prompt.)

## What it does

- **Classifies every venue** — Send, Follow-up due, Waiting, Recently played,
  On hold, Festival (not now), Missing info, Dead — from the dates and notes in
  your CSV, and picks the next batch to contact.
- **Every rule is editable.** The thresholds that decide all of the above are
  yours to change, and the app re-classifies as you change them.
- **Email templates per band and language**, with light rich text, inline
  images, and `{{placeholders}}` filled in per venue.
- **Drafts straight into Apple Mail**, one venue at a time or in bulk — or send
  for real over SMTP, now or at a scheduled time, with the `Auto` column
  deciding per venue.
- **Map view** of your venues, with offline-seeded coordinates.

## Building it yourself

Requires Node 20+ and macOS.

```sh
npm install
npm run dev      # run the app with hot reload
npm run test     # unit tests
npm run build    # compile main, preload and renderer into out/
npm run dist     # build ad-hoc signed .dmg (arm64 + Intel) and .zip
                 # into ~/Builds/booking_app_mac (outside iCloud — see below)
```

Other scripts:

```sh
npm run check:drift   # diff src/core against the original web app (informational)
npm run verify:csv    # prove the CSV format is still byte-compatible with it
```

On first launch the app asks where your venue list lives.

## Where your data lives

The CSV is the only file that matters — it is the interchange format, and it
stays byte-compatible with the original web app and the booking scripts:
semicolon-delimited, one header row, `\n` line endings, 22 fixed columns.

Everything else sits in `~/Library/Application Support/Booking/`:

| File | What it holds |
| --- | --- |
| `settings.json` | storage choice, rules, bands, languages, mail settings, draft log |
| `secrets.json` | GitHub token and mail password, encrypted (see below) |
| `schedule.json` | scheduled bulk runs, with their rendered messages |
| `geo_cache.json` | city → coordinates, seeded from the bundled snapshot |
| `templates/` | `templates.json` plus `assets/` for inline images |

### Storage adapters

**Local CSV file** (default) — pick any file with the native picker. Put it in
iCloud Drive to have it on all your Macs.

> Importing a CSV only fills the table; the file you imported is not
> automatically the file the app saves to. When you import as *Replace the
> table*, tick **"Use this file as my CSV from now on"** to point Storage at it —
> then Save writes back to that file and the app reloads from it next time.

> **iCloud Drive caveat.** Do not edit the same file in two places at once.
> The app records the file's modification time when it loads and refuses to save
> over a file that changed underneath, offering an explicit *Overwrite anyway* —
> but it cannot merge. If iCloud has not finished downloading the file, open it
> in Finder once first.

**GitHub** (optional) — point the app at a repository and path, and give it a
personal access token with `repo` scope. Useful if you also run the web app or
the batch scripts against the same list. The token is stored in your keychain,
never in `settings.json`, and never bundled into the app.

### Secrets

The GitHub token and the mail password are encrypted with Electron's
`safeStorage`, which is backed by the macOS keychain. The renderer never
receives a secret value — only whether one is set. Everything that uses a secret
runs in the main process.

> **Bundle identity caveat.** `safeStorage` keys off the app's identity, so a
> build with a different `appId` (or a differently signed build) cannot decrypt
> secrets written by the previous one. They read as "not set" and have to be
> entered again. Nothing else is lost.

## Rules

**Settings → Rules.** The defaults reproduce the original web app exactly, so a
fresh install classifies identically.

| Rule | Default | Effect |
| --- | --- | --- |
| Default re-contact window | 30 days | Used when a venue has no Frequency of its own |
| Recently played | 365 days | A gig this recent (or upcoming) removes a venue from outreach |
| Hold expires after | 365 days | A hold keyword stops blocking once you last emailed this long ago |
| Festival: too soon if within | 3 months | A festival is bookable only further out than this… |
| Festival: still fresh for | 2 months | …or already further past than this |
| Next batch size | 10 | How many action-needed venues the batch picks |
| Next batch sorted by | Country → City → Venue | Up to three columns, applied in order |
| Hold keywords | 35 German/English phrases | A Note containing one puts the venue On Hold |

"Advanced: date colours" holds the ten thresholds behind the coloured relative
dates in the table. They change how dates are *tinted*, never who gets picked.

The ⓘ **Logic** modal draws the actual decision tree with your current numbers
in it, so it can never fall out of step with the code.

## Email templates

**Settings → Templates.** One template per **band × language**.

A venue's **Country** picks the language through the map in *Settings →
Languages* (seeded with the German-speaking countries under both their English
and German names). Anything unlisted falls back to the default language. If a
band has no template in the resolved language, the app falls back to the default
language and tells you it did.

Placeholders — `{{venue}}`, `{{contact}}`, `{{city}}`, `{{country}}`,
`{{dates}}`, `{{text}}`, `{{band}}` — work in the subject and the body. A field
that is empty for a venue becomes nothing at all, and the app warns you before
you create the draft. Substitution runs on the document structure, not the
rendered text, so a placeholder still works when part of it is bold.

Bodies support bold, italic, underline, lists, links, inline images, and a
"video link" block — a thumbnail wrapped in a link, because no mail client will
play an embedded video.

## Apple Mail drafts

Drafts land in your Drafts mailbox, and creating a draft never touches a venue's
`Last emailed` — a draft is not a sent email. Sending is a separate, explicit
choice; see *Sending, and scheduling a run* below.

### IMAP (recommended)

Exact formatting, no permission prompts, and it works in bulk.

1. **Create an app-specific password.** iCloud rejects your normal Apple ID
   password for IMAP. Go to <https://appleid.apple.com> → *Sign-In and Security*
   → *App-Specific Passwords* → generate one.
2. **Settings → Mail**:
   - Server `imap.mail.me.com`, port `993` (prefilled).
   - Username: your **full** iCloud address, e.g. `you@icloud.com`.
   - Paste the app-specific password (it goes to the keychain).
   - From name and address.
3. **Test connection.** The app lists your mailboxes and preselects the one your
   server marks as Drafts — which is how a German account's `Entwürfe` is found
   without guessing at names.
4. Save.

Then use **Draft in Mail** on any venue, or **✉ Drafts** in the toolbar for a
bulk run: pick a source (next batch, follow-ups due, Draft-flagged, or exactly
what your filters are showing), review the preflight list, and let it work
through them one at a time.

Drafts can take a few seconds to sync into Mail.app.

### Sending, and scheduling a run

The bulk window can also send. Three modes:

| Mode | What happens |
| --- | --- |
| **Drafts only** | The default. Everything lands in Drafts; `Last emailed` untouched. |
| **Auto column decides** | Venues with `Auto` = TRUE are sent, every other venue is drafted. |
| **Send now** | Every selected venue is emailed. |

Sending goes out over SMTP (**Settings → Mail** → SMTP server, prefilled
`smtp.mail.me.com:587`) using the same account and app-specific password as IMAP,
and files a copy in your Sent mailbox. The message is byte-for-byte the one the
draft would have been — the same MIME is built once and either APPENDed or sent.
A run that includes sends needs a second click on the red confirm button, and a
sent venue gets an **unsaved `Last emailed` edit** that reaches the CSV when you
press Save, like every other change.

**At a time…** schedules the run instead. Every message is rendered when you
schedule it, so a template edit afterwards cannot change what goes out, and the
queue is stored in `schedule.json`. Pending runs are listed in the same window
and can be cancelled there.

> A scheduled run only fires **while Booking is running**. One whose time passed
> while the app was closed runs at the next launch rather than being skipped —
> this is an in-app scheduler, not a background agent.

A single venue can also be sent from the **⋯** menu next to *Draft in Mail*.

### AppleScript fallback

For a single draft with no server setup at all: the **⋯** menu next to *Draft in
Mail* → *Open in Mail.app instead*. It puts the styled message on the clipboard,
opens a compose window and pastes.

macOS will ask for two permissions the first time. If you decline, or the prompt
never appears:

- *System Settings → Privacy & Security → Automation* → enable **Mail** and
  **System Events** for Booking.
- *System Settings → Privacy & Security → Accessibility* → add Booking.
- Quit and reopen Booking.

Because it drives Mail's window by keystroke, it is offered for one draft only.
If the body text lands in the subject field, your compose window has a different
tab order — adjust `TABS_TO_BODY` in `src/main/jxa/createMailDraft.js`.

## Installing a shared build

`npm run dist` produces three files in **`~/Builds/booking_app_mac/`**. They are
built outside the repo on purpose: this project lives in iCloud Drive, and the
extended attributes iCloud stamps on every synced directory make `codesign`
refuse to sign the bundle at all.

| File | For |
| --- | --- |
| `Booking-<version>-arm64.dmg` | Apple Silicon — **hand people this one** |
| `Booking-<version>-x64.dmg` | Intel |
| `Booking-<version>-arm64.zip` | Apple Silicon, if a zip is easier to send |

The app is **ad-hoc signed and not notarised**, so the first launch on someone
else's Mac needs one deliberate override. `spctl -a` reporting *rejected* is the
expected state for such a build, not a fault:

- **macOS 15 (Sequoia) and later** — the only supported path: double-click, let
  it be blocked by *"Apple could not verify …"*, then go to *System Settings →
  Privacy & Security*, scroll to the bottom, and press **Open Anyway**.
- **macOS 14 and earlier:** right-click → Open, then *Open* in the dialog.
  Apple removed this bypass in macOS 15, so do not tell a Sequoia user to do it.
- To avoid the prompt altogether, clear the quarantine flag the download added:

  ```sh
  xattr -cr /Applications/Booking.app
  ```

Only **notarisation** removes the warning for everyone without these steps, and
that needs a paid Apple Developer Program membership — see below.

Prefer the DMG when sending a build: a DMG carries one quarantine flag on the
image, whereas an extracted zip flags every file inside it.

> **Why ad-hoc signing is not optional.** An app with *no* signature at all is
> reported by modern macOS as **"file is damaged and can't be opened"** as soon
> as it carries a quarantine flag from a download, with no override offered —
> which is exactly what a shared build used to do. `scripts/adhoc-sign.cjs`
> (an electron-builder `afterPack` hook) applies a `codesign --sign -` signature
> before the dmg/zip is built, which restores the ordinary "unidentified
> developer → Open Anyway" flow. Only notarisation removes the prompt entirely.
> The build fails rather than shipping an app that fails `codesign --verify`.

### Signing and notarising

For a build with no warning at all you need an Apple Developer Program
membership. Set these and run `npm run dist:signed`; the ad-hoc hook stands
aside and electron-builder signs and notarises properly:

```sh
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=....-....-....-....
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:signed
```

Remember that changing the signing identity invalidates stored secrets (see
above) — the first launch afterwards asks for the GitHub token and mail password
again.

## Shipping an update

The app has no auto-updater; **Booking → Check for Updates…** compares the
running version against the latest GitHub release and, if there is a newer one,
opens the download page. See [docs/RELEASING.md](docs/RELEASING.md) for the
steps that publish one.

## Verifying by hand

- [docs/VERIFY.md](docs/VERIFY.md) — the general checklist: data, rules, map,
  templates, packaging.
- [docs/VERIFY-MAIL.md](docs/VERIFY-MAIL.md) — mail drafts, which need a real
  account and macOS permissions.

## How the code is arranged

```
src/
├── core/      pure JS domain logic — no DOM, no Electron, no localStorage
├── main/      Electron main process: settings, secrets, files, GitHub,
│              geocoding, templates, MIME, IMAP, AppleScript
├── preload/   the contextBridge — the renderer never sees ipcRenderer
└── renderer/  React UI
```

`src/core` is the single implementation of the domain: classification, the
rules, the next batch, the CSV contract, template resolution, email rendering.
It has no platform imports and is covered by unit tests.

Anything privileged runs in main and is reached over a fixed list of IPC
channels. Secrets never cross that bridge; geocoding lives there because
Nominatim requires a `User-Agent` header the renderer is not allowed to set.

### Notes for whoever builds this next

- `productName` in `package.json` is what Electron uses for `app.getName()`,
  and therefore for the `Application Support/Booking/` directory. It is not
  redundant with the one in `electron-builder.yml` — remove it and the app
  silently starts storing its data under `booking_app_mac`.
- `resources/icon.icns` was generated from the web app's 192px PNG with
  `sips` + `iconutil`, so the larger sizes are upscaled. Replace it with a
  proper 1024px source when there is one.
- Only `date-fns`, `papaparse`, `imapflow` and `nodemailer` are runtime
  `dependencies` — everything the renderer uses is bundled by Vite, and
  listing it as a dependency would only copy it into the .app for nothing.

### Where this is heading

`src/core` is intended to become a package shared with the original web app,
which would then move into this repository as a second build target: a small
Vite web entry consuming the same `src/core`, swapping the Electron IPC adapters
for the browser ones. The layout — core / main / renderer, a `@core` alias, no
cross-imports — was chosen to make that merge mechanical.

Until then the two are separate copies, so `npm run check:drift` diffs them and
labels the divergences we introduced on purpose (the rules refactor, the removed
server sync) so a genuine one stands out. `npm run verify:csv` round-trips a
fixture through both implementations to prove the file format has not moved.
