CEO English Ride Trainer V5
===========================

WHAT IS NEW IN V5
-----------------
1. Persistent rounds per lesson and mode.
   The main counter now shows, for example:
   37 / 100 · Round 2
   R, A and B each keep their own round and position.
   The position is saved locally and, when Supabase sync is configured, on the server.
   Refreshing the page or opening the lesson on another synced device resumes the saved position.

2. V4 migration.
   If V4 statistics already exist but no round state exists yet, V5 estimates the current round from the lowest repetition count and places already-more-practised exercises before the pending ones. From that point onward, the exact queue and cursor are persisted.

3. App version is visible next to the app name: Ride Trainer v5.

4. The initial 'Press Start before your ride' line was removed. Hints appear only when they are useful during playback.

5. The main English sentence font is larger.

6. Lesson selection and the R/A/B selector were moved below the main playback navigation so the primary training dashboard stays higher on the screen.

7. The sync badge is clearer:
   Progress: local = statistics are currently stored only in this browser.
   Synced / Server = server progress sync is configured and active.

8. The install button is now labelled 'Install app'. It installs the PWA on the current device and appears only when the browser offers PWA installation.

ROUNDS
------
Each lesson + mode (R/A/B) has its own round state:
- round number
- fixed queue for that round
- current position
- exercises completed in the round

When every exercise in the current round has been completed, V5 creates the next round. The new round orders exercises by the lowest total completed-practice count first, then oldest last-practised time.

Manual Previous / Next changes the saved cursor immediately. Repeat stays on the current exercise. All three manual navigation actions start continuous playback and add the existing +2 second practice-time bonus.

EASY / HARD
-----------
Easy and Hard are subjective difficulty ratings. They do NOT increase the repetition counter and they do not change the current round position by themselves. They update the exercise's rating statistics.

The 'Difficult exercises only' setting uses these ratings. An exercise is considered difficult when Hard has been used more often than Easy, or when the most recent rating is Hard.

LESSON FILE FORMAT
------------------
# comments start with #

R | English sentence | Polish translation

A | English cue | Polish cue | English answer | Polish answer

B | English business question | Polish question | English model answer | Polish answer

Old one-English-sentence-per-line files still work as R exercises without translations.

SERVER LESSONS
--------------
Lessons are served from GitHub Pages:
lessons/index.json
lessons/lesson3.txt
...

The app keeps an offline cached copy as a fallback.

SERVER PROGRESS
---------------
GitHub Pages cannot write progress. Cross-device statistics therefore use the existing Supabase setup from V4. No database schema change is required for V5 because the round state is stored inside the same JSON progress object.

Use the same private Sync Key on every device. V5 synchronizes repetitions, ratings, round number, round queue and current position.

SCREEN LOCK
-----------
Browser TTS may pause when Android actually locks the phone. Keep 'Keep screen awake' on and use Ride screen for the most reliable cycling session.
