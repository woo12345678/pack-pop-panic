# 꽉! 팡! — PACK! POP! PANIC

A dependency-free, hand-drawn canvas demolition arcade. Hold pointer or Space to compress visible scrap into one bomb; release to spend the single frozen **THIS BLAST N TILES** value in a sequential chain explosion.

## Play

Serve this directory over HTTP and open `index.html` (for example, `npx` is not required: any local static server works). Controls:

- Hold pointer or Space: pack scrap and grow the blast.
- Release: detonate the exact displayed value.
- Aim with pointer movement; `P` or Escape pauses.
- Release in the red **HIT!** band for ×2. Holding to the end auto-releases at floored 60% power.
- Clear each deterministic lot's quota with three charges. Clear all three lots to win.

The game includes keyboard/touch input, Korean-first copy, focused replay flow, visibility-owned pausing, reduced-motion behavior, DPR-correct canvas sizing, seeded gameplay and decoration, targeted live-region announcements, and synthesized WebAudio. No external runtime assets or dependencies are used.

## Verify

Requires Node.js 22+ and an installed Chrome, Chromium, or Edge browser.

```sh
npm test
npm run check
```

`tests/rules.test.js` contains 17 deterministic rules checks, including frozen prepared values, consumed-object persistence, rubble-aware propagation, and a three-charge winnability proof for every seeded lot. `tests/smoke.mjs` starts a built-in Node HTTP server, drives the installed browser through CDP with real input, verifies exact explosion/tally pause stability and native Space activation, asserts authoritative result copy and portrait geometry, and writes five reproducible captures to `evidence/`. It fails if no supported browser executable is found.

For browser automation, `window.__PACK_POP_DEBUG__` exposes only a read-only copied snapshot and legal `start`, `hold`, `release`, bounded `advance`, and `setAim` actions. It has no arbitrary state mutation or force-win path.
