# Havenbrook — Submission Notes & Checklist

**Team:** Dinesh Yara · Abhinav Mishra · Davi Ogland
**Project:** Our Town Healthcare System — delivered as a navigable 3-D digital town (Three.js)

## What to submit

| File | What it is |
|---|---|
| `Havenbrook-Presentation.pdf` | 16-page deck — the group's uploaded presentation (`Presentation_1.pdf`), adapted: same slide order and condensed-title style, corrected building names, plus the rubric slides it was missing (town overview, trade-offs, real budget sheet, conclusion, references) |
| The live app | run `node town/server.cjs`, open `http://127.0.0.1:8778`, press **PRESENT** — every slide flies the camera onto the building it's about; click any building to go inside |
| `PRESENTATION-SCRIPT.md` | speaker script, split Abhinav / Dinesh / Davi, keyed to the slide order |

## Checklist audit

| Requirement | Status | Where |
|---|---|---|
| Original town name | Done | Havenbrook |
| Group member names | Done | Title slide, static deck, PROJECT BRIEF panel |
| Title slide | Done | Slide 01 — HAVENBROOK + team |
| ≥10 content slides | Done | 14 content slides + title + references (16 total) |
| Medical school / university | Done | Havenbrook University School of Medicine, centered in the town (slide 04) |
| Housing development | Done | The Preserve at Havenbrook (slide 06) |
| ≥7 healthcare facilities | Done | 13 sites on Wellness Way (slide 05) |
| ≥3 community facilities | Done | 11 sites (slides 07, 09) |
| Unique facility names | Done | Every building named — see directory in the app |
| Demographics (50/30/20) | Done | Slide 03 — students/families/65+ |
| Describe your town | Done | Slides 02 (overview) + 11 (Haven downtown) |
| Visual layout / placement rationale | Done | Slide 10 — siting logic; map view in app |
| Decision-making / trade-offs | Done | Slide 13 |
| Budget items + remaining | Done | Slide 14 — $9.95M of $10M, $50k headroom; live tracker in app |
| Conclusion | Done | Slide 15 |
| References slide | Done | Slide 16 |
| Neat / key points | Done | Short captions, one idea per slide |

## Presentation flow (PRESENT mode — same order as the PDF)

1. Title — town name + team
2. The town — how Havenbrook is zoned and the rules it had to hit
3. Who lives here — 50% students / 30% families / 20% seniors
4. Havenbrook University School of Medicine — the anchor
5. Thirteen ways to get care — the healthcare system, who each site serves
6. The Preserve — donated housing development
7. Community — the parts that aren't medicine
8. A place to grow old — senior living + hospice on Sunset Ridge
9. Shopping and entertainment
10. How we laid it out — streets, corridors, the EMS rule
11. Haven downtown — the walkable core
12. Havenbrook Unified School District — the K-12 anchor
13. What we traded — coverage over scale, choices made
14. The budget — itemized ledger, $50k left unspent
15. Why it works — every demographic covered, under budget
16. References — sources & tools

## Notes

- The deck exists twice: **PRESENT mode** inside the live app (the real camera flies to each building as you talk about it — arrows step, space toggles autoplay, Esc drops back into the town) and `town/deck/index.html`, which is what `Havenbrook-Presentation.pdf` was exported from — same 16 slides in the same order, printable.
- Every slide carries a **locator map** in the top-right corner: a desaturated top-down view of the whole town with the university always marked in gold and a white dot where that slide's camera is looking — so the university is on every slide.
- The checklist asks for a Google Slides / Canva submission — to satisfy the letter of the rule, import `Havenbrook-Presentation.pdf` into Google Slides (File → Import slides → Upload) so the deck itself lives there.
- The title slide shows **HST · Period 4** next to the group names.
