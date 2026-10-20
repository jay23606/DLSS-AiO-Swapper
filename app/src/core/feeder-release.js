'use strict';

// One verified release for the shader, both client architectures and helper.
// Never mix host protocol versions: 1.17.0 speaks IPC v11, and a 1.16.x or
// 1.17.0-beta.1 half refuses to talk to it. Both halves ship from this pin, so
// a payload built from here is always a matched pair. Digest supplied by
// GitHub's release API.
module.exports = {
  version: '1.19.0',
  archive: ['DLSS5-Feeder-1.19.0.zip', 'https://github.com/jlrouzies-fr/DLSS5-Feeder/releases/download/v1.19.0/DLSS5-Feeder-1.19.0.zip', '9cc19e28f8fb4e216ea61621fdf6443e207e338ec639979ab335503c75f48f36'],
  // The overlay pins dlss5-feed.addon64 by size and digest before it will
  // drive Feeder's sliders, so the number lives here too and a build-time
  // check holds the two in step. #225 was this pin going stale unnoticed.
  addon64Size: 343552,
  hashes: {
    'dlss5-feed.addon32': '34c767bd53a99f51a6cb5d87b267734e04314d16bf495a6c69ab98acd62d0874',
    'dlss5-feed.addon64': '2b8c905012fd464ddf0554c6b178cba55030ec10eb917acdcee0e7a2376fe4dd',
    'dlss5-feed-host64.exe': '79e427430c5c0102f6c7a557155b706ad51b0c40933f6e245fce922bf5b1401e',
    'reshade-shaders/Shaders/DLSS5_Feed.fx': 'c4ba1610df8e1593faa7c203d6d0517058d3a8ecf2dfda18ca67849844391456',
    // Feeder's own loader layer. A Vulkan game whose driver does not expose
    // the KHR external-interop extensions needs it for one launch.
    'layer-x64/VkLayer_feed_vk.dll': 'ed5978fff1ac1b2c85aed7b1ffe2c7668e2be71f5a8cff86b4327bfa1d959a28',
    'layer-x64/VkLayer_feed_vk.json': 'c15967b3f8847a145e21058a1e57e92c595ee17fc5dd23ab3278b0148ad6e9d1',
    'layer-x64/run-with-feed-layer.bat': 'bc9aa7964742e23653556be978f540f503f3cef928b6de7a38f77c570bb764f9',
    'layer-x86/VkLayer_feed_vk32.dll': 'cbb3039e13ce1a851c00bba24a93586ea8d9731dad3fcf426f412cc764a61860',
    'layer-x86/VkLayer_feed_vk32.json': '28f8174eb8fed02266bafa6910eab07922ec6d2bdb33110699c586f74b254921',
    'layer-x86/run-with-feed-layer32.bat': '75d4584ad01619402a10e0d8342b114613057a1d3b0ac8dbe9280b740090c3e8'
  }
};
