const fs = require('fs');
const path = require('path');

const ROUND_ID = 1390875;
const REQUEST_BYTES = '0x5852505061796d656e7400000000000000000000000000000000000000000000746573745852500000000000000000000000000000000000000000000000000095d9d575228f8afad9d028cd3f8ba50c83f15254bdadff2d4681f0d1bc23586f710edc95e4113a70323f7fb4de8c6f34d92c7ac971a8fc53e44b92849354a38a0000000000000000000000000000000000000000000000000000000000000000';

async function main() {
  const url = 'https://ctn2-data-availability.flare.network/api/v1/fdc/proof-by-request-round-raw';
  const body = {
    votingRoundId: ROUND_ID,
    requestBytes: REQUEST_BYTES
  };

  try {
    console.log(`Fetching FDC proof for round ${ROUND_ID} from DA Layer...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('Response Status:', response.status);
    const data = await response.json();
    
    if (data && data.proof) {
      console.log('Proof successfully retrieved!');
      const filePath = path.join(__dirname, '../proof.json');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`Proof saved to ${filePath}`);
    } else {
      console.log('Proof not ready or not found. Response details:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Request Error:', error.message);
  }
}

main();
