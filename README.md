# 꽉! 팡! — PACK! POP! PANIC

A dependency-free, hand-drawn canvas demolition roguelike. Hold pointer or Space to compress visible scrap into one bomb; release once to spend the single frozen **THIS BLAST N TILES** value through a sequential chain explosion.

## Play

Serve this directory over HTTP and open `index.html` (for example, `npx` is not required: any local static server works). Controls:

- Hold pointer or Space: pack scrap and grow the blast.
- Release: detonate the exact displayed value.
- Aim with pointer movement; `P` or Escape pauses.
- Release in the red **HIT!** band for the shown multiplier. Holding to the end auto-releases at the shown overheat floor.
- Clear each seeded lot's quota with exactly three available charges. Clear all four lots to win.
- After lots 1–3, weld one offered next-tier PACK, POP, or PANIC upgrade onto the same blast machine. There are no secondary currencies or controls.

Every normal start creates a run code. The same seed produces the same four layouts and labeled lot traits. PACK grows the prepared size, POP improves conversion/routing without exceeding that frozen size, and PANIC changes the redline risk/reward. The always-visible build strip shows the installed branch levels and current effects.

The game includes keyboard/touch input, Korean-first copy, focused replay flow, visibility-owned pausing, reduced-motion behavior, DPR-correct canvas sizing, seeded gameplay and decoration, targeted live-region announcements, and synthesized WebAudio. No external runtime assets or dependencies are used.

## Verify

Requires Node.js 22+ and an installed Chrome, Chromium, or Edge browser.

```sh
npm test
npm run check
```

`tests/rules.test.js` contains 23 deterministic behavioral checks, including all nine authored upgrades, three branch-complete runs and a hybrid, frozen prepared values, budget-capped routing, invalid draft choices, restart reset, trait coverage, and a 128-seed four-lot winnability sweep. `tests/smoke.mjs` starts a built-in Node HTTP server, drives the installed browser through CDP with real pointer/keyboard input, verifies all three draft activation paths, focus trapping, exact draft/explosion/tally pause stability, physical-release ownership, authoritative result copy, short-desktop containment, and exact 390×844 DPR2 backing. It writes reproducible captures to `evidence/` and fails if no supported browser executable is found.

For browser automation, `window.__PACK_POP_DEBUG__` exposes only a read-only copied snapshot and legal seeded `start(seed)`, `hold`, `release`, bounded `advance`, `setAim`, and offered-only `choose` actions. The snapshot includes seed, lot/trait, phase, offers/build, derived modifiers, prepared/frozen values, clocks/effects, consumed IDs, and quotas. It has no arbitrary state mutation or force-win path.
