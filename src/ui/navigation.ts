/** Resolve the optional arcade destination without allowing executable URL schemes. */
export function resolveArcadeReturnUrl(pageUrl: string): string {
  const page = new URL(pageUrl);
  const fallback = page.hostname === "127.0.0.1" || page.hostname === "localhost"
    ? "http://localhost:5510/"
    : "https://pazneria.github.io/arcade/";
  const requested = page.searchParams.get("return");
  if (!requested) return fallback;
  try {
    const destination = new URL(requested, page);
    if ((destination.protocol === "https:" || destination.protocol === "http:") &&
        !destination.username && !destination.password) {
      return destination.href;
    }
  } catch {
    // A malformed destination should still let the player leave the game.
  }
  return fallback;
}
