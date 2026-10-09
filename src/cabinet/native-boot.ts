export interface CabinetGame {
  /** Return false unless the existing application is in its menu mode. */
  startFromCabinet(): boolean;
}
export interface NativeReady {
  readonly autoStarted: boolean;
  readonly trackId: string | null;
}

/** Optional native-game boot bridge. One instance per page; a failure is latched. */
export function createNativeBoot<T extends CabinetGame>(createApp: () => T,
  hooks: {ready?: (detail: NativeReady) => void; error?: (error: unknown) => void} = {}) {
  let app: T | undefined;
  let failure: unknown;
  let failed = false;
  let booting = false;
  return {
    boot(href: string, {deferStart = false} = {}): T {
      if (failed) throw failure;
      if (app) return app;
      if (booting) throw new Error('RaceGPT boot is already in progress');
      booting = true;
      try {
        const url = new URL(href);
        app = createApp();
        const autoStarted = !deferStart && url.searchParams.get('arcadeStart') === '1' && app.startFromCabinet();
        hooks.ready?.(Object.freeze({autoStarted, trackId: url.searchParams.get('track')}));
        return app;
      } catch (error) {
        failed = true; failure = error;
        hooks.error?.(error);
        throw error;
      } finally { booting = false; }
    }
  };
}
