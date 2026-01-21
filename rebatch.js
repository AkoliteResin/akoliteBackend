const http = require('http');
const config = require('./config');

const data = JSON.stringify({
  scheduledDate: '2025-11-01',
  resinType: 'Alkyd Resin'
});

const options = {
  hostname: config.HOST,
  port: config.PORT,
  path: '/api/batches/rebatch',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  res.on('end', () => {
    console.log('✅ Response:', responseData);
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.write(data);
req.end();
