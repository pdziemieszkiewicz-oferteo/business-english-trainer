# Ride Trainer V7.2 — complete timing reference

**All settings in V7.2 are editable numbers rather than dropdown presets.** Timing settings accept non-negative decimals, including `0` to skip a pause. Repetition windows must be a positive whole number. Speech rate accepts `0.1–10×`, the range supported by the browser speech-synthesis API.

The application plays the spoken prompt and/or answer at the selected voice's actual speed. **Speaking duration does not count toward any configured silent pause.** Every displayed timer below begins after the preceding speech finishes.

## Timing settings

| Control (default) | Where used | Exactly what it controls |
|---|---|---|
| Speech rate (`0.9×`) | All modes | Playback speed of both selected English and Polish voices; does not shorten or lengthen pauses. |
| Repetition windows (`2`) | R, A, B, PL | Number of *silent speaking windows* after the English model is heard **once**. Does not make the model voice read the answer again between windows. |
| Pause per repetition (`7 s`) | R, A, B, PL | Seconds in *each* repetition window. With 2 windows at 7 seconds, you have **14 seconds** of silent repetition in total, split into two windows by an optional transition beep. |
| Active Recall answer time (`7 s`) | A only | Silent time after the English cue, before the spoken English target answer. |
| Polish → English recall pause (`5 s`) | PL only | Silent time after the Polish prompt, before the English voice reads the answer. |
| Business Response answer time (`15 s`) | B only | Silent time after the English question, before the model English answer. |
| Quiet warning before pause ends (`2 s`) | R/A/B: final repetition window; PL: both Polish recall and **every** repetition window | One warning tone sounds the requested number of seconds **before the relevant window ends**; `0` turns it off. When the warning is at or beyond the length of the pause, it is moved earlier as far as the pause allows (with ~0.5 seconds reserved at its end). This setting is separate from the transition beep checkbox. |
| Beep between speaking windows (on) | All modes | Audible marker following each prompt/answer and between repetition windows, if enabled. A warning tone configured above can still sound when transition beeps are disabled. |

## What you hear in each mode

| Mode | Exact sequence | Silent time with default settings |
|---|---|---|
| **R — Repeat** | English model **once** → beep → repetition window 1 → beep → repetition window 2 → next exercise. | `2 × 7 = 14 s` |
| **A — Active Recall** | English cue → beep → 7-second answer time → English target answer **once** → beep → two 7-second repetition windows. | `7 + (2 × 7) = 21 s` |
| **B — Business Response** | English question → beep → 15-second free-answer time → English model **once** → beep → two 7-second repetition windows. | `15 + (2 × 7) = 29 s` |
| **PL — Translate & Recall** | Polish sentence (Polish voice) → beep → 5-second English recall time → English target (English voice) **once** → beep → two 7-second repetition windows. | `5 + (2 × 7) = 19 s` |

The totals above exclude voice playback duration and minor transitions between exercises. A final-window warning sounds 2 seconds before the last R/A/B repetition window ends; the initial answer-time windows in **A and B currently have no warning**. In PL, a warning sounds 2 seconds before the Polish recall pause ends **and** 2 seconds before **each** repetition window ends.

### Repetition count: an important distinction

`Repetition windows = 3` and `Pause per repetition = 6.5 s` means:

1. Hear the English model **once**.
2. Spend `6.5 s` repeating it aloud.
3. Hear a transition beep (if on), then spend another `6.5 s` repeating it.
4. Hear another transition beep (if on), then spend a third `6.5 s` repeating it.

Total: **19.5 seconds of silent practice**. It does **not** mean hearing the model three times. The repetition count controls the number of windows in **all four modes**, not only R.

### Manual navigation vs automatic lesson playback

Choosing **Repeat**, **Previous**, or **Next** adds **2 seconds to each relevant silent window** for the exercise you manually selected; automatic progression does not apply the extra time.

For example, if `Pause per repetition = 7 s` and `Repetition windows = 2`, manually selecting an R exercise gives two `9 s` windows (18 s total) instead of two `7 s` windows (14 s total). In A/B/PL, the special answer/recall time also gains 2 s when that exercise is selected manually.

### Easy/Hard history in V7.2

Each exercise now shows its **last rating** and **the exact date/time that the last Easy or Hard button was pressed**, along with cumulative counts (`Easy 2 / Hard 3`, for example). The most recently used button is highlighted. V7.1 stored prior ratings and counts but **not the precise rating time**. For a rating recorded before V7.2, the app will display “date unavailable (rated in an earlier version)” until you rate that exercise again. We do not incorrectly substitute the last practice time for the old rating time.

Learning progress and ratings continue to synchronize through Cloudflare D1. **Timing settings and voices remain specific to each device** (existing behavior), so you can intentionally use different timing on your Samsung and desktop.
