# RaceGPT wiki maintenance

The guide is at `public/wiki/index.html`. Vite copies `public/` unchanged to
`dist/`, so the existing GitHub Pages workflow can serve the canonical route:

`https://pazneria.github.io/racegpt/wiki/`

This route is **planned and unpublished**. Add the Arcade hub link only after
the documentation commit is integrated, the normal Pages deployment succeeds,
and the route responds successfully. No gameplay, input, UI, package, Vite or
workflow changes are part of this documentation branch. The wiki's Play link
and track/demo links use `../`, preserving the repository's Pages prefix.

## Source basis

Reviewed on 2026-09-30 at `6a1288cf9eb75f5027fe22110f1757978c456b1b`, package
version `0.1.0`. An independent clone was made from the committed HEAD of the
existing `fix/keyboard-menu-navigation` checkout. Its uncommitted keyboard and
ongoing touch work was inspected read-only, excluded from verified guide claims,
and preserved. No remote/deployed version parity is asserted.

| Guide topic | Source of truth | Details to recheck after changes |
| --- | --- | --- |
| Keyboard and gamepad | `src/input/InputManager.ts`, `src/main.ts` `handleModeInput` | Brake aliases, gamepad indices 0/1/9 and triggers 6/7, start/restart/pause, focused UI behavior |
| Tracks | `src/game/Track.ts` `TRACK_DEFINITIONS`, `index.html` | Four IDs/names, default A, checkpoint ratios, D's road gap and wider road; A's 30–60 sec wording is a target |
| Car behavior | `src/game/Car.ts` | One car, seven automatic gears, speed-dependent steering, brake/steer drift, off-road drag, barriers, weaker air control and landing loss |
| Timing and recovery | `src/main.ts` `beginCountdown`, `fixedStep`, `checkTimingVolumes`, `resetToCheckpoint`, `finishRun`; `src/core/math.ts` | Three seconds, simulation clock, latest cumulative split, forward crossing, 500 ms restore history, double reset under 360 ms, 180 ms control lock, timer not rewound |
| PBs and ghost references | `src/main.ts` `finishRun`/`getGhosts`, `src/game/CodexGhost.ts`, `src/game/PbReplay.ts`, `src/render/SceneRenderer.ts` | Strictly faster player best, autoplay isolation, visual-only ghosts, Codex 5.5 reference, fastest registered C/D drivers, billboard using the same model recording |
| Settings and saves | `src/game/Storage.ts`, `src/main.ts`, `src/ui/UI.ts`, `src/audio/AudioManager.ts` | Defaults 0.65/true/true/false; selected track; local-only save keys; save writes have no user-facing failure handler |
| Hosting | `vite.config.ts`, `.github/workflows/deploy.yml` | Build base `/racegpt/`, artifact `dist`, Vite public-directory copy |

Storage keys are `racegpt:settings` and
`racegpt:best-run:<trackId>:v1`. The wiki uses no JavaScript or storage access.
Do not clear or migrate game data as part of documentation work or validation.
Use a disposable browser context for tests.

## Limits that must stay explicit

- The finish gate does not require the checkpoint count to be complete.
- The timer advances in fixed physics steps, with a six-step cap per frame;
  slow rendering can differ from wall-clock elapsed time.
- Ghost display toggles do not delete PB data; hidden model ghosts still have
  finish comparisons.
- No car selection, tuning, damage/health, combat, laps/campaign progression,
  online player leaderboard, account sync or save import/export is implemented.
- No dedicated save-error message is implemented if writes fail.
- Do not copy the menu's old “one checkpoint” generalization into this guide:
  Tracks C and D each have two.

## Pending mobile and keyboard integration

Coordinate final controls with the mobile implementation owner via the parent.
The guide's `#mobile-title` notice is deliberately **Pending verification**.
The reviewed baseline has global shortcuts; the guide also labels the focused
menu fix as pending. These caveats are about the game, not this accessible wiki.

After the parent supplies the final controls and implementation commit:

1. Review the final input, UI, markup and CSS read-only. Verify touch control
   labels, simultaneous steering/pedals, reset/restart/pause placement, menu
   access, and interruption cleanup in a short disposable browser check.
2. Replace the pending notice with only verified controls; update the focused
   menu limit after checking Tab/Enter/Space behavior in the merged game.
3. Update the visible source basis and commit links. Keep the source matrix
   aligned with the final runtime commit; do not alter runtime-owned files.
4. Re-run the lightweight wiki checks before publication.

## Integration and validation

Fetch/cherry-pick the docs commit from this independent clone into the parent's
chosen integration branch. Do not reset, clean or replace the dirty shared
checkout. Only the `public/wiki/` and `docs/wiki-*` paths belong to this task.
No runtime link has been added, so the runtime owner can add an in-game Wiki
link separately if desired. The hub owner should link the canonical `/wiki/`
route only after publication is verified.

Run the structural/content checker without adding package scripts:

```powershell
node docs/wiki-check.mjs
npm.cmd run build
```

GitHub Pages resolves `wiki/` to `wiki/index.html`. Vite's development/preview
fallback does not resolve this public subdirectory index automatically: open
`/wiki/index.html` in dev or `/racegpt/wiki/index.html` in Vite preview, or use
a plain static server with the `/racegpt/` prefix to emulate the Pages route.
The production build contains both `dist/wiki/index.html` and its stylesheet.

Use a short local preview on an unused port at desktop
and narrow mobile widths: local CSS, relative game/track links, no horizontal
overflow, visible keyboard focus, skip-link behavior, touch-sized navigation,
native details disclosure, and unchanged local storage. Close the owned preview
and browser afterwards. Screenshot/report artifacts belong outside tracked
runtime files. A WebGL game playtest is not required for a static docs change.

### Completed checks for this draft

- `node docs/wiki-check.mjs`: passed; 20 unique IDs, 13 local links, all four
  player-track and four autoplay links, pinned source links, no scripts or
  save access.
- `npm.cmd run build`: passed (TypeScript and Vite). The existing game's JS
  chunk size warning remains; the wiki is copied static HTML/CSS.
- A single disposable headless Chromium session checked the production
  directory route with a Pages-style local static server: HTTP 200, CSS load,
  nine unique game/track/demo destinations, all section anchors, keyboard
  skip link and visible focus, Enter/Space disclosure behavior, touch taps,
  and no page/HTTP errors.
- At 1440, 768, 390 and 320 px: no horizontal overflow; main navigation,
  track links and disclosure targets were at least 44 px high. Desktop and
  mobile screenshots were visually inspected.
- A disposable game-save sentinel survived reload and navigation with no
  additional local-storage entries. The user's browser profile was not used.
- `git diff --check`: passed. Only new documentation paths are included.

These checks verify the wiki and its hosting artifact. They do not verify the
pending mobile gameplay implementation or assert parity with the live site.

## Narrow security review

See `docs/wiki-security.md` for the reviewed data and input boundaries, exact
outbound-link policy, checks and limitations. Keep the wiki inert when updating
it: escape source-derived text and attribute values, and review additions to
the link allowlist. Do not add credentials, personal save data, local machine
paths or internal coordination identifiers to published files or source notes.
