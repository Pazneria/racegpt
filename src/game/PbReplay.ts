export const TRACK_C_CURRENT_PB_MS = 51233;
export const TRACK_C_DRIVER_TIMES_MS: Record<string, number> = {
  "search-51233": 51233
};

export const TRACK_D_CURRENT_PB_MS = 37250;
export const TRACK_D_DRIVER_TIMES_MS: Record<string, number> = {
  "search-37250": 37250,
  "search-37275": 37275,
  "search-37283": 37283,
  "search-37425": 37425,
  "search-37525": 37525,
  "search-37825": 37825
};

export function getAutoplayReplayTimeMs(
  trackId: string,
  driverVariant: string,
  autoplay: boolean
): number | null {
  if (!autoplay) return null;
  if (trackId === "technical-bowl") {
    return getOwnDriverTime(TRACK_C_DRIVER_TIMES_MS, driverVariant);
  }
  if (trackId === "jump-speedcheck") {
    return getOwnDriverTime(TRACK_D_DRIVER_TIMES_MS, driverVariant);
  }
  return null;
}

function getOwnDriverTime(times: Record<string, number>, driver: string): number | null {
  return Object.prototype.hasOwnProperty.call(times, driver) ? times[driver] : null;
}
