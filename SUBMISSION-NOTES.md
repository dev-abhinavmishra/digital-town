# Havenbrook — Submission Notes & Checklist

**Team:** Abhinav Mishra · Dinesh Yara · Davi Ogland
**Project:** Our Town Healthcare System — delivered as a navigable 3-D digital town (Three.js)

## What to submit

| File | What it is |
|---|---|
| `Havenbrook-Presentation.pdf` | 13-page presentation deck (title + 11 content + references), exported from the app's deck |
| `town-orbit.mp4` | 10-second looping aerial flyover of the town — can be dropped into a title slide or played in class |
| The live app | run `node town/server.cjs`, open `http://127.0.0.1:8778`, press **PRESENT** for the narrated slideshow mode, click any building to go inside |

## Checklist audit

| Requirement | Status | Where |
|---|---|---|
| Original town name | Done | Havenbrook |
| Group member names | Done | Title slide, static deck, PROJECT BRIEF panel |
| Title slide | Done | Slide 01 — HAVENBROOK + team |
| ≥10 content slides | Done | 11 content slides + title + references (13 total) |
| Medical school / university | Done | University School of Medicine, centered in the town (slide 04) |
| Housing development | Done | The Preserve at Havenbrook (slide 06) |
| ≥7 healthcare facilities | Done | 13 sites on Wellness Way (slide 05) |
| ≥3 community facilities | Done | 11 sites (slides 07–08) |
| Unique facility names | Done | Every building named — see directory in the app |
| Demographics (50/30/20) | Done | Slide 03 — students/families/65+ |
| Visual layout / placement rationale | Done | Slide 09 — siting logic; map view in app |
| Decision-making / trade-offs | Done | Slide 10 |
| Budget items + remaining | Done | Slide 11 — $9.95M of $10M, $50k headroom; live tracker in app |
| References slide | Done | Slide 13 |
| Neat / key points | Done | Short captions, one idea per slide |

## Presentation flow (PRESENT mode)

1. Title — town name + team
2. The brief — what the assignment required
3. Demographics — 50% students / 30% families / 20% seniors
4. University School of Medicine — the anchor
5. Wellness Way — 13 healthcare facilities, who each serves
6. The Preserve — donated housing development
7. Willow Creek Park — community third places
8. The quiet east — senior living + hospice
9. Layout & placement — why things sit where they sit
10. The trade-offs — coverage over scale, choices made
11. The ledger — full budget breakdown with remaining headroom
12. Conclusion — under budget, over-delivered
13. References — sources & tools

## Notes

- The deck exists twice: **PRESENT mode** inside the live app (video background, zero render cost) and `town/deck/index.html`, which is what `Havenbrook-Presentation.pdf` was exported from — identical content, printable.
- The checklist asks for a Google Slides / Canva submission — the PDF covers the "slides" deliverable; the live app + mp4 go beyond it.
- If the class form has a **period / class name** field, fill that in manually — it wasn't provided.
