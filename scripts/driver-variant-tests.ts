import { execFileSync } from "node:child_process";
import {
  TRACK_C_DRIVER_TIMES_MS,
  TRACK_D_DRIVER_TIMES_MS
} from "../src/game/PbReplay";
import { Track } from "../src/game/Track";

interface SmokeResult {
  ok: boolean;
  trackId: string;
  driver: string;
  finishMs: number;
  checkpointMsList: number[];
  checkpointLateralList: number[];
  finishLateral: number;
}

const cases = [
  ...Object.entries(TRACK_C_DRIVER_TIMES_MS).map(([driver, expectedFinishMs]) => ({
    track: "technical-bowl",
    driver,
    expectedFinishMs
  })),
  ...Object.entries(TRACK_D_DRIVER_TIMES_MS).map(([driver, expectedFinishMs]) => ({
    track: "jump-speedcheck",
    driver,
    expectedFinishMs
  }))
];

for (const testCase of cases) {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/smoke-sim.ts",
      `--track=${testCase.track}`,
      `--driver=${testCase.driver}`
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  const result = JSON.parse(output) as SmokeResult;
  const track = new Track(testCase.track);

  assertEqual(result.ok, true, `${testCase.track} ${testCase.driver} should finish`);
  assertEqual(result.trackId, testCase.track, "smoke result should report the requested track");
  assertEqual(result.driver, testCase.driver, "smoke result should report the requested driver");
  assertEqual(
    result.finishMs,
    testCase.expectedFinishMs,
    `${testCase.driver} should preserve its PB replay time`
  );
  assertEqual(
    result.checkpointMsList.length,
    track.checkpointSs.length,
    `${testCase.driver} should cross every checkpoint before finish`
  );
  assertEqual(
    result.checkpointLateralList.length,
    result.checkpointMsList.length,
    `${testCase.driver} should report legality for every checkpoint crossing`
  );
  for (const [index, lateral] of result.checkpointLateralList.entries()) {
    assertLessThanOrEqual(
      Math.abs(lateral),
      track.roadWidth / 2 + 1.1,
      `${testCase.driver} checkpoint ${index + 1} should cross inside the game timing volume`
    );
  }
  assertLessThanOrEqual(
    Math.abs(result.finishLateral),
    track.roadWidth / 2 + 1.4,
    `${testCase.driver} finish should cross inside the game timing volume`
  );
}

console.log(`driver variant tests passed (${cases.length})`);

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertLessThanOrEqual(actual: number, limit: number, message: string): void {
  if (!(actual <= limit)) {
    throw new Error(`${message}: expected <= ${limit}, got ${actual}`);
  }
}
