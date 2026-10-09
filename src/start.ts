import "./style.css";
import { RaceGptApp } from "./main";
import { createNativeBoot } from "./cabinet/native-boot";
import { createHostBridge } from "./cabinet/host-bridge";

const cabinet = createHostBridge(window.location.href, window.parent !== window, {
  start: () => bootRaceGpt().startFromCabinet(),
  post: (message, origin) => window.parent.postMessage(message, origin)
});
const boot = createNativeBoot(() => new RaceGptApp(cabinet ? destination => destination === 'menu' ? cabinet.menu() : cabinet.back() : undefined), {
  ready: detail => { window.dispatchEvent(new CustomEvent("racegpt:ready", {detail})); cabinet?.ready(); },
  error: () => { cabinet?.error(); window.dispatchEvent(new CustomEvent("racegpt:error", {
    detail: {message: "RaceGPT could not start. Reload to retry."}
  })); }
});
if (cabinet) {
  window.addEventListener('message', event => cabinet.receive(event.data, event.origin, event.source === window.parent));
  // Only this explicit cabinet document routes delivered Escape to its host.
  // Keyup is a fallback if the browser consumed keydown to release pointer lock.
  // If neither event is delivered, clicking the host scene still exits.
  for (const type of ['keydown', 'keyup'] as const) window.addEventListener(type, event => cabinet.escape(event), true);
}
export const bootRaceGpt = () => boot.boot(window.location.href, {deferStart: !!cabinet});
bootRaceGpt();
