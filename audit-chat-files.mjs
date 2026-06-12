#!/usr/bin/env node
/**
 * Chat Files Audit Script
 * Runs comprehensive checks on chat-related source files
 */

import { execSync } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const rootDir = process.cwd();

// Collect chat files
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
    } catch (e) { /* dir may not exist */ }
  }

  return [...allFiles];
}

async function runAudit() {
  console.log('🔍 Chat Files Comprehensive Audit\n');
  console.log('='.repeat(60));

  const chatFiles = await getChatFiles();
  console.log(`\n📁 Found ${chatFiles.length} chat-related source files\n`);

  // Check 1: TypeScript errors
  console.log('\n─── 1. TypeScript Compilation Check ───\n');
  try {
    // Run typecheck and filter for chat files
    const result = execSync('npm run typecheck 2>&1', {
      cwd: rootDir,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' }
    }).toString();

    const chatErrors = result.split('\n').filter(l =>
      l.includes('error') &&
      (l.includes('src/components/chat') ||
       l.includes('src/hooks/useChat') ||
       l.includes('src/lib/chat') ||
       l.includes('src/pages/Chat') ||
       l.includes('src/contexts/Chat'))
    );

    if (chatErrors.length === 0) {
      console.log('✅ No TypeScript errors found in chat files');
    } else {
      console.log(`❌ Found ${chatErrors.length} TypeScript error(s):\n`);
      chatErrors.forEach(l => console.log('  ', l.trim()));
    }
  } catch (e) {
    const output = e.stdout?.toString() || '';
    const chatErrors = output.split('\n').filter(l =>
      l.includes('error') &&
      (l.includes('src/components/chat') ||
       l.includes('src/hooks/useChat') ||
       l.includes('src/lib/chat') ||
       l.includes('src/pages/Chat') ||
       l.includes('src/contexts/Chat'))
    );
    if (chatErrors.length === 0) {
      console.log('✅ No TypeScript errors found in chat files');
    } else {
      console.log(`❌ Found ${chatErrors.length} TypeScript error(s):\n`);
      chatErrors.forEach(l => console.log('  ', l.trim()));
    }
  }

  // Check 2: Debug statements
  console.log('\n─── 2. Debug Statements (console.log, debugger, alert) ───\n');
  let debugCount = 0;
  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      const debugRegex = /console\.(log|debug|info|warn)|debugger|alert\(/g;
      let match;
      while ((match = debugRegex.exec(content)) !== null) {
        debugCount++;
        const lineNum = content.substring(0, match.index).split('\n').length;
        console.log(`  ⚠️  ${file}:${lineNum}: ${match[0].trim()}`);
      }
    } catch (e) { }
  }
  if (debugCount === 0) console.log('✅ No debug statements found in chat files');

  // Check 3: TODO/FIXME/HACK
  console.log('\n─── 3. TODO/FIXME/HACK Comments ───\n');
  let todoCount = 0;
  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      const todoRegex = /(TODO|FIXME|HACK|XXX)\s*:/g;
      let match;
      while ((match = todoRegex.exec(content)) !== null) {
        todoCount++;
        const lineNum = content.substring(0, match.index).split('\n').length;
        const lineText = content.split('\n')[lineNum - 1].trim();
        console.log(`  📝 ${file}:${lineNum}: ${lineText}`);
      }
    } catch (e) { }
  }
  if (todoCount === 0) console.log('✅ No TODO/FIXME/HACK comments found');

  // Check 4: any type usage
  console.log('\n─── 4. Unsafe Type Assertions (any) ───\n');
  let anyCount = 0;
  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      const anyRegex = /(any\s*[;,\]]|as\s+any)/g;
      let match;
      while ((match = anyRegex.exec(content)) !== null) {
        anyCount++;
        const lineNum = content.substring(0, match.index).split('\n').length;
        console.log(`  ⚠️  ${file}:${lineNum}: ${match[0].trim()}`);
      }
    } catch (e) { }
  }
  if (anyCount === 0) console.log('✅ No unsafe any usage found in chat files');

  // Check 5: XSS risks
  console.log('\n─── 5. XSS Security Risks ───\n');
  let xssCount = 0;
  const riskyPatterns = [
    { regex: /dangerouslySetInnerHTML/g, label: 'dangerouslySetInnerHTML' },
    { regex: /innerHTML\s*=/g, label: 'innerHTML assignment' },
    { regex: /insertAdjacentHTML/g, label: 'insertAdjacentHTML' },
    { regex: /eval\(/g, label: 'eval()' },
    { regex: /new\s+Function/g, label: 'new Function()' },
  ];
  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      for (const pattern of riskyPatterns) {
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          xssCount++;
          const lineNum = content.substring(0, match.index).split('\n').length;
          console.log(`  🔴 ${file}:${lineNum}: ${pattern.label}`);
        }
      }
    } catch (e) { }
  }
  if (xssCount === 0) console.log('✅ No obvious XSS risks found');

  // Check 6: Accessibility
  console.log('\n─── 6. Accessibility Quick Scan ───\n');
  let a11yCount = 0;
  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      // Check images without alt
      const imgRegex = /<img[^>]*>/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(content)) !== null) {
        if (!imgMatch[0].includes('alt=')) {
          a11yCount++;
          const lineNum = content.substring(0, imgMatch.index).split('\n').length;
          console.log(`  ⚠️  ${file}:${lineNum}: <img> missing alt attribute`);
        }
      }
      // Check buttons without accessible labels
      const btnRegex = /<button[^>]*>/g;
      let btnMatch;
      while ((btnMatch = btnRegex.exec(content)) !== null) {
        const btnTag = btnMatch[0];
        if (!btnTag.includes('aria-label') && !btnTag.includes('alt=') && !btnTag.includes('title=')) {
          // Check if button has text content
          const btnClose = '</button>';
          const btnStart = content.indexOf(btnTag);
          const btnEnd = content.indexOf(btnClose, btnStart);
          const hasText = btnEnd > btnStart && content.substring(btnStart + btnTag.length, btnEnd).trim().length > 0;
          if (!hasText) {
            a11yCount++;
            const lineNum = content.substring(0, btnMatch.index).split('\n').length;
            console.log(`  ⚠️  ${file}:${lineNum}: <button> may need aria-label`);
          }
        }
      }
    } catch (e) { }
  }
  if (a11yCount === 0) console.log('✅ No obvious accessibility issues found');

  // Check 7: setInterval without cleanup
  console.log('\n─── 7. Timer/Interval Cleanup Check ───\n');
  let timerCount = 0;
  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      const intervalRegex = /setInterval\(/g;
      let match;
      while ((match = intervalRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        // Check if there's a corresponding clearInterval in a cleanup
        const remainingContent = content.substring(match.index);
        const hasCleanup = remainingContent.includes('clearInterval') &&
                          remainingContent.includes('return') &&
                          remainingContent.includes('useEffect');
        // Also check for useRef usage
        const hasRef = /(intervalRef|timerRef|watchId)\s*\.current\s*=\s*setInterval/.test(content);
        if (!hasCleanup && !hasRef) {
          timerCount++;
          console.log(`  ⚠️  ${file}:${lineNum}: setInterval may lack cleanup`);
        }
      }
    } catch (e) { }
  }
  if (timerCount === 0) console.log('✅ No obvious timer leak issues found');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 AUDIT SUMMARY\n');
  console.log(`  Files scanned: ${chatFiles.length}`);
  console.log(`  Debug statements: ${debugCount}`);
  console.log(`  TODO/FIXME/HACK: ${todoCount}`);
  console.log(`  Unsafe any usage: ${anyCount}`);
  console.log(`  XSS risks: ${xssCount}`);
  console.log(`  Accessibility issues: ${a11yCount}`);
  console.log(`  Potential timer leaks: ${timerCount}`);

  console.log('\n📋 RECOMMENDATIONS\n');
  if (debugCount > 0) console.log('  • Remove or guard console.log/debugger statements behind env.NODE_ENV check');
  if (todoCount > 0) console.log('  • Address TODOs or convert to tracked GitHub issues');
  if (anyCount > 0) console.log('  • Replace any types with proper interfaces/types');
  if (xssCount > 0) console.log('  • Review XSS risks immediately - sanitize user input before rendering');
  if (a11yCount > 0) console.log('  • Add missing alt texts and ARIA labels for accessibility');
  if (timerCount > 0) console.log('  • Add cleanup for timers/intervals in useEffect returns');

  console.log('\n✅ Audit complete\n');
}

runAudit().catch(console.error);
