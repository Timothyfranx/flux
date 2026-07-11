const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');
const { keccak256, stringToBytes } = require('viem');

const targets = ['0x40d8d67b', '0x18dce79f'];

console.log('Scanning all coston2 ABI definitions...');

for (const [abiName, abi] of Object.entries(coston2)) {
  if (!Array.isArray(abi)) continue;

  for (const item of abi) {
    if (item.type === 'error' || item.type === 'function') {
      const params = (item.inputs || []).map(input => input.type).join(',');
      const signature = `${item.name}(${params})`;
      const hash = keccak256(stringToBytes(signature));
      const selector = hash.substring(0, 10);

      if (targets.includes(selector)) {
        console.log(`\nMATCH FOUND in ABI: ${abiName}`);
        console.log(`Type: ${item.type}`);
        console.log(`Signature: ${signature}`);
        console.log(`Selector: ${selector}`);
      }
    }
  }
}
console.log('Done scanning coston2 ABIs.');
