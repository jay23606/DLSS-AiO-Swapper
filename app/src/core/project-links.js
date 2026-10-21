'use strict';

// Only these destinations may be opened by the renderer, never arbitrary URLs.
// Feature wishes and bug reports open GitHub's own forms in the browser with
// the app and Windows version filled in; the app itself sends nothing.
const REPO = 'https://github.com/machiavelli31/DLSS-AiO-Swapper';
const links = Object.freeze({
  repo: REPO,
  releases: `${REPO}/releases/latest`,
  issues: `${REPO}/issues`,
  ideas: `${REPO}/discussions/categories/ideas`,
  feature: `${REPO}/issues/new?template=feature_request.yml&labels=enhancement`,
  bug: `${REPO}/issues/new?template=bug_report.yml&labels=bug`
});
const clean = (value) => String(value || '').replace(/[^\w .()+-]/g, '').slice(0, 60);
function projectUrl(key, context = {}) {
  if (typeof key !== 'string' || !Object.hasOwn(links, key)) return null;
  let url = links[key];
  if (key === 'feature' || key === 'bug') {
    if (context.version) url += `&version=${encodeURIComponent(clean(context.version))}`;
    if (key === 'bug' && context.windows) url += `&windows=${encodeURIComponent(clean(context.windows))}`;
  }
  return url;
}
module.exports = { links, projectUrl };
