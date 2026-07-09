const xrpl = require('xrpl');
require('dotenv').config();

const VAULT_ADDRESS = 'rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p'; // Resolved from AssetManagerFXRP

async function main() {
  const seed = process.env.XRPL_SEED;
  const recipientAddress = process.env.COSTON2_ADDRESS;

  if (!seed || !recipientAddress) {
    console.error('Error: XRPL_SEED and COSTON2_ADDRESS must be set in .env');
    process.exit(1);
  }

  // Remove '0x' prefix from EVM address and lowercase it
  const cleanAddress = recipientAddress.replace('0x', '').toLowerCase();

  // Construct binary MemoData:
  // Prefix (8 bytes): 4642505266410018 (DIRECT_MINTING)
  // Padding (4 bytes): 00000000
  // Recipient (20 bytes): cleanAddress
  const memoData = ('4642505266410018' + '00000000' + cleanAddress).toUpperCase();
  const memoType = Buffer.from('FAssets').toString('hex').toUpperCase();
  const memoFormat = Buffer.from('application/octet-stream').toString('hex').toUpperCase();

  console.log('Recipient Address:', recipientAddress);
  console.log('Constructed MemoData (Hex):', memoData);

  const client = new xrpl.Client('wss://s.altnet.rippletest.net:51233/');
  await client.connect();

  const wallet = xrpl.Wallet.fromSeed(seed);
  console.log('Sending from XRPL Address:', wallet.address);

  // Total amount: 1 lot (10 XRP) + minting fee (0.1 XRP) + executor fee (0.1 XRP) = 10.2 XRP
  // 10.2 XRP = 10,200,000 drops
  const amountDrops = '10200000';

  const tx = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: VAULT_ADDRESS,
    Amount: amountDrops,
    Memos: [
      {
        Memo: {
          MemoType: memoType,
          MemoFormat: memoFormat,
          MemoData: memoData
        }
      }
    ]
  };

  try {
    console.log('Preparing transaction...');
    const prepared = await client.autofill(tx);
    console.log('Signing transaction...');
    const signed = wallet.sign(prepared);
    console.log('Submitting transaction and waiting for consensus...');
    const result = await client.submitAndWait(signed.tx_blob);

    console.log('\nTransaction successfully validated!');
    console.log('Result Code:', result.result.meta.TransactionResult);
    console.log('XRPL Transaction Hash:', result.result.hash);
    console.log('Please save this hash for the FDC verification step.');
  } catch (error) {
    console.error('Error executing XRPL payment:', error);
  } finally {
    await client.disconnect();
  }
}

main();
