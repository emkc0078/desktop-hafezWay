#!/usr/bin/env node
/**
 * Prints the public download URL after a successful GitHub publish.
 * Main share link = Windows Setup installer asset.
 */
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const publish = pkg.build?.publish?.[0] || {};
const owner = publish.owner || 'emkc0078';
const repo = publish.repo || 'desktop-hafezWay';
const version = pkg.version;
const tag = `v${version}`;
const setupFile = `Hafez-Way-Admin-Setup-${version}.exe`;

const setupDownload = `https://github.com/${owner}/${repo}/releases/download/${tag}/${setupFile}`;
const thisRelease = `https://github.com/${owner}/${repo}/releases/tag/${tag}`;
const latestPage = `https://github.com/${owner}/${repo}/releases/latest`;

console.log('');
console.log('Release published.');
console.log(`Version:          ${version}`);
console.log(`Setup download:   ${setupDownload}`);
console.log(`Release page:     ${thisRelease}`);
console.log(`Releases list:    ${latestPage}`);
console.log('');
console.log('Share the Setup download link with users.');
console.log('Old installs also pick this up via electron-updater (latest.yml).');
