const https = require('https');

https.get('https://horeb-secure.netlify.app/pricing', (res) => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', async () => {
    const regex = /src="(\/_next\/[^"]+)"/g;
    let match;
    const scripts = [];
    while ((match = regex.exec(html)) !== null) {
      scripts.push(match[1]);
    }
    console.log('Total scripts found:', scripts.length);
    for (const src of scripts) {
      await new Promise(r => {
        https.get('https://horeb-secure.netlify.app' + src, sres => {
          console.log(src, '-> Status:', sres.statusCode);
          r();
        }).on('error', e => {
          console.log(src, '-> Error:', e.message);
          r();
        });
      });
    }
  });
});
