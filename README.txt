CEO English Ride Trainer V4
===========================

WHAT IS NEW
-----------
1. Three training modes without moving the main dashboard lower:
   R = Repeat
   A = Active Recall
   B = Business Response
   The R/A/B selector uses the same top lesson card that previously contained the import button.

2. Polish translations are shown below every English prompt/answer. Only English is spoken.

3. Server lessons:
   lessons/index.json is the server-side lesson list.
   Each lesson is a plain TXT file in the lessons/ folder.
   Upload/edit these files in GitHub and every device will load the current server version.
   The PWA also keeps an offline cached copy as a fallback.

4. Server progress sync:
   V4 supports a very small Supabase database. Progress is stored as one JSON object per lesson.
   Use the same private Sync Key on every device and the same lesson progress is loaded everywhere.
   When a lesson opens, exercises are ordered by the lowest number of completed practices first.

LESSON FILE FORMAT
------------------
# comments start with #

R | English sentence | Polish translation

A | English cue | Polish cue | English answer | Polish answer

B | English business question | Polish question | English model answer | Polish answer

Old one-English-sentence-per-line files still work as R exercises without translations.

SERVER LESSONS ON GITHUB PAGES
-------------------------------
Your existing GitHub Pages site is enough for lesson files.
Upload the whole V4 folder to the repository root.
The app fetches lessons/index.json from the same GitHub Pages site.

To add another lesson:
1. Add lessons/lesson4.txt
2. Edit lessons/index.json, for example:
   {
     "lessons": [
       {"id":"lesson3","title":"Core Business English — R / A / B","file":"lessons/lesson3.txt"},
       {"id":"lesson4","title":"Investor English","file":"lessons/lesson4.txt"}
     ]
   }
3. Commit both files to GitHub.
4. In the app choose "Refresh lessons from server".

SUPABASE PROGRESS SYNC — ONE-TIME SETUP
----------------------------------------
GitHub Pages is static: it can serve lesson files but cannot write progress back to a file.
For cross-device statistics you need a tiny writable backend. V4 is prepared for Supabase.

1. Create a free Supabase project at https://supabase.com/
2. Open SQL Editor.
3. Paste and run the entire supabase_setup.sql file included with V4.
4. In Supabase Project Settings / API, copy:
   - Project URL
   - Publishable key or legacy anon public key
5. Edit server-config.json in your GitHub repository:
   {
     "supabaseUrl": "https://YOUR-PROJECT.supabase.co",
     "supabaseAnonKey": "YOUR-PUBLISHABLE-OR-ANON-KEY"
   }
6. Commit server-config.json.
7. Open/reload the app.
8. In "Lessons & server sync", press Generate key.
9. Save that private Sync Key somewhere safe.
10. Press "Save key & sync".
11. On every other device, enter exactly the same Sync Key and press "Save key & sync".

The Supabase publishable/anon key is designed to be used by browser apps. The private Ride Trainer Sync Key is NOT stored in GitHub. The database stores only its SHA-256 hash.

SYNC BEHAVIOR
-------------
- Local progress is always saved immediately.
- With server sync configured, progress is also uploaded after completed practices and ratings.
- On opening a lesson, the app downloads server progress first.
- If the server copy is newer, it replaces the local copy.
- If the local copy is newer, it is uploaded.
- Conflict strategy is last-write-wins. This is appropriate for normal use where you practise on one device at a time.

SMART START
-----------
Within the selected R/A/B mode, exercises are sorted by:
1. Lowest completed-practice count first.
2. Oldest last-practised time next.
3. Original lesson order as the final tie-breaker.

MANUAL CONTROLS
---------------
Repeat / Previous / Next immediately enter continuous playback.
The manually selected exercise gets +2 seconds for each recall/response/repetition window.

SCREEN LOCK
-----------
Browser TTS may pause when Android actually locks the phone. Keep "Keep screen awake" on and use Ride screen for the most reliable cycling session.
