import assert from "node:assert/strict";
import { RaceGptApp } from "../src/main";
import { createCodexGhostRecording, CODEX_GHOST_NAME } from "../src/game/CodexGhost";
import { getCurrentPbDriver, TRACK_C_DRIVER_TIMES_MS, TRACK_D_DRIVER_TIMES_MS } from "../src/game/PbReplay";
import { Track, TRACK_DEFINITIONS } from "../src/game/Track";
import { makeLeaderboardTexture } from "../src/render/SceneRenderer";
import { formatTime } from "../src/core/math";
import { createRuntimeHarness } from "./runtime-harness";

const writes: string[] = [];
globalThis.localStorage = {
  getItem: () => null, setItem: (key: string) => { writes.push(key); },
  removeItem: () => {}, clear: () => {}, key: () => null, length: 0
};

// Exercise the actual billboard drawing code without requiring a WebGL device.
const drawn: string[] = [];
const context = new Proxy({ fillText: (value: string) => drawn.push(value) }, {
  get: (target, key) => key in target ? Reflect.get(target, key) : () => {},
  set: (target, key, value) => Reflect.set(target, key, value)
});
globalThis.document = { createElement: () => ({ getContext: () => context }) } as unknown as Document;

for (const definition of TRACK_DEFINITIONS) {
  const track = new Track(definition.id);
  const recording = createCodexGhostRecording(track);
  assert.ok(recording.timeMs < 90000, `${track.id} ghost must actually finish`);
  assert.equal(recording.checkpointMsList?.length, track.checkpointSs.length);
  const times = track.id === "technical-bowl" ? TRACK_C_DRIVER_TIMES_MS
    : track.id === "jump-speedcheck" ? TRACK_D_DRIVER_TIMES_MS : null;
  if (times) {
    const fastest = Math.min(...Object.values(times));
    const driver = getCurrentPbDriver(track.id);
    assert.ok(driver);
    assert.equal(times[driver], fastest);
    assert.equal(recording.timeMs, fastest, "ghost must reproduce the advertised PB");
  } else assert.equal(getCurrentPbDriver(track.id), null);

  drawn.length = 0;
  const texture = makeLeaderboardTexture([{ rank: 1, name: CODEX_GHOST_NAME, timeMs: recording.timeMs }], track.name);
  assert.ok(drawn.includes("MODEL PBS"));
  assert.ok(drawn.includes(CODEX_GHOST_NAME.toUpperCase()));
  assert.ok(drawn.includes(formatTime(recording.timeMs)));
  assert.ok(!drawn.some((text) => /benchmark/i.test(text)));
  texture.dispose();

  const app = createRuntimeHarness(track.id, getCurrentPbDriver(track.id) ?? "codex", false);
  app.beginCountdown();
  app.mode = "running";
  const ghosts = Reflect.get(RaceGptApp.prototype, "getGhosts").call(app);
  assert.equal(ghosts[0].name, CODEX_GHOST_NAME);
  assert.equal(ghosts[0].sample.timeMs, 0);
  for (const [offset, beatsPb] of [[-100, true], [0, false], [100, false]] as const) {
    app.mode = "running";
    app.bestRun = null;
    app.runTimeMs = recording.timeMs + offset;
    app.finishRun();
    assert.equal(app.lastFinishCopy.includes(`beat ${CODEX_GHOST_NAME}'s PB`), beatsPb);
    assert.equal(app.bestRun.timeMs, recording.timeMs + offset);
  }
}
assert.ok(writes.length > 0, "player runs should still save local bests");
console.log("model PB tests passed (ghosts, billboard drawing, player comparisons on every track)");
