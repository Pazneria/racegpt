# RaceGPT

Browser-playable 3D time-attack racing MVP.

The build target comes from the spec in `../racing-game-mvp/docs`.

## Controls

- `W` / Up: gas
- `S` / Down / Space: brake and reverse after stopping
- `A` / `D` or Left / Right: steer
- `R`: checkpoint reset
- Enter: full restart
- Escape: pause
- Gamepad: left stick steering, triggers gas/brake, face buttons reset/restart

## Run Locally

```powershell
npm.cmd install
npm.cmd run dev
```

Vite defaults to `http://127.0.0.1:5178`.

## Build

```powershell
npm.cmd run build
```

The production base path is still `/chrome-drift/` for GitHub Pages.

## Implementation Notes

The MVP uses Three.js for rendering and a custom arcade vehicle model for grounded
track contact, drift, off-road slowdown, and low-barrier response. That kept the
first playable version tunable without waiting on a full vehicle physics stack.

## Verification

```powershell
npm.cmd run smoke:sim
npm.cmd run build
npm.cmd audit
```

`smoke:sim` runs the same car and track simulation with a deterministic driver to prove
the first track can be completed and the checkpoint can be crossed.

## Deploy

The GitHub Pages workflow builds and deploys `dist` from `main`. Once this repository
exists under the Pazneria account, the arcade should link to:

```text
https://pazneria.github.io/chrome-drift/
```
