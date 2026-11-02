const fs = require('fs');
const readline = require('readline');

async function readSteps() {
  const filePath = 'C:\\Users\\HP ELTEBOO\\.gemini\\antigravity-ide\\brain\\23f5033e-ef84-4e3b-9d19-f61be0be893d\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const obj = JSON.parse(line);
    if (obj.step_index >= 1171 && obj.step_index <= 1186) {
      console.log(`--- STEP ${obj.step_index} (${obj.type}) ---`);
      if (obj.thinking) console.log('Thinking:', obj.thinking.slice(0, 200));
      if (obj.tool_calls) console.log('Tool calls:', JSON.stringify(obj.tool_calls));
      if (obj.content) console.log('Content:', typeof obj.content === 'string' ? obj.content.slice(0, 300) : obj.content);
    }
  }
}

readSteps().catch(console.error);
