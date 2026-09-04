# Manual verification checklist

`npm run test` covers the domain logic (classification, rules, CSV, templates,
email HTML, MIME, draft preparation). This file covers everything that needs a
real file, a real account, a window, or macOS permissions.

Mail drafts have their own, longer checklist: **[VERIFY-MAIL.md](VERIFY-MAIL.md)**.

## Data

- [ ] **First run** — with no settings yet, the app opens the storage picker.
      *Choose CSV…* accepts an existing file; *Create a new one…* writes a file
      containing only the 22 column headers.
- [ ] **Real CSV via iCloud Drive** — point the app at a copy of the real list.
      Venue count matches. For the same date, the status badges match what the
      web app shows for the same venues.
- [ ] **Edit → Save → inspect** — change a few fields, press Save, confirm the
      diff table lists exactly those changes, then open the file in a text
      editor: still semicolon-delimited, same header row, no `_`-prefixed
      columns, `\n` line endings, umlauts intact.
- [ ] **Reload** — press ↻; the edits are still there, read back from the file.
- [ ] **Conflict guard** — with the app open, edit the CSV in another editor and
      save it. Then make an edit in the app and press Save: it should refuse
      with "the file changed on disk" and offer *Overwrite anyway*.
- [ ] **GitHub adapter** — Settings → Storage → GitHub, on a throwaway repo with
      a test CSV and a token. Load, edit, Save, then confirm the commit landed
      with the right content. Restart: the token is still stored (keychain) and
      no token appears anywhere in `settings.json`.
- [ ] **Export** — Settings → Data → Export CSV writes a copy to the chosen
      location, byte-identical in format to the source.
- [ ] **Import wizard** — feed it a **comma**-delimited CSV with differently
      named headers. The wizard should auto-map most columns via its aliases;
      fix the rest by hand, import as *add*, and confirm the new rows appear as
      unsaved additions that only reach the file on Save.

## Rules

- [ ] Settings → Rules → set **Next batch size** to 3. The Next-batch chip count
      drops to 3 immediately, without a reload.
- [ ] Add a hold keyword that appears in one venue's Note. That venue flips to
      **On Hold**, and the keyword shows up in the ⓘ Logic modal's keyword list.
- [ ] Enter something invalid (batch size 0). Save is blocked, the Rules entry
      in the sidebar gets a red dot, and the reason is shown inline.
- [ ] *Reset rules to defaults* restores the original values and only those —
      bands, storage and languages are untouched.
- [ ] Relaunch: the customised rules are still in effect.

## Map and geocoding

- [ ] Switch to Map view: pins appear immediately from the bundled seed cache,
      with no network delay.
- [ ] Add a venue in a city not in the cache. Its pin appears within a second or
      two, and after relaunching the app it appears instantly (it was cached).

## Appearance

- [ ] Settings → General → Light / Dark / System. The whole window follows,
      including the table, modals and the map controls.
- [ ] The theme survives a relaunch, and is not written into `settings.json`
      (it is deliberately a per-Mac preference).

## Templates

- [ ] Settings → Templates → *Manage email templates…* → create a `de` and an
      `en` template for one band, each with `{{venue}}` in the subject and
      `{{contact}}` in the body.
- [ ] Insert an image; it renders in the editor and in the preview.
- [ ] The preview's venue picker: choosing a **German** venue resolves to `de`,
      a **UK** venue to `en`, and the fields substitute correctly. A venue with
      an empty field shows the "Empty for this venue" warning.
- [ ] Duplicate a template, change its language, save; both appear grouped under
      the band with their language chips.
- [ ] Relaunch: templates and their images are still there.

## Mail drafts

See **[VERIFY-MAIL.md](VERIFY-MAIL.md)** — connection test, single draft, bulk
run, the AppleScript fallback, and the error messages. The one thing to check
above all others:

- [ ] Creating a draft leaves **`Last emailed` unchanged** and stages no edits.

## Window and menu bar

- [ ] Drag the window by its title bar; resize it from every edge and corner.
- [ ] Do both again with **Settings** open — a full-screen modal must not make
      the window feel stuck.
