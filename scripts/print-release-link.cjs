#!/usr/bin/env node
/**
 * Prints download URLs after a successful GitHub publish.
 * Users download from the API host mirror (not GitHub).
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

const githubSetup = `https://github.com/${owner}/${repo}/releases/download/${tag}/${setupFile}`;
const serverSetup = `https://hafezway.com/api/desktop-updates/files/${setupFile}`;
const thisRelease = `https://github.com/${owner}/${repo}/releases/tag/${tag}`;

console.log('');
console.log('Release published.');
console.log(`Version:              ${version}`);
console.log(`Server download:      ${serverSetup}`);
console.log(`GitHub (source):      ${githubSetup}`);
console.log(`Release page:         ${thisRelease}`);
console.log('');
console.log('Users download from the server mirror. Opening the update banner syncs the file and deletes older copies.');
console.log('Optional CI: POST /api/desktop-updates/sync-ci with X-Desktop-Updates-Secret after publish.');
