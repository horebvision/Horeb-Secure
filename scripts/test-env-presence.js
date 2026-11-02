const fs = require('fs');

const content = fs.readFileSync('.env.local', 'utf8');
const map = {};
for (const line of content.split('\n')) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) {
    map[m[1].trim()] = m[2].trim().length > 0;
  }
}

console.log('Env keys present and non-empty in .env.local:');
for (const [k, v] of Object.entries(map)) {
  console.log(`- ${k}: ${v}`);
}
