export interface GameSettings {
  volume: number;
  ghostEnabled: boolean;
}

export interface GhostSample {
  timeMs: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface GhostRecording {
  trackId: string;
  timeMs: number;
  checkpointMs: number | null;
  samples: GhostSample[];
}

const SETTINGS_KEY = "chrome-drift:settings";
const BEST_RUN_KEY = "chrome-drift:best-run:banked-shakedown";

const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.65,
  ghostEnabled: true
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_SETTINGS.volume,
      ghostEnabled:
        typeof parsed.ghostEnabled === "boolean"
          ? parsed.ghostEnabled
          : DEFAULT_SETTINGS.ghostEnabled
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadBestRun(): GhostRecording | null {
  try {
    const raw = localStorage.getItem(BEST_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GhostRecording;
    if (!parsed || !Array.isArray(parsed.samples) || !Number.isFinite(parsed.timeMs)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveBestRun(recording: GhostRecording): void {
  localStorage.setItem(BEST_RUN_KEY, JSON.stringify(recording));
}

