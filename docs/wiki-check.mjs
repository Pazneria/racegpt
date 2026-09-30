// Lightweight documentation checks; deliberately no runtime/package changes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wiki = path.join(root, 'public/wiki');
const html = readFileSync(path.join(wiki, 'index.html'), 'utf8');
const css = readFileSync(path.join(wiki, 'wiki.css'), 'utf8');
const sourceCommit = html.match(/href="https:\/\/github\.com\/Pazneria\/racegpt\/commit\/([a-f0-9]{40})"/)?.[1];
assert(sourceCommit, 'Missing pinned source commit');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate IDs');
assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, 'Exactly one h1');
assert.match(html, /<html lang="en">/);
assert.match(html, /name="viewport"/);
assert.match(html, /class="skip-link" href="#guide"/);
assert.match(html, /<main id="guide" tabindex="-1">/);
assert.match(html, /Pending verification/);
assert.match(css, /:focus-visible/);
assert.doesNotMatch(html, /<script\b|\bonclick=|localStorage\.|sessionStorage\./i);

let localLinks = 0;
for (const [, href] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  if (href.startsWith('#')) {
    assert(ids.includes(href.slice(1)), `Missing anchor ${href}`);
  } else if (href.startsWith('https://')) {
    assert(href.startsWith('https://github.com/Pazneria/racegpt/'), `Unexpected external dependency ${href}`);
    assert(href.includes(sourceCommit), `Source link differs from review basis ${href}`);
  } else {
    assert(!href.startsWith('/'), `Root-absolute link breaks the Pages prefix: ${href}`);
    const urlPath = href.split(/[?#]/)[0];
    if (urlPath === '../') {
      assert(existsSync(path.join(root, 'index.html')), 'Missing game entry');
    } else {
      assert(existsSync(path.resolve(wiki, urlPath)), `Missing local file ${href}`);
    }
    localLinks++;
  }
}

const trackSource = readFileSync(path.join(root, 'src/game/Track.ts'), 'utf8');
const trackIds = [...trackSource.matchAll(/\bid: "([^"]+)"/g)].map(match => match[1]);
assert.equal(trackIds.length, 4);
for (const id of trackIds) {
  assert(html.includes(`href="../?track=${id}"`), `Missing player track link ${id}`);
  assert(html.includes(`href="../?autoplay&amp;track=${id}"`), `Missing demo link ${id}`);
}
for (const name of ['Test Track A', 'Test Track B', 'Test Track C', 'Test Track D']) {
  assert(html.includes(name), `Missing track name ${name}`);
  assert(trackSource.includes(`name: "${name}"`), `Track name drift ${name}`);
}
const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
for (const phrase of ['Split', '360 milliseconds', '0.18 seconds', '65%', 'does not require every checkpoint', packageVersion]) {
  assert(html.includes(phrase), `Missing reviewed fact ${phrase}`);
}
console.log(`Wiki checks passed: ${ids.length} unique IDs, ${localLinks} local links, 4 track links and 4 demos; no scripts or save access.`);
