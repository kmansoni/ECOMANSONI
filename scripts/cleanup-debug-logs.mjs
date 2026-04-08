#!/usr/bin/env node
/**
 * Удаляет все строки с 🔴 CALL_DEBUG из VideoCallProvider.tsx
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '../src/contexts/video-call/VideoCallProvider.tsx');

const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const cleaned = lines.filter(line => !line.includes('CALL_DEBUG'));

const removed = lines.length - cleaned.length;
console.log(`Удалено ${removed} debug-строк из VideoCallProvider.tsx`);

writeFileSync(filePath, cleaned.join('\n'), 'utf8');
console.log('Файл сохранён.');
