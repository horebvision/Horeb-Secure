const http = require('http');

http.get('http://localhost:3000/api/pilot/status', (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    try {
      console.log('Body:', JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log('Raw body:', data);
    }
  });
});
