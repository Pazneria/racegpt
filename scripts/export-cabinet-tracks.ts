import { writeFileSync } from 'node:fs';
import { Track, TRACK_DEFINITIONS } from '../src/game/Track';

// Presentation snapshot only. Canonical track definitions stay in game/Track.ts.
const tags = ['BANKED SHAKEDOWN', 'HIGH SPEED ROUTE', 'TECHNICAL BOWL', 'JUMP SPEEDCHECK'];
const hints = ['30–60 SEC TARGET', 'LONG ROUTE', 'TWO CHECKPOINTS', 'RAMP + LANDING'];
const data = TRACK_DEFINITIONS.map((definition, index) => {
  const track = new Track(definition.id);
  const sampled = Array.from({length: 96}, (_, i) => track.getSampleAtS(track.length * i / 95));
  const minX = Math.min(...sampled.map(s => s.center.x));
  const maxX = Math.max(...sampled.map(s => s.center.x));
  const minZ = Math.min(...sampled.map(s => s.center.z));
  const maxZ = Math.max(...sampled.map(s => s.center.z));
  const span = Math.max(maxX - minX, maxZ - minZ);
  const normalize = (x: number, z: number) => [
    Number(((x - (minX + maxX) / 2) / span).toFixed(4)),
    Number((-(z - (minZ + maxZ) / 2) / span).toFixed(4))
  ];
  return {
    id: definition.id, name: definition.name, label: definition.label,
    tag: tags[index], hint: hints[index], checkpoints: definition.checkpointRatios.length,
    route: sampled.map(s => normalize(s.center.x, s.center.z)),
    gates: definition.checkpointRatios.map(t => {
      const s = track.getSampleAtS(track.length * t);
      return normalize(s.center.x, s.center.z);
    })
  };
});
writeFileSync(new URL('../src/cabinet/track-art.js', import.meta.url),
  '// Generated presentation snapshot from src/game/Track.ts. Run scripts/export-cabinet-tracks.ts.\n' +
  'export const TRACKS = Object.freeze(' + JSON.stringify(data, null, 2) +
  '.map(track => Object.freeze({...track, route: Object.freeze(track.route.map(Object.freeze)), ' +
  'gates: Object.freeze(track.gates.map(Object.freeze))})));\n');
