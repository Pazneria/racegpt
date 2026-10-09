# Private cabinet Escape correction

Branch `craft/cabinet-input-exit` preserves frozen reference `72816f6d75b286090976bac827191bbb269e581a` on `craft/racegpt-cabinet-start`. Only explicitly requested, validated embedded cabinet documents install the Escape handlers. After the host's selected-track start has been acknowledged, delivered Escape keydown or keyup sends the existing verified `racegpt:cabinet:back` message once. Repeats and duplicate release delivery cannot issue a second exit. Ordinary top-level/native menu and pause behavior is unchanged.

The host pair is `../arcade-cabinet-craft`, branch `craft/cabinet-input-correction`. The protocol remains version1 with exact parent origin, source, session and track checks. Loading remains inert behind the token/readiness barrier. Browser-reserved Escape may not be delivered: this is event forwarding, not a browser bypass. Clicking the host scene outside the game viewport is the fallback.

`node node_modules/tsx/dist/cli.mjs scripts/cabinet-bridge-tests.ts` and `npm run build` pass on CPU. No new artwork, browser/GPU runtime, publication, installation or gameplay/save-schema change is part of this correction.
