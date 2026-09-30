# Ride Trainer v7.3 — compact controls and end-only audio

This patch updates the existing Cloudflare Worker app. Do not create a new repository, Worker, or D1 database.

Changes:
- Easy / Hard / Ride screen (including last-rating status) moved directly below playback navigation and above the Lesson panel.
- Install app button uses substantially smaller type and tighter padding.
- Pausing no longer displays the redundant “Press Play to continue” instruction. The Paused state and playback controls are unchanged.
- Removed all countdown-start and between-window beeps. The ONLY training tone is one configurable warning before the END of EACH silent interval, including recall/response and all repetition windows, in every mode. Set the warning to 0 for silence. If the pause is too short to allow the warning at the requested offset without sounding at the beginning, the warning is skipped.
- Removed the obsolete “Beep between speaking windows” setting. Prior local values are safely ignored; the remaining warning parameter continues to work.
- App, health endpoint, PWA manifest and offline cache are consistently versioned 7.3.

Replace the six application files below in your current `business-english-trainer-cloudflare` repository, preserving their paths:

    public/index.html
    public/app.js
    public/styles.css
    public/sw.js
    public/manifest.webmanifest
    src/worker.js

Additionally, replace the optional root-level TIMING_GUIDE.md if it exists in your repository, so its descriptions match the new warning-only timing.

Do not overwrite wrangler.jsonc, schema.sql, server-config.json, lesson files or any user backup. No database migrations or Sync Key changes are required. Commit to main; wait for Cloudflare’s successful build. Verify `/api/health` shows version 7.3 / database connected, then reload the app and verify the header shows v7.3. Progress remains in D1/local cache, unmodified.
