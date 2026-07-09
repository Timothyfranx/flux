const TX_HASH = '0x710EDC95E4113A70323F7FB4DE8C6F34D92C7AC971A8FC53E44B92849354A38A';
const API_KEY = '00000000-0000-0000-0000-000000000000';

function toBytes32(str) {
  const hex = Buffer.from(str, 'utf8').toString('hex');
  return '0x' + hex.padEnd(64, '0');
}

async function testPath(path, body) {
  const url = `https://fdc-verifiers-testnet.flare.network/verifier/${path}`;
  console.log(`\nTesting URL: ${url}`);
  console.log(`Body:`, JSON.stringify(body, null, 2));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY
      },
      body: JSON.stringify(body)
    });

    console.log('Response Status:', response.status);
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      console.log('Response Data:', JSON.stringify(json, null, 2));
    } catch {
      console.log('Raw Response:', text.substring(0, 300));
    }
  } catch (error) {
    console.error('Request Error:', error.message);
  }
}

async function main() {
  // Let's compute the bytes32 representations:
  const paymentBytes32 = toBytes32('Payment');
  const xrpPaymentBytes32 = toBytes32('XRPPayment');
  const xrpBytes32 = toBytes32('xrp');
  const xrpUpperBytes32 = toBytes32('XRP');
  const testXrpBytes32 = toBytes32('testXRP');

  console.log('toBytes32("Payment"):', paymentBytes32);
  console.log('toBytes32("XRPPayment"):', xrpPaymentBytes32);
  console.log('toBytes32("xrp"):', xrpBytes32);
  console.log('toBytes32("XRP"):', xrpUpperBytes32);
  console.log('toBytes32("testXRP"):', testXrpBytes32);

  // Combination 1: sourceId = 'testXRP' (bytes32), attestationType = 'Payment' (bytes32)
  await testPath('xrp/XRPPayment/prepareRequest', {
    attestationType: paymentBytes32,
    sourceId: testXrpBytes32,
    requestBody: {
      transactionId: TX_HASH,
      proofOwner: '0x0000000000000000000000000000000000000000'
    }
  });

  // Combination 2: sourceId = 'xrp' (bytes32), attestationType = 'Payment' (bytes32)
  await testPath('xrp/XRPPayment/prepareRequest', {
    attestationType: paymentBytes32,
    sourceId: xrpBytes32,
    requestBody: {
      transactionId: TX_HASH,
      proofOwner: '0x0000000000000000000000000000000000000000'
    }
  });

  // Combination 3: sourceId = 'testXRP' (bytes32), attestationType = 'XRPPayment' (bytes32)
  await testPath('xrp/XRPPayment/prepareRequest', {
    attestationType: xrpPaymentBytes32,
    sourceId: testXrpBytes32,
    requestBody: {
      transactionId: TX_HASH,
      proofOwner: '0x0000000000000000000000000000000000000000'
    }
  });
}

main();
