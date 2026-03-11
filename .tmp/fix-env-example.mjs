import { readFileSync, writeFileSync } from 'node:fs';

const t = readFileSync('.env.example', 'utf8');
const lines = t.split('\n');

// Найдём строки с \ufffd (replacement characters) в секции Media Server
let found = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Media Server') && lines[i].includes('\ufffd')) {
    found = i;
    break;
  }
}

console.log('Found Media Server line at:', found + 1);
if (found >= 0) {
  console.log('Lines around it:');
  for (let i = found - 1; i <= found + 4; i++) {
    console.log(i + 1, JSON.stringify(lines[i]?.slice(0, 100)));
  }
  
  // Заменяем строки found, found+1, found+2, found+3
  lines[found] = '# \uD83C\uDFAC Media Server (AdminVPS) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550';
  lines[found + 1] = '# URL \u043c\u0435\u0434\u0438\u0430-\u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043d\u0430 AdminVPS. \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0444\u043e\u0442\u043e/\u0432\u0438\u0434\u0435\u043e/\u0430\u0443\u0434\u0438\u043e \u0438\u0434\u0451\u0442 \u0447\u0435\u0440\u0435\u0437 \u043d\u0435\u0433\u043e.';
  lines[found + 2] = '# \u0412 production: https://media.mansoni.ru';
  lines[found + 3] = '# \u0412 dev: http://localhost:3100';
  
  writeFileSync('.env.example', lines.join('\n'), 'utf8');
  console.log('FIXED .env.example');
} else {
  console.log('Not found');
}
