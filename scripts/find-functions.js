const fs = require('fs');

const sql = fs.readFileSync('supabase/migrations/20260924120000_securia_rpc_functions.sql', 'utf8');
const matches = [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z0-9_]+)/gi)];
console.log('Functions in 20260924120000_securia_rpc_functions.sql:');
matches.forEach(m => console.log(' -', m[1]));
