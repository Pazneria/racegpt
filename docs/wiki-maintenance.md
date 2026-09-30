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

Reviewed on 2026-09-30 at `020eba22bef8a3222cef0102c885753ab79018f1`, package
version `0.1.0`, using the exact committed source and the implementation owner's
completed local test handoff. The independent documentation clone began at
`6a1288cf9eb75f5027fe22110f1757978c456b1b`; the final runtime object was fetched
locally and inspected read-only. Only documentation paths were changed here.
No remote/deployed version parity is asserted.

| Guide topic | Source of truth | Details to recheck after changes |
| --- | --- | --- |
| Keyboard and gamepad | `src/input/InputManager.ts`, `src/main.ts` `handleModeInput` | Brake aliases, gamepad indices 0/1/9 and triggers 6/7, start/restart/pause, focused UI behavior |
| Touch and phone menus | `src/input/InputManager.ts`, `src/ui/UI.ts`, `index.html`, `src/style.css`; implementation-owner test handoff | Independent steering/Gas/Brake pointers; both arrows cancel; Reset and secondary-finger Pause; portrait/landscape scrolling; 780 px/coarse-pointer display; cancellation, blur, rotation and transition cleanup |
| Exit navigation | `src/ui/navigation.ts`, `src/main.ts` `returnToArcade`; implementation-owner tests | HTTP(S) and relative return destinations; reject credentials, other schemes and malformed URLs; preserve local/public Arcade fallback; no destination-origin allowlist |
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

## Verified mobile and keyboard integration

The pending implementation notices have been replaced using final runtime
commit `020eba22bef8a3222cef0102c885753ab79018f1` and its local test handoff.
The handoff reports passing input/runtime/build checks and a production browser
playtest at 390x844 portrait, 844x390 landscape, 320x568 small phone and 1280x720
desktop. It covers actual acceleration, turning and braking, simultaneous
steering/pedals, secondary-finger Pause, Reset, menu actions and scrolling,
settings/PB preservation, input interruption cleanup, native focused keyboard
controls and unsafe-script return fallback. This task reviewed that evidence
and source; it did not duplicate the runtime playtest.

The guide now documents Left/Right, Gas, Brake, Reset and Pause; all five pause
menu choices; both phone orientations; release/cancel/lost-capture behavior;
and cleared held inputs on menu transitions, blur, visibility change, resize,
orientation change and pagehide. Blur does not automatically pause the timer.
The input source label can show Touch; settings and best-run schemas are
unchanged. One fixed car remains the complete car-selection scope.

Keep these limits explicit: Chrome touch emulation with software WebGL is not
a physical phone, iOS Safari, hardware gamepad or mobile thermal/performance
test. Gamepad coexistence used mocked state. No full manual phone race finish
was performed; existing runtime tests cover timing/checkpoint/finish/restart.

## Integration and validation

Fetch/cherry-pick the docs commit from this independent clone into the parent's
chosen integration branch. Do not reset, clean or replace the dirty shared
checkout. Only the `public/wiki/` and `docs/wiki-*` paths belong to this task.
No runtime link has been added, so the runtime owner can add an in-game Wiki
link separately if desired. The hub owner should link the canonical `/wiki/`
route only after publication is verified.

Integrate the tested runtime commit together with all documentation commits
before publishing. The independent docs branch still has the original runtime
files in its working tree: its build checks static wiki copying and layout,
not the final mobile runtime. Source links are pinned to the final runtime
commit; validate their live availability after that commit is pushed.

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
- Final revision: mobile/keyboard/exit behavior was reconciled with runtime
  `020eba22bef8a3222cef0102c885753ab79018f1` and the owner's handoff. All six
  pinned implementation files exist in that Git object. The source/content,
  build, short wiki browser and 16 negative security-fixture checks passed
  again after replacing the pending notices. The touch-controls section was
  visually checked at phone width.

These checks verify the wiki and its hosting artifact. Runtime claims use the
implementation owner's completed handoff and read-only source review; the docs
checks do not certify physical-device behavior or parity with the live site.

## Narrow security review

See `docs/wiki-security.md` for the reviewed data and input boundaries, exact
outbound-link policy, checks and limitations. Keep the wiki inert when updating
it: escape source-derived text and attribute values, and review additions to
the link allowlist. Do not add credentials, personal save data, local machine
paths or internal coordination identifiers to published files or source notes.
