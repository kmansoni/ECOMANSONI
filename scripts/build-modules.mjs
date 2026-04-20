#!/usr/bin/env node

/**
 * Build script for dynamic modules
 * Builds each module (services/*) into a single JS file and copies to dist/modules/
 *
 * Usage: node scripts/build-modules.mjs
 */

import { spawn } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, copyFile, rm } from 'fs/promises';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Modules to build (add new modules here)
const MODULES = [
  {
    id: 'music',
    path: 'services/music',
    entryFile: 'music-module.js',
    // Optional: CDN URL for production deployment
    cdnUrl: 'https://cdn.mansoni.com/modules/music/music-module.js',
  },
  // Add more modules: taxi, editor, etc.
  // { id: 'taxi', path: 'services/taxi', entryFile: 'taxi-module.js' },
];

const DIST_DIR = join(projectRoot, 'dist', 'modules');
const PUBLIC_MODULES_DIR = join(projectRoot, 'public', 'modules');

async function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: join(projectRoot, cwd),
      stdio: 'inherit',
      shell: true,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function buildModule(module) {
  console.log(`\n📦 Building module: ${module.id}`);

  const modulePath = join(projectRoot, module.path);

  try {
    // Step 1: Install dependencies (if node_modules missing)
    if (!existsSync(join(modulePath, 'node_modules'))) {
      console.log(`   Installing dependencies for ${module.id}...`);
      await runCommand('npm', ['install'], modulePath);
    }

    // Step 2: Build the module (Vite)
    console.log(`   Building ${module.id}...`);
    await runCommand('npm', ['run', 'build'], modulePath);

    // Step 3: Locate built file
    const builtFile = join(modulePath, 'dist', module.entryFile);
    if (!existsSync(builtFile)) {
      // Try alternative: Vite lib build outputs index.js
      const altFile = join(modulePath, 'dist', 'index.js');
      if (existsSync(altFile)) {
        console.log(`   Found ${module.entryFile} as index.js`);
      } else {
        throw new Error(`Built file not found: expected ${module.entryFile} or index.js in dist/`);
      }
    }

    const sourceFile = existsSync(builtFile) ? builtFile : join(modulePath, 'dist', 'index.js');

    // Step 4: Create module output directory
    const moduleOutDir = join(DIST_DIR, module.id);
    const modulePublicDir = join(PUBLIC_MODULES_DIR, module.id);
    await mkdir(moduleOutDir, { recursive: true });
    await mkdir(modulePublicDir, { recursive: true });

    // Step 5: Copy built JS to dist/modules/<id>/
    const destFile = join(moduleOutDir, module.entryFile);
    const publicDestFile = join(modulePublicDir, module.entryFile);
    await copyFile(sourceFile, destFile);
    await copyFile(sourceFile, publicDestFile);

    console.log(`   ✓ Module built: ${destFile}`);
    console.log(`   ✓ Public copy: ${publicDestFile}`);

    // Step 6: Generate manifest for this module
    const stats = await (await import('fs')).promises.stat(sourceFile);
    const manifest = {
      id: module.id,
      name: module.id.charAt(0).toUpperCase() + module.id.slice(1),
      version: '1.0.0',
      size: stats.size,
      url: module.cdnUrl || `/modules/${module.id}/${module.entryFile}`,
      entryFile: module.entryFile,
      entryComponent: 'default',
    };

    const manifestPath = join(moduleOutDir, 'manifest.json');
    await (await import('fs')).promises.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2)
    );
    console.log(`   ✓ Manifest: ${manifestPath}`);

    return { id: module.id, ...manifest };
  } catch (err) {
    console.error(`   ✗ Failed to build ${module.id}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('🚀 Starting modules build...\n');

  try {
    // Clean dist/modules
    if (existsSync(DIST_DIR)) {
      await rm(DIST_DIR, { recursive: true, force: true });
    }
    await mkdir(DIST_DIR, { recursive: true });

    // Build each module
    const builtManifests = [];
    for (const module of MODULES) {
      try {
        const manifest = await buildModule(module);
        builtManifests.push(manifest);
      } catch (err) {
        console.error(`Skipping ${module.id} due to errors`);
      }
    }

    // Generate aggregate manifest for all modules
    const aggregateManifest = {
      modules: builtManifests,
      generatedAt: new Date().toISOString(),
    };

    const aggregatePath = join(DIST_DIR, 'modules-manifest.json');
    await (await import('fs')).promises.writeFile(
      aggregatePath,
      JSON.stringify(aggregateManifest, null, 2)
    );

    console.log('\n✅ Modules build complete!');
    console.log(`   Output: ${DIST_DIR}`);
    console.log(`   Public: ${PUBLIC_MODULES_DIR}`);
    console.log(`\n   Run 'npm run preview' or deploy 'dist/' to serve modules.`);

  } catch (err) {
    console.error('\n❌ Build failed:', err);
    process.exit(1);
  }
}

main();
