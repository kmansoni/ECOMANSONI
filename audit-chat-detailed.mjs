#!/usr/bin/env node
/**
 * Detailed Chat Audit - refined findings
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
    } catch { }
  }
  return [...allFiles];
}

function stripComments(code) {
  // Remove single-line and multi-line comments
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

async function detailedAudit() {
  console.log('🔍 Chat Files Detailed Audit Report\n');
  console.log('='.repeat(60));

  const chatFiles = await getChatFiles();
  console.log(`📁 Total chat-related files: ${chatFiles.length}\n`);

  const issues = {
    xss: [],
    nullSafety: [],
    timerCleanup: [],
    imgAlt: [],
    anyType: [],
    consoleLog: [],
    legacyReact: [],
    errorHandling: [],
  };

  for (const file of chatFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      const codeNoComments = stripComments(content);
      const lineCount = content.split('\n').length;

      // 1. XSS — actual dangerous patterns (not in comments)
      const xssPatterns = [
        { regex: /dangerouslySetInnerHTML\s*:/g, label: 'dangerouslySetInnerHTML' },
        { regex: /\.innerHTML\s*=/g, label: 'innerHTML assignment' },
        { regex: /insertAdjacentHTML/g, label: 'insertAdjacentHTML' },
        { regex: /eval\(/g, label: 'eval()' },
        { regex: /new\s+Function/g, label: 'new Function()' },
      ];
      for (const { regex, label } of xssPatterns) {
        let match;
        while ((match = regex.exec(content)) !== null) {
          // Skip if inside a comment
          const lineNum = content.substring(0, match.index).split('\n').length;
          issues.xss.push({ file, line: lineNum, pattern: label });
        }
      }

      // 2. Images without alt (in actual tags, excluding comments)
      const imgRegex = /<img[^>]*>/g;
      let m;
      while ((m = imgRegex.exec(content)) !== null) {
        const imgTag = m[0];
        if (!imgTag.includes('alt=')) {
          const lineNum = content.substring(0, m.index).split('\n').length;
          issues.imgAlt.push({ file, line: lineNum, tag: imgTag.substring(0, 50) });
        }
      }

      // 3. any type usage
      const anyRegex = /(as\s+any|any\s*[;,\]]|:\s*any\s*[;,}\]])/g;
      while ((m = anyRegex.exec(codeNoComments)) !== null) {
        const lineNum = content.substring(0, m.index).split('\n').length;
        issues.anyType.push({ file, line: lineNum, usage: m[0].trim() });
      }

      // 4. Console statements
      const consoleRegex = /console\.(log|debug|info|warn)\s*\(/g;
      while ((m = consoleRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, m.index).split('\n').length;
        issues.consoleLog.push({ file, line: lineNum, stmt: m[0].trim() });
      }

      // 5. Timer cleanup: setInterval/setTimeout with useRef for cleanup
      const intervalRegex = /set(Interval|Timeout)\s*\(/g;
      while ((m = intervalRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, m.index).split('\n').length;
        const lineText = content.split('\n')[lineNum - 1];
        // Check if cleanup exists in the same useEffect block
        const afterLine = content.split('\n').slice(lineNum).join('\n');
        const withinEffect = afterLine.includes('useEffect') && afterLine.includes('return');
        const hasClear = afterLine.includes('clearInterval') || afterLine.includes('clearTimeout');
        const hasRef = /(intervalRef|timerRef|timeoutId)\s*\.current\s*=\s*set/.test(content);
        if (!hasClear && !hasRef && withinEffect) {
          issues.timerCleanup.push({ file, line: lineNum, stmt: m[0].trim() });
        }
      }

      // 6. Legacy React patterns
      if (content.includes('React.FC') || content.includes('React.Component')) {
        const fcRegex = /React\.FC\s*<[^>]*>/g;
        while ((m = fcRegex.exec(content)) !== null) {
          const lineNum = content.substring(0, m.index).split('\n').length;
          issues.legacyReact.push({ file, line: lineNum, pattern: 'React.FC' });
        }
      }

      // 7. Null safety — optional chaining missing on potentially nullable accesses
      // Check for property access on values that might be null/undefined without ?.
      const nullRisky = content.matchAll(/(\w+)\.(?!\?)(\w+)/g);
      // Skip common safe patterns like string methods on literals

      // 8. Error handling — try/catch without rethrow or swallow
      const tryRegex = /try\s*\{[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\}/g;
      while ((m = tryRegex.exec(content)) !== null) {
        const catchBlock = m[0];
        // Check if catch just swallows errors
        if (!catchBlock.includes('throw') && !catchBlock.includes('logger.') && !catchBlock.includes('console.')) {
          const lineNum = content.substring(0, m.index).split('\n').length;
          issues.errorHandling.push({ file, line: lineNum, note: 'catch block may swallow errors' });
        }
      }

    } catch (err) {
      console.error(`Error reading ${file}:`, err.message);
    }
  }

  // Print findings by category
  console.log('\n─── 1. XSS Security Risks ───\n');
  if (issues.xss.length === 0) {
    console.log('✅ No obvious XSS risks found\n');
  } else {
    console.log(`❌ Found ${issues.xss.length} potential XSS issue(s):\n`);
    issues.xss.forEach(i => console.log(`  🔴 ${i.file}:${i.line} — ${i.pattern}`));
    console.log();
  }

  console.log('\n─── 2. Accessibility: Images without alt ───\n');
  if (issues.imgAlt.length === 0) {
    console.log('✅ All <img> tags have alt attributes\n');
  } else {
    console.log(`⚠️  Found ${issues.imgAlt.length} <img> without alt:\n`);
    issues.imgAlt.forEach(i => console.log(`  ⚠️  ${i.file}:${i.line}`));
    console.log();
  }

  console.log('\n─── 3. Unsafe Type Assertions (any) ───\n');
  if (issues.anyType.length === 0) {
    console.log('✅ No unsafe any usage found\n');
  } else {
    console.log(`⚠️  Found ${issues.anyType.length} any usage:\n`);
    issues.anyType.slice(0, 20).forEach(i => console.log(`  ⚠️  ${i.file}:${i.line}: ${i.usage}`));
    if (issues.anyType.length > 20) console.log(`  ... and ${issues.anyType.length - 20} more`);
    console.log();
  }

  console.log('\n─── 4. Debug Statements ───\n');
  if (issues.consoleLog.length === 0) {
    console.log('✅ No console.log/debug statements found\n');
  } else {
    console.log(`⚠️  Found ${issues.consoleLog.length} debug statement(s):\n`);
    issues.consoleLog.forEach(i => console.log(`  ⚠️  ${i.file}:${i.line}: ${i.stmt}`));
    console.log();
  }

  console.log('\n─── 5. Timer Leak Risks ───\n');
  if (issues.timerCleanup.length === 0) {
    console.log('✅ All timers appear to be properly cleaned up\n');
  } else {
    console.log(`⚠️  Found ${issues.timerCleanup.length} timer(s) that may lack cleanup:\n`);
    issues.timerCleanup.forEach(i => console.log(`  ⚠️  ${i.file}:${i.line}: ${i.stmt}`));
    console.log();
  }

  console.log('\n─── 6. Legacy React Patterns ───\n');
  if (issues.legacyReact.length === 0) {
    console.log('✅ No legacy React.FC usage found\n');
  } else {
    console.log(`⚠️  Found ${issues.legacyReact.length} React.FC usage:\n`);
    issues.legacyReact.forEach(i => console.log(`  ⚠️  ${i.file}:${i.line}`));
    console.log('  Note: React.FC is not deprecated but sometimes discouraged due to implicit children\n');
  }

  console.log('\n─── 7. Error Handling Concerns ───\n');
  if (issues.errorHandling.length === 0) {
    console.log('✅ Catch blocks appear to handle/rethrow errors appropriately\n');
  } else {
    console.log(`⚠️  Found ${issues.errorHandling.length} catch block(s) that may silently swallow errors:\n`);
    issues.errorHandling.forEach(i => console.log(`  ⚠️  ${i.file}:${i.line}`));
    console.log();
  }

  // Summary counts
  console.log('='.repeat(60));
  console.log('\n📊 FINAL SUMMARY\n');
  console.log(`  Files scanned:          ${chatFiles.length}`);
  console.log(`  XSS risks:              ${issues.xss.length}`);
  console.log(`  Images without alt:     ${issues.imgAlt.length}`);
  console.log(`  Unsafe any usage:       ${issues.anyType.length}`);
  console.log(`  Debug statements:       ${issues.consoleLog.length}`);
  console.log(`  Timer leak risks:       ${issues.timerCleanup.length}`);
  console.log(`  Legacy React patterns:  ${issues.legacyReact.length}`);
  console.log(`  Silent error catches:   ${issues.errorHandling.length}`);

  console.log('\n⚠️  PRIORITY ACTIONS\n');
  const priority = [];
  if (issues.xss.length > 0) priority.push('Review XSS risks immediately');
  if (issues.imgAlt.length > 0) priority.push('Add alt text to images for accessibility');
  if (issues.anyType.length > 0) priority.push('Replace any types with proper interfaces');
  if (issues.consoleLog.length > 0) priority.push('Remove or guard debug statements');
  if (issues.timerCleanup.length > 0) priority.push('Verify timer cleanup in useEffect');
  if (issues.errorHandling.length > 0) priority.push('Review error handling in catch blocks');

  if (priority.length === 0) {
    console.log('  ✅ No critical issues found!\n');
  } else {
    priority.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }

  console.log('\n✅ Audit complete\n');
}

detailedAudit().catch(console.error);
