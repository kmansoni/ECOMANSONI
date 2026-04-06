---
name: dependency-audit
description: "Аудит зависимостей: npm audit, устаревшие пакеты, лицензионный риск, дублирующиеся зависимости, bundle size влияние. Use when: аудит зависимостей, npm audit, устаревшие пакеты, лицензии, дубли."
argument-hint: "[focus: security | licenses | outdated | duplicates | all]"
user-invocable: true
---

# Dependency Audit — Аудит зависимостей

---

## Полный аудит за один прогон

```bash
echo "=== 1. Security Vulnerabilities ===" && npm audit --audit-level=info 2>&1 | tail -5
echo "=== 2. Outdated Packages ===" && npm outdated 2>&1 | head -30
echo "=== 3. Duplicate Packages ===" && npm ls --all 2>&1 | grep "deduped\|WARN" | head -20
echo "=== 4. Package Count ===" && cat package.json | node -e "const p=require('/dev/stdin'); console.log('prod:', Object.keys(p.dependencies||{}).length, 'dev:', Object.keys(p.devDependencies||{}).length)"
```

---

## Security Audit

```bash
# Полный отчёт
npm audit --json | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const vulns = data.vulnerabilities;
const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
Object.values(vulns).forEach(v => counts[v.severity]++);
console.table(counts);
console.log('Total direct:', data.metadata?.vulnerabilities?.total ?? 'N/A');
"

# Только те которые можно исправить
npm audit --json | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const fixable = Object.entries(data.vulnerabilities || {})
  .filter(([,v]) => v.fixAvailable && v.severity !== 'info')
  .map(([name, v]) => ({name, severity: v.severity, fix: v.fixAvailable}));
console.table(fixable.slice(0, 20));
"
```

---

## License Audit

```bash
# Установить license-checker если нет
npx license-checker --summary 2>/dev/null

# Найти потенциально проблемные лицензии (GPL, AGPL, LGPL)
npx license-checker --json 2>/dev/null | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const risky = Object.entries(data).filter(([,v]) =>
  /GPL|AGPL|LGPL|SSPL|BUSL|Commons Clause/.test(v.licenses)
);
risky.forEach(([name, v]) => console.log(name, ':', v.licenses));
console.log('Всего подозрительных:', risky.length);
"

# Разрешённые лицензии для коммерческого проекта
# MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, CC0-1.0
# Требуют проверки: LGPL-2.1 (dinamически линкованные — OK), MPL-2.0
# Запрещены: GPL-2.0, GPL-3.0, AGPL-3.0, SSPL-1.0
```

---

## Outdated Packages Report

```bash
# Структурированный отчёт об устаревших пакетах
npm outdated --json 2>/dev/null | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8') || '{}');
const items = Object.entries(data).map(([name, v]) => ({
  name,
  current: v.current,
  wanted: v.wanted,
  latest: v.latest,
  type: v.type,
  isMajor: parseInt(v.current) < parseInt(v.latest),
}));
const major = items.filter(i => i.isMajor);
const minor = items.filter(i => !i.isMajor);
console.log('Major updates (breaking potential):', major.length);
major.forEach(i => console.log(' ', i.name, i.current, '->', i.latest));
console.log('Minor/patch updates:', minor.length);
"
```

---

## Duplicate Dependencies

```bash
# Дубли увеличивают bundle size
npm ls --all 2>/dev/null | grep " deduped\| UNMET" | head -20

# Найти пакеты с несколькими версиями
npm ls --all --json 2>/dev/null | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const seen = {};
function walk(node, depth=0) {
  if (!node.dependencies) return;
  Object.entries(node.dependencies).forEach(([name, dep]) => {
    seen[name] = seen[name] || new Set();
    seen[name].add(dep.version);
    walk(dep, depth+1);
  });
}
walk(data);
Object.entries(seen).filter(([,v]) => v.size > 1).forEach(([name, versions]) => {
  console.log(name + ': [' + [...versions].join(', ') + ']');
});
" 2>/dev/null | head -20
```

---

## Чеклист

- [ ] `npm audit` — 0 critical, 0 high
- [ ] Нет GPL/AGPL лицензий в коммерческом коде
- [ ] Major outdated < 5 пакетов (приоритет — security пакеты)
- [ ] Нет критических дубликатов (lodash, react — частые дубли)
- [ ] devDependencies не попадают в production bundle
- [ ] `package-lock.json` соответствует `package.json` (нет ручных правок)
