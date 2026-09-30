# CEO English Ride Trainer — Cloudflare V7.0

This release moves the **existing V6.5 interface and its four learning modes** to one Cloudflare Worker + one separate D1 database. The database stores the lesson-level JSON snapshot, including mode-specific rounds, positions, counts, and Easy/Hard ratings. Frontend assets and lessons are served from the same Worker. NO Supabase account is needed.

## Package layout

- `public/` — existing PWA, lessons, icons, styling.
- `src/worker.js` — same-origin `/api/progress` read/write with revision-based conflict protection.
- `schema.sql` — database schema to run once **in the NEW Business English D1 database**.
- `wrangler.jsonc` — Worker configuration. Replace the database ID placeholder with your own new D1 database UUID **before connecting your repository to Cloudflare**.
- `package.json` — allows the Cloudflare build to install Wrangler with `npm install`.

## Security

- `Sync Key` is stored in each browser, sent over HTTPS in an Authorization header, and stored in D1 only as its SHA-256 hash.
- Treat the Sync Key as a password: do not put it in Git, Cloudflare screenshots, chat messages, or public issues.
- The public repository may contain the Wrangler **database identifier**; this ID is not a database access token.
- Never upload existing Piano Trainer database credentials or storage exports to this project.

## Cloudflare setup

See `SETUP_GUIDE.md`. Key order: Export old progress on both devices → create separate D1 `business-english-progress` → run `schema.sql` in that D1 database → paste its UUID into `wrangler.jsonc` → upload files to a **new** GitHub/GitLab repository → import that repository under Cloudflare **Workers & Pages** → set build command `npm install` and deploy command `npx wrangler deploy` → test `/api/health` → open app → import the authoritative progress backup on ONE device → enter SAME private Sync Key on each device → verify revision, round and position across devices.

## Notes

- The first restore is intentionally manual so Round 1 on one device cannot silently replace Round 9 on another.
- If two devices edit offline concurrently, the app raises a conflict and asks which *complete lesson snapshot* to keep. It does not silently combine edits.
- Device voice selection and display settings are still local. Lesson progress and round positions sync.
- Samsung text-to-speech may still suspend when the screen is physically locked. Ride screen can keep it awake.
- The original GitHub Pages installation remains untouched; do not uninstall it until you have exported its progress.
