const TX_HASH = '0x710EDC95E4113A70323F7FB4DE8C6F34D92C7AC971A8FC53E44B92849354A38A';

async function main() {
  const url = 'https://fdc-verifiers-testnet.flare.network/verifier/web2/Web2Json/prepareRequest';
  const body = {
    attestationType: '0x08',
    sourceId: 'testXRP',
    requestBody: {
      transactionId: TX_HASH,
      proofOwner: '0x0000000000000000000000000000000000000000'
    }
  };

  try {
    console.log('Sending request to prepare FDC request...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('Response Status:', response.status);
    const data = await response.json();
    console.log('Response Data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Request Error:', error.message);
  }
}

main();
