import assert from "node:assert/strict";
import {
  getAutoplayReplayTimeMs,
  TRACK_C_DRIVER_TIMES_MS,
  TRACK_D_DRIVER_TIMES_MS
} from "../src/game/PbReplay";

for (const [track, times] of [["technical-bowl", TRACK_C_DRIVER_TIMES_MS], ["jump-speedcheck", TRACK_D_DRIVER_TIMES_MS]] as const) {
  for (const [driver, time] of Object.entries(times)) {
    assert.equal(getAutoplayReplayTimeMs(track, driver, true), time);
    assert.equal(getAutoplayReplayTimeMs(track, driver, false), null);
  }
  for (const unknown of ["missing-driver", "toString", "constructor", "__proto__", "hasOwnProperty"]) {
    assert.equal(getAutoplayReplayTimeMs(track, unknown, true), null, `${track}: ${unknown}`);
  }
}

assert.equal(getAutoplayReplayTimeMs("test-track-b", "search-37250", true), null);
console.log("PB replay tests passed");
