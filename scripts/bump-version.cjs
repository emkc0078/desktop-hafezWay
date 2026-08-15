#!/usr/bin/env node
/**
 * Bumps package.json patch version (0.1.0 → 0.1.1) for each release build.
 * Usage: node scripts/bump-version.cjs
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prev = pkg.version || '0.0.0';
const parts = prev.split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
const next = parts.slice(0, 3).join('.');
pkg.version = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Version bumped: ${prev} → ${next}`);
