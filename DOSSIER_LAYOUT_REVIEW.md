# Final courtroom dossier layout review

## Root causes found on main

The dossier layout had accumulated multiple generations of component rules:

- Original flex alignment/flex sizes, followed by three-column grids, two-column
  overrides and mobile explicit-row placement using `display: contents`.
- Portrait bounds changed from 136px to 96px, then to 152/128/104px at later locations;
  image inset/fit declarations and decorative-frame rules were also layered separately.
- Description measures alternated between 65ch, 75ch, 78ch and 760px; font sizes,
  line heights, margins and padding were repeatedly overwritten.
- Progress placement moved from a separate right column to the narrative column and
  then into mobile full-width rows. The heading remained in the narrative wrapper.
- The fixed roster handle introduced 48px/44px global trial-room left margins,
  shifting both the dossier and the full courtroom instead of only positioning a control.
- A removed horizontal launch section still had an obsolete CSS declaration.

## Consolidated implementation

All `.dossier` layout, portrait containment, heading, narrative, progress and handle
rules now live in one component section under TRIAL ROOM, with its two responsive
breakpoints. The obsolete flex/grid/content-display declarations and late patches
were removed rather than overridden again. A unit test detects dossier rules outside
this section. Shared archive portrait rules and generic fallback classes are retained.

Markup keeps every existing functional ID and uses three grid areas:

1. `heading`: centered, full-width People vs. label and decorative trial title.
2. `case`: framed portrait plus readable serif description, centered as one unit.
   The narrative is capped at 78ch. Tablet uses smaller portrait/gap/type; mobile
   stacks portrait above the full-width description.
3. `progress`: existing stepper centered beneath the whole case content area.

All description text and paragraph breaks remain `pre-wrap`; there is no fixed hero
height, truncation, line clamp or hidden overflow. Long titles wrap and long cases
expand naturally. The 152/128/104px portrait widths and Ω fallback remain contained.

There is no global courtroom gutter. The **same** roster handle is absolutely placed
at the dossier's left edge alongside the case row, with mobile alignment alongside
the portrait. It scrolls with the dossier instead of floating over the submission
forms or voting controls. This is a positioning change only: no drawer JavaScript,
subscriptions, keyboard handling, publication, consent or bulk action code changes.

## Before/after screenshots inspected

Baseline: `e4df6c1cc295351748ab801703b94dff852b67fa` (main at start). Both versions use
exactly the same synthetic two-paragraph case, Ω fallback and 1000px-tall real Chrome
viewports. External fonts/network are disabled for deterministic offline fixtures;
the existing Cinzel/Cormorant declarations and readable serif fallbacks are preserved.
These are repository-layout comparisons, not screenshots of live student data.

| Width | Old courtroom left offset | New offset | Old argument-section top | New argument-section top |
| --- | ---: | ---: | ---: | ---: |
| 375px | 44px | 0px | 626px | 690px |
| 768px | 48px | 0px | 445px | 446px |
| 1024px | 48px | 0px | 380px | 384px |
| 1440px | 48px | 0px | 393px | 416px |
| 1920px | 48px | 0px | 393px | 417px |

The visual improvement is balance and hierarchy: large screens no longer anchor
all the content to the left with excessive empty space on the right; the title is
independent of the portrait and the case/progress align centrally. On mobile the
heading gets the full available width, followed by a centered portrait and a readable
narrative. The requested stack is modestly taller than the former side-by-side title
layout; it is not claimed to be shorter at every width. The sample reaches the
argument section within the first 1000px viewport at all five sizes. Longer cases
are intentionally allowed to grow beyond it.

No screenshot had horizontal overflow or overlap among heading, portrait, description,
progress, handle and interactive controls. Scroll tests reveal synthetic submission
and jury forms and verify the handle cannot cover them. Long/unbroken-title and
five-times-longer-description checks verify complete content and natural hero growth.

## Tests and artifacts

- `npm test`: existing regressions/unit tests plus consolidated-component coverage.
- All existing Chrome scripts remain in CI, including roster keyboard/bulk workflows.
- `node tests/dossier-layout.browser.cjs`: real Chrome checks at 375, 768, 1024,
  1440 and 1920px; optional `HERO_SCREENSHOT_DIR` exports PNGs and `metrics.json`.
- Optional `HERO_BASELINE_DIR` reads only prior `court.html`/`style.css` for the
  identical before fixture. PR CI checks those files out at the base SHA and uploads
  both sets as the `courtroom-dossier-layout` Actions artifact (7-day retention).
- Existing security and emulator integration suites run against demo/local data only.

No rules, schema, application logic or data workflow change is part of this fix.
Deployment is website-only through the existing reviewed Hosting process. No merge,
deployment or production-data access is performed here. Hosted-font rendering and
physical mobile/screen-reader checks remain manual release verification.
