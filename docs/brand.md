# Pre-Grader brand assets

The Future Gadget Labs "FG Slab" mark from the brand kit (Drive: Logos / tools/fglbrand.py),
with the pre-grader's band colour, emerald `#059669` (`#64BEA2` on dark backgrounds: the
kit's band mixed 38% toward white). Per the kit, only the band colour changes between sites
(Market Tracker indigo, PolyEdge pink, FG-Collect admin cyan).

| File | Use |
|---|---|
| `src/brand/Mark.tsx` | The mark in the app header (32-grid version under 48 px) |
| `public/favicon.svg` | Browser tab: dark mark; light mark on light browser chrome |
| `public/favicon-32.png` | PNG favicon fallback |
| `public/apple-touch-icon.png`, `public/brand/icon-192.png`, `icon-512.png`, `fgpg-icon-navy-512.svg` | App icons (navy square, mark at 74%) |

PNGs were rendered from the SVGs with resvg. To change the band, edit `src/brand/brand.ts`
and the two colours in `public/favicon.svg` and `public/brand/fgpg-icon-navy-512.svg`,
then re-render the PNGs.
