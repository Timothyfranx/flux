const { keccak256, stringToBytes } = require('viem');

const errorNames = [
  'AlreadyExecuted',
  'AlreadyFinalized',
  'AlreadyProcessed',
  'AttestationAlreadyProcessed',
  'ProofAlreadyProcessed',
  'DuplicatePayment',
  'PaymentAlreadyFinalized',
  'PaymentAlreadyExecuted',
  'PaymentAlreadySubmitted',
  'DirectMintingAlreadyExecuted',
  'DirectMintingAlreadyProcessed',
  'DirectMintingAlreadyFinalized',
  'DirectMintAlreadyProcessed',
  'PaymentAlreadyProcessed',
  'PaymentAlreadyRedeemed',
  'PaymentAlreadyMinted',
  'DirectMintAlreadyMinted',
  'DirectMintingAlreadyMinted',
  'DirectMintingPaymentAlreadyUsed',
  'DirectMintPaymentAlreadyUsed',
  'PaymentAlreadyUsed',
];

const target = '0x18dce79f';

console.log('Searching for target selector:', target);

for (const name of errorNames) {
  const signatures = [
    `${name}()`,
    `${name}(bytes32)`,
    `${name}(address)`,
    `${name}(uint256)`,
  ];

  for (const sig of signatures) {
    const hash = keccak256(stringToBytes(sig));
    const selector = hash.substring(0, 10);
    if (selector === target) {
      console.log(`\nMATCH FOUND!`);
      console.log(`Signature: ${sig}`);
      console.log(`Selector: ${selector}`);
    }
  }
}
