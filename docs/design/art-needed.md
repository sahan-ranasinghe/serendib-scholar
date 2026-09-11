# Art needed — illustrator brief

Every badge, avatar and sticker slot in the app is a **striped placeholder** (the export's own `repeating-linear-gradient` slot) until real art lands. Nothing is drawn to look finished. This lists every slot, its size on screen and where it appears.

Style contract (DESIGN.md): flat fills with one warm shade and up to three highlights, lit from the upper left; no gradients; round, warm, readable at 40 px inside a chalk ring. Palette from `tokens.css` (teal #0F4C5C, saffron #E9B44C, coral #D9643A, marker blue #2F5FA6, success green #3C8C5A, wood #8B5E3C, beads #E05263 / #F2A541 / #3F8F5F / #4A7BD0). Deliver SVG (viewBox 0 0 64 64), plus a 512 px PNG for each.

## Avatars — 8 (onboarding step 2, parent profiles)

Drawn inside a 60 % disc of a 1:1 cell (≈ 47 px at 390 wide), on #EEF4F5, ringed saffron when chosen. Names are from the export (drafted, pending sign-off).

| # | slot key | Sinhala | English |
|---|---|---|---|
| 1 | avatar.1 | අලියා | elephant |
| 2 | avatar.2 | මොනරා | peacock |
| 3 | avatar.3 | ලේනා | palm squirrel (Lena's species) |
| 4 | avatar.4 | කැස්බෑවා | turtle |
| 5 | avatar.5 | ගිරවා | parrot |
| 6 | avatar.6 | කොටියා | leopard |
| 7 | avatar.7 | මුවා | deer |
| 8 | avatar.8 | මාළුවා | fish |

## Stickers / badges — 12 (rewards sticker book, home "new badge" peek)

Drawn in a 40 px disc inside a 68 px paper circle with a 3 px saffron chalk ring when earned; unearned slots show the grey dashed outline (the art is never shown greyed — the outline is the design). The home peek shows the latest at 28 px inside a 48 px ring. One sticker per mastered concept, in the order earned. Eight names are from the export; four are unnamed (the copy review supplies them).

| # | slot key | Sinhala | English |
|---|---|---|---|
| 1 | rewards.sticker.1 | අලියා | elephant |
| 2 | rewards.sticker.2 | මොනරා | peacock |
| 3 | rewards.sticker.3 | නෙළුම | lotus |
| 4 | rewards.sticker.4 | කොත්තු | kottu |
| 5 | rewards.sticker.5 | ත්රීවීලර් | three-wheeler |
| 6 | rewards.sticker.6 | කිරිබත් | kiribath |
| 7 | rewards.sticker.7 | වෙසක් කූඩුව | Vesak lantern |
| 8 | rewards.sticker.8 | ක්‍රිකට් | cricket |
| 9 | rewards.sticker.9 | — (ළඟදීම) | name pending |
| 10 | rewards.sticker.10 | — (ළඟදීම) | name pending |
| 11 | rewards.sticker.11 | — (ළඟදීම) | name pending |
| 12 | rewards.sticker.12 | — (ළඟදීම) | name pending |

## Lena outfits — 3 (rewards "ලේනාගේ ඇඳුම්")

Worn by the 56 px Lena (lena.svg, rig ids `head`, `ears`); today a 28×16 coloured cap shape stands in at (8, −4) over her head. Each outfit is a hat layer that sits on `head` and clears `ears`. Earned one per three stickers.

| # | slot key | Sinhala | English | stand-in colour |
|---|---|---|---|---|
| 1 | rewards.outfit.1 | තොප්පිය (Screens B: පාසල් තොප්පිය) | school cap | #0F4C5C |
| 2 | rewards.outfit.2 | හෙල්මට් (Screens B: ක්‍රිකට් හෙල්මට්) | cricket helmet | #4A7BD0 |
| 3 | rewards.outfit.3 | කූඩුව (Screens B: වෙසක් කූඩුව) | Vesak lantern | #D9643A |

## Certificate seal — 1

The certificate (330×466 on screen, A4 when printed) carries Zara's signature as a 100×25 teal stroke path and no seal yet. Needed: a round seal, ≈ 64 px on screen, saffron chalk ring + wood centre, "සෙරෙන්ඩිබ් ශිෂ්‍ය" around it, to sit beside the signature at the lower right. Also a print-resolution (300 dpi) version.

## Also pending (not slots, but noted)

- The wordmark tile (board paper in a wood frame with the stroke numeral 5) is generated from the app's own glyphs (`scripts/make-icons.ts`) and is final unless the brand changes.
- Zara and Lena are the export's SVG rigs (`zara.svg`, `lena.svg`), used byte-for-byte; the Rive/Lottie rigs are a separate animation deliverable.
