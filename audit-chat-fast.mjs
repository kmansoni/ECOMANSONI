#!/usr/bin/env node
/**
 * Fast Chat Files Audit - skips slow typecheck
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const rootDir = process.cwd();

async function getChatFiles() {
  const dirs = [
    'src/components/chat',
    'src/hooks',
    'src/lib/chat',
    'src/pages',
    'src/contexts',
  ];
  const allFiles = new Set();
  for (const dir of dirs) {
    const fullPath = join(rootDir, dir);
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        const fname = entry.name;
        if ((fname.endsWith('.ts') || fname.endsWith('.tsx')) &&
            (fname.toLowerCase().includes('chat') ||
             dir.includes('chat') ||
             fname.includes('useChat'))) {
          allFiles.add(join(dir, fname));
        }
      }
    } catch (e) { }
  }
  return [...allFiles];
}

async function runAudit() {
  console.log('🔍 Chat Files Audit (fast mode - typecheck skipped)\n');
  console.log('='.repeat(60));

  const chatFiles = await getChatFiles();
  console.log(`📁 Files: ${chatFiles.length}\n`);

  let debugCount = 0, todoCount = 0, anyCount = 0, xssCount = 0, a11yCount = 0, timerCount = 0;

  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');

      // Debug statements
      const debugRegex = /console\.(log|debug|info|warn)|debugger|alert\(/g;
      let m;
      while ((m = debugRegex.exec(content)) !== null) {
        debugCount++;
        const line = content.substring(0, m.index).split('\n').length;
        console.log(`  ⚠️  ${file}:${line}: ${m[0].trim()}`);
      }

      // TODOs
      const todoRegex = /(TODO|FIXME|HACK|XXX)\s*:/g;
      while ((m = todoRegex.exec(content)) !== null) {
        todoCount++;
        const line = content.substring(0, m.index).split('\n').length;
        console.log(`  📝 ${file}:${line}: ${content.split('\n')[line-1].trim().substring(0,60)}`);
      }

      // Any type
      const anyRegex = /(any\s*[;,\]]|as\s+any)/g;
      while ((m = anyRegex.exec(content)) !== null) {
        anyCount++;
        const line = content.substring(0, m.index).split('\n').length;
        console.log(`  ⚠️  ${file}:${line}: ${m[0].trim()}`);
      }

      // XSS risks
      const xssPatterns = [
        [/dangerouslySetInnerHTML/g, 'dangerouslySetInnerHTML'],
        [/innerHTML\s*=/g, 'innerHTML='],
        [/insertAdjacentHTML/g, 'insertAdjacentHTML'],
        [/eval\(/g, 'eval()'],
        [/new\s+Function/g, 'new Function'],
      ];
      for (const [regex, label] of xssPatterns) {
        while ((m = regex.exec(content)) !== null) {
          xssCount++;
          const line = content.substring(0, m.index).split('\n').length;
          console.log(`  🔴 ${file}:${line}: ${label}`);
        }
      }

      // Accessibility
      const imgRegex = /<img[^>]*>/g;
      while ((m = imgRegex.exec(content)) !== null) {
        if (!m[0].includes('alt=')) {
          a11yCount++;
          const line = content.substring(0, m.index).split('\n').length;
          console.log(`  ⚠️  ${file}:${line}: <img> missing alt`);
        }
      }

      // Timer leaks
      const intervalRegex = /setInterval\(/g;
      while ((m = intervalRegex.exec(content)) !== null) {
        const line = content.substring(0, m.index).split('\n').length;
        const remaining = content.substring(m.index);
        const hasCleanup = remaining.includes('clearInterval') && remaining.includes('useEffect');
        const hasRef = /(intervalRef|timerRef|watchId)\s*\.current\s*=\s*setInterval/.test(content);
        if (!hasCleanup && !hasRef) {
          timerCount++;
          console.log(`  ⚠️  ${file}:${line}: setInterval may lack cleanup`);
        }
      }

    } catch (e) { console.error(`Error reading ${file}:`, e.message); }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 AUDIT SUMMARY\n');
  console.log(`  Files scanned:     ${chatFiles.length}`);
  console.log(`  Debug statements:  ${debugCount}`);
  console.log(`  TODO/FIXME/HACK:   ${todoCount}`);
  console.log(`  Unsafe any usage:  ${anyCount}`);
  console.log(`  XSS risks:         ${xssCount}`);
  console.log(`  A11y issues:       ${a11yCount}`);
  console.log(`  Timer leak risks:  ${timerCount}`);
  console.log('\n📋 ACTIONS NEEDED\n');
  if (debugCount) console.log('  • Remove debug statements or wrap with if (import.meta.env.DEV)');
  if (todoCount) console.log('  • Convert TODOs to tracked issues or implement');
  if (anyCount) console.log('  • Replace any with proper types');
  if (xssCount) console.log('  • Sanitize HTML inputs; review dangerouslySetInnerHTML usage');
  if (a11yCount) console.log('  • Add alt text and ARIA labels');
  if (timerCount) console.log('  • Ensure timer cleanup in useEffect returns');
  console.log('\n✅ Audit complete\n');
}

runAudit().catch(console.error);
