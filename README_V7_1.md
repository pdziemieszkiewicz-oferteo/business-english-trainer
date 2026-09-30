# CEO English Ride Trainer V7.1 — large-lesson synchronization fix

**This is a PATCH for your existing Cloudflare repository and Worker, not a new deployment.**
Keep your current `wrangler.jsonc`, `schema.sql`, `public/server-config.json`, lesson files, and Cloudflare D1 database. No database changes or new Sync Key are needed.

## Why this patch exists

V7.0 incorrectly sent every progress write as a `fetch()` request with `keepalive: true`. Browsers reject keepalive request bodies above 64 KiB, often reporting only `Failed to fetch`. Larger lessons also exceed V7.0's arbitrary 600 KB request cap. This patch removes keepalive and stores large D1 progress records compressed. Existing uncompressed D1 records remain readable.

## Deploy via GitHub web interface

1. **Export progress JSON** from every device containing learning history (especially your phone). Keep separate backups. Do not reset or reinstall the old app.
2. Extract this ZIP locally. It contains exactly five files inside `public/` and `src/`, plus this README.
3. In your existing repository `business-english-trainer-cloudflare`, replace these EXACT paths, retaining the folder structure:
   - `public/app.js`
   - `public/index.html`
   - `public/sw.js`
   - `public/manifest.webmanifest`
   - `src/worker.js`
4. Commit the changes to `main`. GitHub integration should trigger a Cloudflare deployment.
5. **Do not replace or edit `wrangler.jsonc`.** It already contains your correct Worker name and D1 binding. Do not run SQL again.
6. After Cloudflare shows a successful build, open `https://business-english.pdziemieszkiewicz.workers.dev/api/health`. The response should contain `"version":"7.1"` and `"database":"connected"`.
7. Open the app and verify it says `v7.1` in the title. Leave the old application tab open until you have verified the progress. If a previous tab continues to show v7.0, close and reopen it **after** backups are saved.
8. Keep your existing Sync Key and press `Sync now`. On the first synchronization, the app may ask you which history to keep. Export your backup and select deliberately; do not overwrite the phone's Round 9 unless that is your choice.
9. Confirm `Synced` on one device. Open the same lesson and mode on the second device with the same Sync Key, then sync.

## Tests performed

- JavaScript syntax checked with Node.
- Worker tested with a simulated 4,176-phrase R+P lesson (over 1.1 MB uncompressed progress): POST, gzip+D1 storage, GET and exact round-position restoration.
- Revision conflict rejected stale writes in the simulation.
- Worker still successfully reads legacy V7.0 uncompressed records.

Live Cloudflare deployment and actual Samsung browser behavior cannot be verified here. If sync still fails after this upgrade, send a screenshot of the sync message and a screenshot showing the selected lesson/mode. **Never share your Sync Key.**
