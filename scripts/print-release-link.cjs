#!/usr/bin/env node
/**
 * Prints the public download URL after a successful GitHub publish.
 */
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const publish = pkg.build?.publish?.[0] || {};
const owner = publish.owner || 'emkc0078';
const repo = publish.repo || 'desktop-hafezWay';
const version = pkg.version;
const tag = `v${version}`;

const latest = `https://github.com/${owner}/${repo}/releases/latest`;
const thisRelease = `https://github.com/${owner}/${repo}/releases/tag/${tag}`;

console.log('');
console.log('Release published.');
console.log(`Version:       ${version}`);
console.log(`This release:  ${thisRelease}`);
console.log(`Always latest: ${latest}`);
console.log('');
console.log('Old installs will see this version via electron-updater.');
console.log('Share the "Always latest" link for manual download.');
