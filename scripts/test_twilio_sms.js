/**
 * Script de test d'envoi SMS Horeb Secure via Twilio
 * Usage: node scripts/test_twilio_sms.js +22507XXXXXXXX
 */
require('dotenv').config({ path: '.env.local' });
const https = require('https');

const targetPhone = process.argv[2];

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const rawFrom = process.env.TWILIO_FROM_PHONE || 'HorebSecure';
const twilioFrom = rawFrom.startsWith('+') ? rawFrom.replace(/\s+/g, '') : rawFrom.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11);

console.log('====================================================');
console.log('📡 HOREB SECURE - TEST DE LA PASSERELLE SMS TWILIO');
console.log('====================================================');
console.log(`SID Twilio   : ${accountSid ? accountSid.substring(0, 6) + '...' + accountSid.slice(-4) : 'NON DÉFINI'}`);
console.log(`Auth Token   : ${authToken ? 'PRÉSENT (Masqué)' : 'NON DÉFINI'}`);
console.log(`Expéditeur   : ${twilioFrom}`);
console.log(`Destinataire : ${targetPhone || 'Non spécifié (Passez un numéro en argument)'}`);
console.log('----------------------------------------------------');

if (!accountSid || !authToken) {
  console.error('❌ Erreur : TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN manquant dans .env.local');
  process.exit(1);
}

if (!targetPhone) {
  console.log('💡 Note : Vous pouvez tester l\'envoi en passant votre numéro de téléphone :');
  console.log('   node scripts/test_twilio_sms.js +2250747000000');
  console.log('\nValidation du compte Twilio uniquement...');
  
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  https.get({
    hostname: 'api.twilio.com',
    port: 443,
    path: `/2010-04-01/Accounts/${accountSid}.json`,
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
  }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      if (res.statusCode === 200) {
        const j = JSON.parse(d);
        console.log(`✅ Connexion réussie ! Compte : "${j.friendly_name}" (Statut: ${j.status})`);
      } else {
        console.error(`❌ Échec HTTP ${res.statusCode}:`, d);
      }
    });
  });
  return;
}

const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
const smsBody = `[HOREB SECURE] Alerte Test : La passerelle SMS d'urgence est operationnelle. Berekia Security connectee.`;

const postData = new URLSearchParams({
  From: twilioFrom,
  To: targetPhone,
  Body: smsBody
}).toString();

const req = https.request({
  hostname: 'api.twilio.com',
  port: 443,
  path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
  method: 'POST',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('✅ SMS ENVOYÉ AVEC SUCCÈS !');
        console.log(`ID Message Twilio (SID) : ${json.sid}`);
        console.log(`Statut de transmission   : ${json.status}`);
        console.log(`Destinataire             : ${json.to}`);
      } else {
        console.error(`❌ Échec de transmission (Code Twilio: ${json.code}):`);
        console.error(`   Message : ${json.message}`);
        if (json.code === 572002 || json.code === 21608) {
          console.log('\n💡 CONSEIL COMPTE TRIAL TWILIO :');
          console.log('   Sur un compte Twilio gratuit/d\'essai, vous devez :');
          console.log('   1. Cliquer sur "Get a phone number" sur console.twilio.com pour obtenir un numéro d\'essai.');
          console.log('   2. Ou ajouter le numéro destinataire dans "Verified Caller IDs" sur console.twilio.com.');
        }
      }
    } catch (e) {
      console.log('Réponse:', data);
    }
  });
});

req.on('error', (err) => console.error('Erreur réseau:', err));
req.write(postData);
req.end();
