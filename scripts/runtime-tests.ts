import assert from "node:assert/strict";
import { Car } from "../src/game/Car";
import { getAutopilotInput } from "../src/game/Autopilot";
import { TRACK_C_DRIVER_TIMES_MS, TRACK_D_DRIVER_TIMES_MS } from "../src/game/PbReplay";
import { createRuntimeHarness, neutralInput } from "./runtime-harness";

const writes: string[] = [];
globalThis.localStorage = {
  getItem: () => null, setItem: (key: string) => { writes.push(key); },
  removeItem: () => {}, clear: () => {}, key: () => null, length: 0
};

const cases = [
  ...Object.entries(TRACK_C_DRIVER_TIMES_MS).map(([driver, time]) => ({ track: "technical-bowl", driver, time })),
  ...Object.entries(TRACK_D_DRIVER_TIMES_MS).map(([driver, time]) => ({ track: "jump-speedcheck", driver, time }))
];

for (const testCase of cases) {
  let reference: unknown;
  // 240 FPS exercises rendered frames that have no physics tick.
  for (const fps of [30, 60, 120, 240]) {
    const app = createRuntimeHarness(testCase.track, testCase.driver);
    let sample10: unknown;
    const fixedStep = app.fixedStep.bind(app);
    app.fixedStep = (input: typeof neutralInput, dt: number) => {
      fixedStep(input, dt);
      if (!sample10 && app.runTimeMs >= 10000) {
        sample10 = { position: app.car.position.toArray(), yaw: app.car.yaw, velocity: app.car.velocity.toArray() };
      }
    };
    for (let frame = 1; frame <= fps * 100 && app.mode !== "finished"; frame++) {
      app.frame(frame * 1000 / fps);
    }
    assert.equal(app.mode, "finished", `${testCase.driver} at ${fps} FPS`);
    assert.equal(Math.round(app.runTimeMs), testCase.time);
    assert.equal(app.checkpointMsList.length, app.track.checkpointSs.length);
    if (reference) assert.deepEqual(sample10, reference, `${testCase.driver} trajectory at ${fps} FPS`);
    else reference = sample10;
    assert.equal(app.bestRun, null, "autoplay must not save a player best");
  }
}
assert.deepEqual(writes, [], "autoplay should never write player records");

const app = createRuntimeHarness("jump-speedcheck", "search-37275");
app.beginCountdown();
for (let step = 0; step < 600; step++) app.fixedStep(neutralInput, 1 / 120);
app.beginCountdown();
assert.equal(app.runTimeMs, 0);
assert.equal(app.telemetry.speedMps, 0);
assert.equal(app.telemetry.airborne, false);
assert.deepEqual(app.car.velocity.toArray(), [0, 0, 0]);
assert.equal(app.lastTrackS, app.track.startS);
assert.deepEqual(app.checkpointMsList, []);

while (app.countdownRemaining > 1 / 120) app.fixedStep(neutralInput, 1 / 120);
const updates = app.car.update.bind(app.car);
let updateCount = 0;
app.car.update = (...args: Parameters<Car["update"]>) => { updateCount++; return updates(...args); };
app.fixedStep(neutralInput, 1 / 120);
assert.equal(app.mode, "running");
assert.equal(updateCount, 0, "GO transition must not update the freshly reset car");
assert.equal(app.runTimeMs, 0);
const fresh = new Car();
fresh.resetTo(app.track.startPose);
assert.deepEqual(app.car.snapshot(0), fresh.snapshot(0), "GO must begin at the exact smoke start pose");
assert.deepEqual(app.currentRecording[0], app.toGhostSample(0));
const input = getAutopilotInput(neutralInput, fresh, app.track, app.telemetry, "search-37275");
const telemetry = fresh.update(input, app.track, 1 / 120, true);
app.fixedStep(neutralInput, 1 / 120);
assert.deepEqual(app.car.snapshot(app.runTimeMs), fresh.snapshot(app.runTimeMs));
assert.deepEqual(app.telemetry, telemetry, "first running tick must match fresh simulation");
while (app.mode !== "finished" && app.runTimeMs < 100000) app.fixedStep(neutralInput, 1 / 120);
assert.equal(Math.round(app.runTimeMs), TRACK_D_DRIVER_TIMES_MS["search-37275"], "restart preserves PB");

// Finish text describes the measured run, not a constant from the registry.
app.runTimeMs = 40000;
assert.match(app.getFinishCopy(false, false, null, null), /0:40\.000/);
app.autopilotVariant = "constructor";
assert.doesNotMatch(app.getFinishCopy(false, false, null, null), /PB replay|--:--/);

// Exercise rejection as well as acceptance of the actual app timing volumes.
const gates = createRuntimeHarness("jump-speedcheck", "codex");
gates.beginCountdown();
gates.mode = "running";
for (const gateS of [...gates.track.checkpointSs, gates.track.finishS]) {
  const isFinish = gateS === gates.track.finishS;
  const margin = isFinish ? 1.4 : 1.1;
  const passed = gates.passedCheckpointCount;
  const pose = gates.track.getPoseAtS(gateS + 1);
  gates.car.resetTo(pose);
  gates.car.position.addScaledVector(pose.sample.side, gates.track.roadWidth / 2 + margin + 1);
  gates.lastTrackS = gateS - 1;
  gates.checkTimingVolumes();
  assert.equal(gates.passedCheckpointCount, passed);
  assert.equal(gates.mode, "running", "outside finish must not finish");
  gates.car.resetTo(pose);
  gates.lastTrackS = gateS - 1;
  gates.checkTimingVolumes();
  if (isFinish) assert.equal(gates.mode, "finished");
  else assert.equal(gates.passedCheckpointCount, passed + 1);
}
assert.deepEqual(writes, []);

const restart = createRuntimeHarness("jump-speedcheck", "search-37275");
restart.beginCountdown();
for (let step = 0; step < 600; step++) restart.fixedStep(neutralInput, 1 / 120);
restart.input.snapshot = () => ({ ...neutralInput, fullRestartPressed: true });
restart.frame(1000 / 60);
assert.equal(restart.mode, "countdown", "keyboard restart must reach autoplay mode handling");
assert.equal(restart.runTimeMs, 0);
assert.equal(restart.telemetry.speedMps, 0);
console.log(`runtime tests passed (${cases.length} variants at 4 render cadences, restart, GO, timing gates, persistence)`);
