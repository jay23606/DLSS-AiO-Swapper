'use strict';

// Only these destinations may be opened by the renderer, never arbitrary URLs.
const REPO = 'https://github.com/machiavelli31/DLSS-AiO-Swapper';
const links = Object.freeze({
  repo: REPO,
  releases: `${REPO}/releases/latest`,
  issues: `${REPO}/issues`
});
function projectUrl(key) {
  return typeof key === 'string' && Object.hasOwn(links, key) ? links[key] : null;
}
module.exports = { links, projectUrl };
