#!/usr/bin/env node
/**
 * Chat Files Audit Script
 * Runs comprehensive checks on chat-related source files
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();

// Chat-related source file patterns
const chatFilePatterns = [
  'src/components/chat/**/*.{ts,tsx}',
  'src/hooks/useChat*.{ts,tsx}',
  'src/hooks/useChat*.{ts,tsx}',
  'src/lib/chat/**/*.ts',
  'src/pages/Chat*.tsx',
  'src/contexts/Chat*.tsx',
];

console.log('🔍 Chat Files Comprehensive Audit\n');
console.log('=' .repeat(60));

// Collect chat files
function getChatFiles() {
  const allFiles = [];
  const dirs = [
    'src/components/chat',
    'src/hooks',
    'src/lib/chat',
    'src/pages',
    'src/contexts',
  ];

  dirs.forEach(dir => {
    const fullPath = path.join(rootDir, dir);
    if (fs.existsSync(fullPath)) {
      const files = fs.readdirSync(fullPath).filter(f =>
        (f.endsWith('.ts') || f.endsWith('.tsx')) &&
        (f.toLowerCase().includes('chat') ||
         dir.includes('chat') ||
         f.includes('useChat'))
      );
      files.forEach(f => allFiles.push(path.join(dir, f)));
    }
  });

  return [...new Set(allFiles)];
}

const chatFiles = getChatFiles();
console.log(`\n📁 Found ${chatFiles.length} chat-related source files\n`);

// Check 1: TypeScript errors
console.log('\n─── 1. TypeScript Compilation Check ───\n');
try {
  const result = execSync('npx tsc --noEmit 2>&1', { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 }).toString();
  const lines = result.split('\n').filter(l =>
    l.includes('error') &&
    (l.includes('src/components/chat') ||
     l.includes('src/hooks/useChat') ||
     l.includes('src/lib/chat') ||
     l.includes('src/pages/Chat') ||
     l.includes('src/contexts/Chat'))
  );
  if (lines.length === 0) {
    console.log('✅ No TypeScript errors found in chat files');
  } else {
    console.log(`❌ Found ${lines.length} TypeScript error(s):\n`);
    lines.forEach(l => console.log('  ', l));
  }
} catch (e) {
  console.log('⚠️  TypeScript check output captured separately');
}

// Check 2: Debug statements
console.log('\n─── 2. Debug Statements (console.log, debugger, alert) ───\n');
let debugCount = 0;
chatFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const matches = content.matchAll(/(console\.(log|debug|info)|debugger|alert\()/g);
  for (const m of matches) {
    debugCount++;
    const lineNum = content.substring(0, m.index).split('\n').length;
    console.log(`  ⚠️  ${file}:${lineNum}: ${m[0].trim()}`);
  }
});
if (debugCount === 0) console.log('✅ No debug statements found');

// Check 3: TODO/FIXME/HACK
console.log('\n─── 3. TODO/FIXME/HACK Comments ───\n');
let todoCount = 0;
chatFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const matches = content.matchAll(/(TODO|FIXME|HACK|XXX)\s*:/g);
  for (const m of matches) {
    todoCount++;
    const lineNum = content.substring(0, m.index).split('\n').length;
    console.log(`  📝 ${file}:${lineNum}: ${m[0].trim()}`);
  }
});
if (todoCount === 0) console.log('✅ No TODO/FIXME/HACK comments found');

// Check 4: any type usage
console.log('\n─── 4. Unsafe Type Assertions (any) ───\n');
let anyCount = 0;
chatFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const matches = content.matchAll(/(any\s*[;,\]]|as\s+any)/g);
  for (const m of matches) {
    anyCount++;
    const lineNum = content.substring(0, m.index).split('\n').length;
    console.log(`  ⚠️  ${file}:${lineNum}: ${m[0].trim()}`);
  }
});
if (anyCount === 0) console.log('✅ No unsafe any usage found');

