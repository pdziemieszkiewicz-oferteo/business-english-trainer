# Ride Trainer V7.3 — Timing guide

All timing controls are editable numerical fields. Speech time is not counted toward silent pauses. Voice rate applies to both selected voices. Manually using Repeat, Previous or Next adds 2 seconds to each applicable pause for that exercise.

| Control (default) | Mode | Meaning |
|---|---|---|
| Speech rate (0.9×) | All | The rate of the voice, independent of the pauses. |
| Repetition windows (2) | All | Number of silent opportunities to repeat the English model after it is read ONCE. |
| Pause per repetition (7 s) | All | Duration of EACH silent repetition window. Two windows of 7 s = 14 s of practice. |
| Active Recall answer time (7 s) | A | Silence between the English cue and the English model. |
| Polish → English recall pause (5 s) | PL | Silence after the Polish sentence and before the English answer. |
| Business Response answer time (15 s) | B | Silence after the English question and before the model answer. |
| Quiet warning before pause ends (2 s) | All | The ONLY training sound: once this many seconds BEFORE the end of EVERY silent pause, including recall/response and EACH repetition. Set 0 to disable. There is no beep at the start of a counter or between windows. |

If the configured warning offset is too long for a short pause (at or within 0.25 seconds of the start), that pause has no warning rather than playing a sound when the counter starts. A warning setting of 2 seconds with a pause of 7 seconds sounds at 5 seconds into the pause.

## Four modes with default durations

| Mode | Playback sequence | Total silent time |
|---|---|---:|
| R — Repeat | English model once → 7 s repetition window (warning 2 s before end) → another 7 s window (warning 2 s before end) | 14 s |
| A — Active Recall | English cue → 7 s recall (warning) → English model → two 7 s repetition windows (warning in EACH) | 21 s |
| B — Business Response | English question → 15 s answer (warning) → English model → two 7 s repetition windows (warning in EACH) | 29 s |
| PL — Translate & Recall | Polish sentence → 5 s recall (warning) → English model → two 7 s repetition windows (warning in EACH) | 19 s |

The English model is spoken ONCE, irrespective of the number of repetition windows. The warning sounds only near the END of each applicable silence, never when a counter starts. When the warning is 0 or would fall at the start of a short pause, no tone plays. Vocal playback lengths and transition overhead are excluded from the totals above.

## Progress and ratings

Easy/Hard records the most recent selection, time of that selection (for ratings made since V7.2), and the total Easy/Hard counts. Ratings and lesson progress synchronize via Cloudflare D1. Voices and timing parameters remain device-local.
