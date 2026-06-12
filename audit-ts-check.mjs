#!/usr/bin/env node
/**
 * TypeScript check for chat files - targeted
 */

import { execSync } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const rootDir = process.cwd();

async function getChatTsFiles() {
  const dirs = [
    'src/components/chat',
    'src/hooks',
    'src/lib/chat',
    'src/pages',
    'src/contexts',
  ];
  const allFiles = [];
  for (const dir of dirs) {
    const fullPath = join(rootDir, dir);
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        const fname = entry.name;
        if ((fname.endsWith('.ts') || fname.endsWith('.tsx'))) {
          allFiles.push(join(dir, fname));
        }
      }
    } catch { }
  }
  return allFiles;
}

async function checkTsErrors() {
  console.log('🔍 TypeScript Errors in Chat Files\n');
  console.log('='.repeat(60) + '\n');

  try {
    // Run tsc with --noEmit and capture JSON output if possible
    const result = execSync('npx tsc --noEmit --pretty false 2>&1', {
      cwd: rootDir,
      maxBuffer: 10 * 1024 * 1024,
    }).toString();

    const lines = result.split('\n');
    const errors = lines.filter(l => l.includes('error') || (l.includes('TS') && l.includes(':')));

    if (errors.length === 0) {
      console.log('✅ No TypeScript errors found\n');
      return;
    }

    console.log(`Found ${errors.length} TypeScript diagnostic(s):\n`);

    // Focus on chat files
    const chatErrors = errors.filter(l =>
      l.includes('src/components/chat') ||
      l.includes('src/hooks/useChat') ||
      l.includes('src/lib/chat') ||
      l.includes('src/pages/Chat') ||
      l.includes('src/contexts/Chat')
    );

    if (chatErrors.length === 0) {
      console.log('✅ No TypeScript errors in chat-specific files');
      console.log(`\n(Total project errors: ${errors.length})\n`);
    } else {
      console.log(`\n${chatErrors.length} error(s) in chat files:\n`);
      chatErrors.forEach(l => console.log('  ', l.trim()));
    }
  } catch (e) {
    console.log('TypeScript check output:');
    console.log(e.stdout?.toString() || e.message);
  }
}

await checkTsErrors();
