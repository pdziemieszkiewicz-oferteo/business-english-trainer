CEO English Ride Trainer — V2

WHAT THIS VERSION DOES
- Imports lesson .txt files: one sentence per line.
- Uses filename as lesson ID (lesson1.txt -> lesson1).
- Remembers imported lesson and settings locally in the browser.
- Uses browser/Android speech synthesis (Samsung/Google voice exposed by browser).
- Lets you select any English voice exposed by the browser and test it.
- Adjustable speech rate, repetition count and pause length.
- Optional beep between repetition windows.
- Easy/Hard marking, difficult-only mode and shuffle.
- Progress is stored automatically in browser local storage.
- Export/import progress as <lessonId>.progress.json.
- PWA service worker caches the app shell and bundled lesson1.txt.
- Screen Wake Lock is requested during training for more reliable long rides.
- Registers Media Session actions for Play/Pause/Previous/Next when supported.

IMPORTANT TTS LIMITATION
Browser speech synthesis plays the installed phone voice directly. It does not create an MP3 file that the PWA can save. If the selected voice is installed locally on the phone, speech can usually work offline. Available voices depend on Android settings, browser and installed language packs.

INSTALL ON SAMSUNG
1. Put this folder on any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages, your own server, etc.).
2. Open the HTTPS URL in Chrome on the Samsung phone.
3. Use Chrome menu -> Install app / Add to Home screen, or use the in-app Install button if shown.
4. Open the installed Ride Trainer.
5. Import lesson1.txt or another TXT lesson.
6. Open Training settings, choose an English voice, press Test voice, and set speech rate.
7. Press Start before riding.

LESSON FORMAT
Filename: lesson1.txt
Contents:
Before we set a target, we need to establish a baseline.
We need to pressure-test this assumption before making a decision.
If the pilot works, we can roll it out gradually.

No numbering is needed. Blank lines are ignored.

PROGRESS
The app stores progress automatically. Use "Export progress JSON" to create a backup file such as lesson1.progress.json. Importing a revised lesson with the same filename keeps results for sentences whose text is unchanged.
