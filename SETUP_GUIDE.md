# Step-by-step Cloudflare setup — CEO English Ride Trainer V7

1. **Back up first:** From your old V6.x desktop and Samsung apps, choose `Lessons & server sync > Export progress JSON` for each important lesson. Save both separately, e.g. `desktop_lesson3.progress.json` and `phone_lesson3.progress.json`. Do not clear browser data.
2. Open the existing Cloudflare account used for your Piano Trainer. Do NOT reuse the Piano Trainer's Worker or database.
3. Navigate `Storage & databases > D1 SQL database > Create database`. Name it `business-english-progress`. Optional: choose `EU` jurisdiction during creation if you require EU-only data residency. This cannot be changed later.
4. Open your newly created Business English D1 database. Choose `Console`. Open `schema.sql` from this package in Notepad, copy and paste its contents into the console, and execute it. Verify the lesson_progress table exists.
5. On the new database overview find and copy the **Database ID (UUID)**. In `wrangler.jsonc`, replace `PASTE_YOUR_D1_DATABASE_ID_HERE` with that value. Leave `binding` as `DB` and `name` as `business-english-ride-v7`.
6. Create a **new**, empty GitHub or GitLab repository, e.g. `business-english-ride-cloudflare`. Upload the *contents* of this package (not the ZIP). Make sure `wrangler.jsonc`, `package.json`, `schema.sql`, `src/worker.js`, and `public/index.html` are at the correct relative paths.
7. Cloudflare dashboard > `Workers & Pages` > `Create application` > `Import a repository` > choose GitHub/GitLab > choose the **new repo**. Set project root to `/` (repository root). Set Worker name **business-english-ride-v7** (matching wrangler.jsonc). Set build command to `npm install` and deploy command `npx wrangler deploy`. Deploy.
8. Open the published Worker URL shown in Cloudflare (typically `https://business-english-ride-v7.<your-subdomain>.workers.dev`). Test `YOUR_URL/api/health`: should return `{"status":"ok", "app":"business-english-trainer", "version":"7.0", "database":"connected"}`.
9. Open the app on desktop. Under `Lessons & Cloudflare sync`, generate a NEW private Sync Key. Copy it into your private password manager; do not paste it into Git, chat, or Cloudflare. Choose `Save key & sync`.
10. If there is no server progress yet, the app may offer a choice; FIRST choose which old device backup you want to initialize. Use `Import progress JSON` with the authoritative `.progress.json` from Step 1. Review the prompt, then use `Upload this device to server / Replace server` (wording depends on current state). Confirm only after you have backed up both devices.
11. Check `Synced · r1` and detailed diagnostics for lesson, mode, round and position.
12. On your Samsung, open the **NEW Cloudflare URL** in Chrome. Enter the exact SAME private Sync Key, save and sync. Select the same lesson + mode. Round/position should match the desktop. Install the Cloudflare-hosted PWA separately from the old GitHub Pages one.
13. Validate sync: advance exactly one sentence on the desktop, wait for `Synced`, then reopen/refresh on the phone. Compare lesson, mode, round, position and revision. Then test the reverse direction.
14. Later edits: commit updated files to the same new repo. Cloudflare Workers Builds will deploy on changes. `schema.sql` is a one-time command, NOT a deploy command.

Troubleshooting:
- `/api/health` 503: D1 binding incorrect or you skipped running `schema.sql` in the new D1 database.
- Worker build fails: `wrangler.jsonc` database UUID placeholder not replaced, wrong project root, or Worker name does not match Cloudflare project.
- `Progress: local`: open the **new Cloudflare URL**, not the old GitHub Pages address; verify `public/server-config.json` contains `{"backend":"cloudflare-d1"}`.
- Different rounds: select the same lesson/mode and verify **both devices report Synced** and the same server revision after refresh.
- Conflict: Export both copies before deciding; the app will not silently merge concurrent offline edits.
