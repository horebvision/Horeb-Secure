const fs = require('fs');
const readline = require('readline');

async function searchTranscript() {
  const filePath = 'C:\\Users\\HP ELTEBOO\\.gemini\\antigravity-ide\\brain\\23f5033e-ef84-4e3b-9d19-f61be0be893d\\.system_generated\\logs\\transcript.jsonl';
  if (!fs.existsSync(filePath)) {
    console.log('No transcript file found');
    return;
  }
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('phase3') && line.includes('.sql')) {
      console.log('Found line:', line.slice(0, 300));
    }
    if (line.includes('apply_migration') || line.includes('execute_sql')) {
      console.log('Found tool call line:', line.slice(0, 300));
    }
  }
}

searchTranscript().catch(console.error);
