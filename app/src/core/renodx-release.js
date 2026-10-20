'use strict';

// The two RenoDX neural consumers this app installs, pinned by release URL and
// by digest exactly like the Feeder. Until now they had to be sitting beside
// the source tree with the right digest, because nobody published them as
// downloads; the RHI repository - the same one the Feeder's own installer
// pulls from - publishes both, so a build machine no longer needs a copy on
// its desktop. The local file is still accepted as a fallback.
//
// The generic build is what every route installs. The DLSS Tool build REPLACES
// it on the multipass route rather than joining it: two neural consumers in one
// game leave the tickbox saying yes while the picture says no.
const CONSUMER = Object.freeze({
  version: '6.5.3',
  file: 'renodx-dlss5.addon64',
  archive: Object.freeze(['renodx-dlss5_6.5.3.zip', 'https://github.com/RankFTW/rhi-repo/releases/download/renodx-dlss5-6.5.3/renodx-dlss5_6.5.3.zip', '553b1619b9e5ddfbcb4ebc7f2f3bffff9256a48a25b988f4817f5c63f4caa1de']),
  size: 878080,
  sha256: '342341f669f1d64e0c70c8593a07a2fab5075e073dfae97c331c9a6776260a0a'
});
// ShortFuse's DLSS Tool build, carrying DirectNeuralRenderingPassCount (#251).
const MULTIPASS = Object.freeze({
  version: 'SF 26.1003.2350',
  file: 'renodx-dlss.addon64',
  archive: Object.freeze(['renodx-dlss_SF_26.1003.2350.zip', 'https://github.com/RankFTW/rhi-repo/releases/download/renodx-dlss-SF-26.1003.2350/renodx-dlss_SF_26.1003.2350.zip', '34ef92d6742bf6d05df42ff81c04b70f5138b0a0a970a93f1a04295ac83f7f0f']),
  size: 3010048,
  sha256: '1310119c87e4ab5ad0af41511411bd4608ff3c3030a29196ae0e4bba32c84585'
});
// Every neural evaluate faults inside NVIDIA's own NGX runtime on driver
// 616.64 and newer with the 4.x consumers - measured upstream across three
// machines and reported as DLSS5-Feeder #54. The 6.x line passes the same
// self-test 300/300 on 617.14, so the warning belongs to the build rather than
// to the driver: it is raised only when the consumer being installed is one of
// these. Keyed by digest, because that is the only thing a build cannot lie
// about.
const FAULTING = Object.freeze({
  'd5adf82eb44b065f4c590ac91fe824bab07afea0eb9f994bde936710c8593952': '4.70',
  '9150097cdee2953cdc9894d2e5606ea5100e6c8f95fc7bb1b407328b4391a07a': '4.55',
  '87aef9ddd937c7241e6bf8d8efea0045d63559135e254c60dab316db3d3a4aee': '4.x'
});
module.exports = { CONSUMER, MULTIPASS, FAULTING, faults: (sha256) => Boolean(FAULTING[String(sha256).toLowerCase()]) };
