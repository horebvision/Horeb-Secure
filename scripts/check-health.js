const http = require('http');

http.get('http://localhost:3000/api/health', (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    console.log('STATUS CODE:', res.statusCode);
    console.log('BODY:', data);
  });
});
