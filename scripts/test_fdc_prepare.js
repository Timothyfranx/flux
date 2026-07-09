const TX_HASH = '0x710EDC95E4113A70323F7FB4DE8C6F34D92C7AC971A8FC53E44B92849354A38A';
const API_KEY = '00000000-0000-0000-0000-000000000000';

async function testPath(path, body) {
  const url = `https://fdc-verifiers-testnet.flare.network/verifier/${path}`;
  console.log(`\nTesting URL: ${url}`);
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
  const bodyTestXRP = {
    attestationType: '0x08',
    sourceId: 'testXRP',
    requestBody: {
      transactionId: TX_HASH,
      proofOwner: '0x0000000000000000000000000000000000000000'
    }
  };

  const bodyXRP = {
    attestationType: '0x08',
    sourceId: 'xrp',
    requestBody: {
      transactionId: TX_HASH,
      proofOwner: '0x0000000000000000000000000000000000000000'
    }
  };

  // Permutations
  await testPath('testXRP/XRPPayment/prepareRequest', bodyTestXRP);
  await testPath('xrp/XRPPayment/prepareRequest', bodyXRP);
}

main();