- [ ] ⌘Q quits, ⌘W closes the window, ⌘M minimises, ⌘, opens Settings,
      ⌘T opens the templates manager.
- [ ] The in-app ⚙ button still opens the same Settings panel.
- [ ] **Booking → Check for Updates…** reports either "up to date" or an
      available version with a working Download button. With Wi-Fi off it says
      it could not reach GitHub rather than hanging.
- [ ] Settings ▸ General shows the running version and its own update button.

## Venue types

- [ ] The Type column is a dropdown. Pick `festival`, and after saving the row
      classifies as *Festival (not now)* or *Send* depending on the window.
- [ ] Pick **+ Add new type…**, enter a name: it is written into the cell,
      appears in Settings ▸ Venue types, and survives a relaunch.
- [ ] A venue whose Type is something not in the managed list still shows that
      value, and it stays selectable in the dropdown.
- [ ] Removing a type in Settings changes no venue's data.
- [ ] Type is also a dropdown in the venue detail modal and the bulk-edit bar.

## Template editor

- [ ] Type three lines in the body: the spacing in the editor matches the
      preview pane and is single-spaced, not doubled. Pressing Enter twice makes
      one blank line, and that blank line survives into the draft.
- [ ] The bullet-list button is gone; a template that already had a bullet list
      still renders one.
- [ ] Select some text → 🔗 (or ⌘K) → enter a URL: the link is applied, shows in
      the preview, and clicking 🔗 again pre-fills it. Submitting an empty field
      removes it; Cancel changes nothing. Typing `example.com` produces
      `https://example.com`.
- [ ] With nothing selected the 🔗 button is disabled rather than silently doing
      nothing.
- [ ] ▶ asks for a YouTube URL, fetches the thumbnail, and inserts it at roughly
      the size Apple Mail gives its own link previews. A Vimeo URL is refused
      with a readable message.
- [ ] The thumbnail arrives in the actual draft as an inline image (not a broken
      remote one) — see VERIFY-MAIL.md.

## Contact fallback

- [ ] Settings ▸ Templates: set the German fallback to `{{venue}} Team`.
      Preview a German venue **with no Contact** — the greeting reads
      "Kulturzentrum Team", and the "Empty for this venue" warning no longer
      lists `{{contact}}`.
- [ ] Switch to *First name only* and preview a venue whose contact is
      "Anna Müller": the greeting says "Anna".
- [ ] Clear a language's fallback: that language goes back to the old behaviour
      (empty, and flagged in the preflight).

## Packaged build

Artifacts land in `~/Builds/booking_app_mac/`, not in the repo — see
`electron-builder.yml` for why. `export BUILD=~/Builds/booking_app_mac` first.

- [ ] `npm run dist` — the build log shows `adhoc-sign  ad-hoc signature applied`.
- [ ] `codesign -dv --verbose=4 "$BUILD/mac-arm64/Booking.app"` reports
      `Signature=adhoc`, and `codesign --verify --deep --strict` is silent.
- [ ] Fake a download locally and confirm it does **not** say "damaged":

      ```sh
      rm -rf /tmp/Booking.app && cp -R "$BUILD/mac-arm64/Booking.app" /tmp/
      xattr -w com.apple.quarantine "0081;00000000;Safari;" /tmp/Booking.app
      open /tmp/Booking.app
      ```

- [ ] Publish a release (docs/RELEASING.md), then **download the DMG from
      GitHub** — the download is what applies the real quarantine flag — and
      install it on a **different** account or Mac.
- [ ] First launch: right-click → Open (see the README's install section). The
      storage picker appears.
- [ ] Data lands in `~/Library/Application Support/Booking/` —
      `settings.json`, `geo_cache.json`, `templates/`.
- [ ] The map has pins on first launch, proving the seeded `geo_cache.json` was
      found inside the packaged app.
- [ ] Secrets: after rebuilding with the *same* bundle identity, stored tokens
      still work. (Changing `appId` invalidates them — see the README.)
