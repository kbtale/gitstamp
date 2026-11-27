# GitStamp

Turn images, pixel text, or starter presets into GitHub contribution graph art that stays centered on your profile automatically.

Live app: [gitstamp.vercel.app](https://gitstamp.vercel.app)

## Features

- **Smart Image Conversion:** Auto-detects polarity, color distance, Otsu threshold, and K-Means 5-level shading with aspect-aware `1–53` column sizing.
- **5×7 Pixel Text Generator:** Stamp custom words, handles, or banners directly onto your contribution grid without needing a logo file.
- **Starter Preset Gallery:** 9 curated pixel art presets (Heart, Invader, Rocket, Wave, Pac-Man, Octocat, Knight, Checkered, HIRE ME) for 15-second tryouts.
- **Interactive Pixel Studio:** Multi-artwork, multi-year canvas with 5-shade brushes, live GitHub profile blending, background flattening, directional nudge, horizontal/vertical mirror flip, `Ctrl+Z`/`Ctrl+Y` undo/redo, and `art.json` import/export.
- **One-Click Deploy & Safe Unstamp:** Provisions a public repository with a weekly self-centering GitHub Actions renderer using `git fast-import`, plus a confirmation-gated **Unstamp Art** flow that cleanly clears stamped commits.

## Local Development

```bash
npm --prefix frontend install
npm run dev
```

## Verification

```bash
npm --prefix frontend run typecheck
npm test
npm run build
```

## Environment Variables

Configure these in Vercel (or `.env.local`) for GitHub App PKCE authentication:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_SLUG`

## License

GPL-3.0
