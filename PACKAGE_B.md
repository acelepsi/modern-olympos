# Package B: visual identity and platform polish

Base main: `a67eff0fd386b592e13e187d8a9e179640839cf6`.

## Artwork and reuse

The placeholder Picsum photographs are removed. The landing entrance is a single still, so it creates no autoplay timer or transitions, including for reduced-motion users. Museum photography with verified reuse/download provenance was not available in this environment; the brief's original SVG alternative avoids uncertain rights or unreliable hotlinks.

| File | Title | Creator/source | Institution | Reuse rights |
| --- | --- | --- | --- | --- |
| `mythological-entrance.svg` | Museum Entrance to a Mythological Court | Original SVG authored for Modern Olympos in this change | Not applicable | CC0 1.0 Universal |

The newly authored artwork is dedicated to the public domain under CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/. It contains original classical columns, doors, relief-style balanced scales and olive details, with no copied museum artwork, external resources, raster data or script. Existing temple/laurel, frame and court architecture assets and their CC0 documentation in `VISUAL_ASSETS.md` are unchanged. Public branding remains consistent. All new assets/styles/scripts are included in the build and local server.

## Teacher workspace

Existing panels are grouped under Trial Management, Student Accounts, Role Assignments, Submission Review, and Jury and Verdict. Native anchor links provide keyboard navigation, visible active-location styling and focused group headings. Every group remains visible; no working tools are hidden behind custom tabs. Forms, tables and action hierarchy are restyled using existing colors; tables intentionally scroll on narrow screens. Permanent closure and publication remain visibly warned. The status region stays visible when it has feedback. `admin.js` and every business handler/confirmation remain unchanged; `admin-workspace.js` only manages anchor navigation.

## Public case-file printing

Print Case File invokes `window.print()` on a loaded, selected archive case, with no additional queries or separate data copy. Refresh/loading disables the button, and print CSS suppresses a still-loading detail even if native Ctrl+P is used. The print view includes the emblem, title, portrait/charge when present, completion status, exact published totals, public aliases/chronological approved arguments and approved anonymous reasoning. It uses light pages, dark text, clear headings and break avoidance where a card fits a page.

The outcome text reports only the stored **vote majority or a tie**. It does not invent quorum, binding legal outcomes or a verdict policy. Unpublished/invalid tallies remain explicitly unavailable. Failed reasoning loads retain a visible unavailable notice; no private or historical fallback data is fetched. Individual ballots, review mappings, account data and timestamps are never queried for printing. Public aliases and approved prose remain subject to the project's existing teacher privacy review.

## Dossier refinements

A 3px inset replaces the former 8px portrait mat while retaining contain-fit for both landscape and portrait images; aspect-ratio letterboxing is unavoidable if important artwork must remain uncropped. The existing ornament and Ω fallback stay intact. The original architecture is slightly more visible at the edges, with a strong dark text-zone overlay. Header gaps/padding are tightened while keeping the stepper inside its existing responsive header composition.

## Verification and release

Run `npm.cmd run test:all`, `node tests/portrait-layout.browser.cjs`, `node tests/platform-polish.browser.cjs`, and `npm.cmd run prepare:site` using the existing isolated demo emulator setup. New tests cover local artwork/rights, existing administrator controls and native anchor navigation, print readiness/privacy/no extra reads, stored majority/tie display, responsive administrator forms/tables, print styles, and existing portrait/header regressions.

Manual checks: native print preview and PDF/paper pagination in Chrome/Edge and Firefox, printer margins/long multi-page arguments, keyboard/screen-reader navigation, and synthetic local administrator workflows on a real phone. CSS break avoidance is best effort for cards longer than one page. Automated offline browser fixtures cannot substitute for every printer, assistive technology or live browser network condition.

**No Firestore rules, fields, collections, account permissions or migration changes are required.** Authentication, trial phases, immutable voting, permanent closure, tally publication, moderation and anonymous reasoning protections are unchanged. No production access, merge or deployment is part of this package.
