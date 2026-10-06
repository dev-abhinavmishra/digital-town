# Test plan — PRESENT-mode slideshow copy + pacing (branch devin/1791247520-deck-naming-checklist)

Changed files: `town/js/deck.js` (live deck), `town/deck/index.html` (static deck), `Havenbrook-Presentation.pdf`.
Key mechanics (deck.js:264-319): `start()` sets `paused = true`; auto-advance timer = `s.hold || HOLD_MS` (HOLD_MS = 12000, budget slide hold = 24000); Space toggles `paused`; Esc → `exit()` restores HUD + `__setPaused(false)` + flyTo home; `window.__deck = {start, exit, next, prev, on, i, n}`; keydown listener is on `window`.

Env: `node town/server.cjs` on :8778 (already running, md5-verified it serves the working tree). CDP :29229 via `chromium.connectOverCDP` + playwright-core (.verify/node_modules). URL: `http://127.0.0.1:8778/?q=low`.

## Flow 1 — live PRESENT mode (primary, recorded)

1. **Boot**: goto `?q=low`, wait `__ready` (≤420s). Record AFTER ready.
2. **Open deck via UI**: click `#uiBtnDeck` ("◉ PRESENT") using its real bounding rect via `page.mouse.click` (a real trusted click, not `__deck.start()`).
   - PASS: `#uiDeck.on` class set, `__deck.on === true`, `__deck.n === 13`, `__deck.i === 0` within ~3s.
3. **Starts paused**: sample `__deck.i` at t≈0, ~7s, ~15s.
   - PASS iff i stays `0` across all samples (old behaviour would auto-advance at 9.5s; new HOLD is 12s, so 15s distinguishes). FAIL if i>0.
   - Cover caption reads: kicker `Our Town Healthcare System project`, `h1` text `HAVENBROOK`, computed `font-style` of h1 = `normal` (roman, not italic). Screenshot `deck-p0-cover.png`.
4. **Space → autoplay resumes**: send real `Space` keydown while on slide 0. Wait ~14s.
   - PASS iff `__deck.i` auto-advanced to `1` (proves 12s timer armed) AND caption now shows slide 2 (`Town overview` / `A town zoned around its med school`). Screenshot.
5. **Space again → pauses**: press Space on slide 1, wait ~14s.
   - PASS iff `__deck.i` still `1` (frozen).
6. **Step all 13 slides**: continue with `__deck.next()` / `ArrowRight`, settle ~2.5-3s each, read `.kick`, `h1`, li text, `.cnt` per slide. Expected:
   - i=0 cover: kick `Our Town Healthcare System project`, h1 `HAVENBROOK` (roman)
   - i=1: kick `Town overview`, h1 `A town zoned around its med school`
   - i=2: kick `Population & demographics`, h1 `Who lives here`
   - i=3: h1 `Havenbrook University School of Medicine`; pts mention Marchand Medical Library / Whitmore Anatomy Hall / Caldecott Clinical Sciences Hall
   - i=4 care: h1 `Thirteen ways to get care`; text contains ALL of: `Garrison Medical Transport`, `Thacher Student Health Clinic`, `Meridian Diagnostics Laboratory`, `Ashwood Behavioral Health Center`, `Halcyon House Senior Living`, `Havenbrook County Health Department`, `Innisfree Home Health`, plus a `Why these:` bullet
   - i=5: h1 `The Preserve at Havenbrook`; text contains `Scholar's Court` AND `Preserve Commons Apartments`
   - i=6: contains `Havenbrook Commons Mall`, `The Whippoorwill Coffeehouse`, `Havenbrook Post Office`, `Havenbrook Unified School District`
   - i=7: `Halcyon House Senior Living`, `Innisfree Home Health`
   - i=10 budget sheet: rows `The Orchard Table · farm-to-table restaurant` and `Mariposa Cantina · Mexican fast-food grill`; `.cnt` = `11 / 13`
   - i=11 conclusion: contains `Thacher Student Health Clinic`, `Brookfield Family Physicians`, `Olsen's Market`, `Innisfree Home Health`, `Stillpoint Hospice` (full names)
   - i=12 references + team line
   - `.cnt` shows `NN / 13` throughout (13, not 9).
   - Screenshots at i=4 (care), i=5, i=6, i=10 (budget), i=11.
7. **Esc exits**: press Escape.
   - PASS: `__deck.on === false`, `#uiDeck` loses `.on`, `#uiTopRight` HUD visible again (hudUI display restored), `__paused() === false`. Screenshot `deck-exit.png` after ~3s.
8. **Errors**: pageerror/console-error list must be empty (ignoring `ERR_CONNECTION_RESET`).

## Flow 2 — static deck + PDF (cheap spot-check)

9. Open `http://127.0.0.1:8778/deck/index.html` in a second tab. Screenshot slide 1 (cover). ArrowRight to slide idx 4 (care) — screenshot. To idx 10 (budget) — screenshot. PASS: same new copy visible in pixels.
10. Shell: `pdfinfo Havenbrook-Presentation.pdf` → 13 pages; `pdftotext` grep for `HAVENBROOK`, `Town overview`, `farm-to-table` / `Mexican fast-food` to prove regenerated copy.
