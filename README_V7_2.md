# Business English Ride Trainer V7.2 — rating history and custom timings

Patch your **existing Cloudflare-hosted repository** `business-english-trainer-cloudflare`. **Do not create a new Worker or database. No SQL changes. Your existing Sync Key, progress, and D1 records remain valid.**

## Changes

1. Easy/Hard buttons show which was last selected for the CURRENT exercise. Beneath them you see last rating, date/time (for V7.2+ clicks), and lifetime Easy/Hard counts. Older ratings keep their counts and last value, but the old date was never recorded and therefore cannot be reconstructed.
2. All time/repetition parameters have free-form numeric inputs. Accept decimals such as 6.5 s, including 0 for silent periods. Repetition count needs an integer >=1. Speech rate allows 0.1–10×. Settings remain local to the device, just as in V7.1.
3. An in-app Timing guide and the accompanying `TIMING_GUIDE.md` explain exactly what every timer controls in every mode, including repetition behavior and warning-beep coverage.
4. App, manifest, service-worker cache and Cloudflare `/api/health` version now identify V7.2. D1 API, schema and progress storage remain backward-compatible.

## Update via GitHub web UI

**First:** From your current application on both devices, export the progress JSON before deployment, as a precaution. Wait for the devices to show Synced and close/stop their lessons before applying updates.

Replace ONLY these six paths in the same repository, without moving them:

- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `public/sw.js`
- `public/manifest.webmanifest`
- `src/worker.js` (only the health-check version changes)

You may optionally add `TIMING_GUIDE.md` and this README to the repository root.

**DO NOT upload/replace** `wrangler.jsonc`, `schema.sql`, lesson files, `public/server-config.json`, or any user backups. Your live repository has the correct Worker name and D1 database ID. Those files are intentionally omitted from this patch.

Commit changes to `main` and wait for Cloudflare to show successful deployment. Verify your existing `/api/health` endpoint reports version `7.2` and `database: connected`, then open the app and confirm header `v7.2`. Reopen the PWA or refresh normally if an old tab still displays V7.1. Check that the existing Sync Key and learning progress are still present. You do NOT need to generate a new key, and the numeric settings/voices remain device-local.

If editing individual files in GitHub's website, use the file's edit pencil and paste the full contents, or use another source-control client to replace these exact paths. GitHub's 'Upload files' may add files to a folder rather than overwrite existing ones depending on the upload context; check the resulting tree before committing.

## Testing note

The app and Worker JavaScript were syntax-checked; targeted JavaScript unit tests cover numeric validation, zero/decimal values and older/newer rating timestamps; HTML checks cover all editable numeric controls and the in-app timing guide. A headless browser launch was blocked by the test environment, so the UI and real Samsung playback still need live verification after deployment.
