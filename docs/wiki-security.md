# RaceGPT wiki security review

Scope: the new `public/wiki/index.html`, `public/wiki/wiki.css` and wiki-specific
maintenance/check files. Reviewed on 2026-09-30. This is a narrow review of the
documentation change, not a security certification of the game or hosting.

## Data and untrusted inputs

- The wiki contains authored text derived from public source code, pinned
  commit links, fixed game/track/demo URLs, and a local stylesheet. It handles
  no credentials, accounts, personal names, imported files, saved recordings
  or private fetched content.
- Browsers can receive arbitrary query strings and fragments when opening the
  wiki. The page has no JavaScript, templating or data fetches, so it does not
  consume or insert those values into HTML, attributes or links. Fragments only
  use native browser navigation to existing IDs.
- Game local storage exists on the same origin, but the wiki does not read,
  write or clear it. A hostile saved string was tested in a disposable browser
  context; it was preserved and did not become wiki markup.
- Names and descriptions in this draft are static authored content, not HTML
  interpolated from user data. Ampersands in text and query attributes are
  escaped. Any future generated text must be encoded for its HTML context
  rather than inserted as raw markup.

## Findings and changes

- No executable HTML, event handlers, forms, embedded frames/objects,
  `srcdoc`, new-tab targets, or dynamic script injection sinks exist in the
  shipped wiki. No iframe or `postMessage` interaction is introduced.
- The seven outbound links are exact HTTPS GitHub destinations for the reviewed
  runtime commit and six implementation files. The earlier six source links
  were opened at the initial review basis. The final pinned destinations were
  verified against local Git objects; live availability must be checked after
  the runtime commit is pushed. They use same-tab navigation, with no
  opener relationship, URL credentials, arbitrary redirect parameters or
  protocol-relative/script/data links.
- The only stylesheet is `./wiki.css`. It uses system fonts and CSS shapes;
  no external images, fonts, CSS imports or `url()` assets are fetched.
- The guide describes the runtime owner's new return-address validation at
  `020eba22bef8a3222cef0102c885753ab79018f1`: HTTP(S), including relative
  destinations, with embedded credentials rejected and normal local/public
  Arcade fallback for invalid or other schemes. This is scheme/credential
  validation, not an origin allowlist; an accepted URL can lead off-site. The
  implementation owner's unit/browser evidence includes unsafe script-return
  fallback. No runtime navigation code was edited by this documentation task.
- No dependencies, package/lock files, workflows, runtime security settings,
  permissions or account configuration were changed. Existing dependencies
  were installed offline for the earlier build; no new dependency was added.
- An internal mobile-task identifier in maintenance prose was unnecessary
  for a public source deliverable and was removed. The changed documentation
  and its screenshots contain no user save records, credentials or personal
  machine paths. A targeted check of owned files found no common key/token,
  private-key, password-assignment, email or local-path patterns after cleanup.
- The wiki checker now rejects active/embedded HTML, event/source attributes,
  unsafe/unreviewed URL destinations, unescaped ampersands and external CSS
  assets. Source links must exactly match the displayed review commit; game
  links can contain only the fixed track/autoplay destinations. These guards
  supplement review; they are not a general-purpose HTML sanitizer.

## Evidence and limits

- The structural/security checker passes for the owned files and rejects 16
  deliberately unsafe fixture variants: script/event/frame markup, script/data
  and protocol-relative URLs, single/unquoted URL attributes, lookalike hosts,
  URL credentials, redirect parameters, meta refresh, unescaped ampersands,
  and CSS imports/fetched assets. These fixtures live outside the shipped tree.
- A disposable headless browser checked hostile query/hash values and a
  hostile local-storage string without reflected markup or script execution;
  network requests from the wiki stayed on the local test origin and loaded
  only the page and its stylesheet.
- Outbound source destinations were validated as exact URLs and local committed
  files; final live destinations await runtime publication. Prior live checks
  do not certify GitHub content or future redirect behavior.
- The earlier production build and keyboard/touch checks passed. Functional
  tests alone do not establish security.
- No full-repository audit, dependency vulnerability audit, credential scan,
  game save/import fuzzing, runtime-input audit, hosting-policy change or live
  penetration test was performed. The unpublished route cannot yet be checked
  against deployed headers or hosting behavior. Final mobile/keyboard runtime
  security evidence belongs to the implementation owner; this review checks
  its accurate description and the wiki's own inert content/link behavior.
