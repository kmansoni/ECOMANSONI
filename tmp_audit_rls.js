const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

let allSql = '';
for (const file of files) {
    allSql += fs.readFileSync(path.join(migrationsDir, file), 'utf8') + '\n';
}

// Find table names from CREATE TABLE (including IF NOT EXISTS)
const tableRegex = /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)/gi;
const tables = [];
let match;
while ((match = tableRegex.exec(allSql)) !== null) {
    const tableName = match[2];
    if (!tables.includes(tableName)) {
        tables.push(tableName);
    }
}

// Find tables with RLS enabled: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
const rlsRegex = /ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const rlsTables = [];
while ((match = rlsRegex.exec(allSql)) !== null) {
    const tableName = match[2];
    if (!rlsTables.includes(tableName)) {
        rlsTables.push(tableName);
    }
}

// Find tables with policies: CREATE POLICY ... ON ...
const policyRegex = /CREATE\s+POLICY\s+[^\s]+\s+ON\s+(IF\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)/gi;
const policyTables = [];
while ((match = policyRegex.exec(allSql)) !== null) {
    const tableName = match[2];
    if (!policyTables.includes(tableName)) {
        policyTables.push(tableName);
    }
}

// Now compute missing
const missingRLS = tables.filter(t => !rlsTables.includes(t));
const missingPolicies = tables.filter(t => !policyTables.includes(t));

console.log(`Total tables: ${tables.length}`);
console.log(`Tables with RLS enabled: ${rlsTables.length}`);
console.log(`Tables with policies: ${policyTables.length}`);
console.log(`\nTables missing RLS enable (${missingRLS.length}):`);
if (missingRLS.length > 0) {
    console.log(missingRLS.join(', '));
} else {
    console.log('None');
}
console.log(`\nTables missing policies (${missingPolicies.length}):`);
if (missingPolicies.length > 0) {
    console.log(missingPolicies.join(', '));
} else {
    console.log('None');
}