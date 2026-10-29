# Mythological dossier artwork and visual changes

Based on main `3eff0f0f650079006fe71108b63b132f63cd711d`.

The written design brief was available; its referenced image was not attached. The implementation follows the described museum/classical courtroom direction without claiming to reproduce an unseen reference.

## Original assets and licensing

These three newly authored, locally stored SVG assets are dedicated to the public domain under **CC0 1.0 Universal** (https://creativecommons.org/publicdomain/zero/1.0/):

- `olympos-emblem.svg`: symmetrical laurel wreath and geometrical courthouse. Shared decorative branding on the landing page, court, archive and classroom guide. Adjacent brand/title text supplies the accessible name; decorative images have empty alt text.
- `courtroom-architecture.svg`: original fluted columns, entablature, central arch, stone lines and muted illumination. Used only as the dossier background, beneath a dark overlay, independently of trial portraits. No character-specific imagery, remote requests or licensed stock images.
- `portrait-frame.svg`: restrained metallic corner geometry and fine framing. Decorative CSS overlay; no effect on accessible portrait descriptions.

No third-party artwork or external image dependencies were introduced. Each asset is a few kilobytes, uses no embedded raster images, scripting, animation or external resources, and is included by the existing site build and local server (with SVG content type). Existing fonts and authorized dynamic portrait URLs are unchanged.

## Composition and compatibility

The compact three-phase indicator moves into the dossier, retaining every existing ID, state attribute, label and screen-reader status. Desktop positions it to the right; tablet uses a secondary row within the header; narrow phones use the full header width below the title/charge. State text remains available to assistive technology even when visually hidden. No application JavaScript changes or additional reads.

Portrait frames are 136px on desktop, 116px on tablets and 96px on phones. Courtroom images use `object-fit: contain` with a dark inset mat to avoid cutting off faces; archive images retain their existing cover treatment and dimensions. Missing/failed image Ω fallbacks are unchanged. Long titles and charges wrap naturally. Prosecution/Defense cards, mobile tabs, counters and feedback remain intact.

The architectural background and framing styles are scoped to the court dossier. The archive and guide receive only the shared emblem/cache-version update. The administrator stays unchanged. No new Firestore fields, rule changes, data migration or production changes are required.

## Verification

Run `npm.cmd run test:all`, `node tests/portrait-layout.browser.cjs`, and `npm.cmd run prepare:site` using the existing isolated demo emulator instructions. Offline browser fixtures inline the exact local SVG assets and CSS, block external services, and test the actual presentation/rendering helpers. Focused checks cover emblem loading, compact stepper placement, long titles, image containment/fallback, text contrast and true 320/375/768/1024/1280px iframe layouts. Existing voting, moderation, authorization, responsive tab, dialog and archive tests remain in place.

A manual visual review with synthetic local accounts and assistive technology is still recommended. No deployment or merge is part of this change.