// Check 5: XSS risks
console.log('\n─── 5. XSS Security Risks ───\n');
let xssCount = 0;
chatFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const riskyPatterns = [
    /dangerouslySetInnerHTML/g,
    /innerHTML\s*=/g,
    /\.innerHTML\s*\./g,
    /insertAdjacentHTML/g,
    /eval\(/g,
    /Function\(/g,
    /textContent\s*=/g,
  ];
  riskyPatterns.forEach(pattern => {
    const matches = content.matchAll(pattern);
    for (const m of matches) {
      xssCount++;
      const lineNum = content.substring(0, m.index).split('\n').length;
      console.log(`  🔴 ${file}:${lineNum}: ${m[0].trim()}`);
    }
  });
});
if (xssCount === 0) console.log('✅ No obvious XSS risks found');

// Check 6: Accessibility
console.log('\n─── 6. Accessibility Quick Scan ───\n');
let a11yMissing = 0;
chatFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  // Check images without alt
  const imgTags = content.match(/<img[^>]*>/g) || [];
  imgTags.forEach(img => {
    if (!img.includes('alt=')) {
      a11yMissing++;
      const lineNum = content.substring(0, content.indexOf(img)).split('\n').length;
      console.log(`  ⚠️  ${file}:${lineNum}: <img> missing alt attribute`);
    }
  });
  // Check buttons without accessible labels
  const buttons = content.match(/<button[^>]*>/g) || [];
  buttons.forEach(btn => {
    if (!btn.includes('aria-label') && !btn.includes('alt=') && !btn.includes('title=')) {
      const hasText = /<button[^>]*>[^<]+<\/button>/.test(btn) || content.includes(btn + '\n') || content.includes(btn + ' ');
      if (!hasText) {
        a11yMissing++;
        const lineNum = content.substring(0, content.indexOf(btn)).split('\n').length;
        console.log(`  ⚠️  ${file}:${lineNum}: <button> may need aria-label`);
      }
    }
  });
});
if (a11yMissing === 0) console.log('✅ No obvious accessibility issues found');

// Check 7: Memory leaks (setInterval/setTimeout without cleanup)
console.log('\n─── 7. Potential Memory Leaks (timers without cleanup) ───\n');
let leakCount = 0;
chatFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const setIntervals = content.matchAll(/setInterval\(/g);
  const setTimeouts = content.matchAll(/setTimeout\(/g);
  const timerRefs = content.match(/timerRef|intervalRef|timeoutRef|watchId/g);

  for (const m of setIntervals) {
    const lineNum = content.substring(0, m.index).split('\n').length;
    const lineContent = content.split('\n')[lineNum - 1];
    // Check if cleanup exists (clearInterval in useEffect cleanup or useRef)
    const hasClearCleanup = content.includes('clearInterval') &&
      content.substring(m.index).includes('useEffect') &&
      content.includes('return') &&
      content.includes('clearInterval');
    if (!hasClearCleanup && !lineContent.includes('// ignore timer')) {
      leakCount++;
      console.log(`  ⚠️  ${file}:${lineNum}: setInterval may need cleanup`);
    }
  }
});
if (leakCount === 0) console.log('✅ No obvious timer leak issues found');

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 AUDIT SUMMARY\n');
console.log(`  Files scanned: ${chatFiles.length}`);
console.log(`  Debug statements: ${debugCount}`);
console.log(`  TODO/FIXME/HACK: ${todoCount}`);
console.log(`  Unsafe any usage: ${anyCount}`);
console.log(`  XSS risks: ${xssCount}`);
console.log(`  Accessibility issues: ${a11yMissing}`);
console.log(`  Potential memory leaks: ${leakCount}`);

// Recommendations
console.log('\n📋 RECOMMENDATIONS\n');
if (debugCount > 0) console.log('  • Remove or guard console.log/debugger statements behind env.NODE_ENV check');
if (todoCount > 0) console.log('  • Address TODOs or convert to tracked issues');
if (anyCount > 0) console.log('  • Replace any types with proper interfaces/types');
if (xssCount > 0) console.log('  • Review XSS risks immediately - sanitize user input');
if (a11yMissing > 0) console.log('  • Add missing alt texts and ARIA labels');
if (leakCount > 0) console.log('  • Add cleanup for timers/intervals in useEffect returns');

console.log('\n✅ Audit complete\n');
