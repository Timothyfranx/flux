const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');
const { keccak256, stringToBytes } = require('viem');

const targetSelector = '0x40d8d67b';

// Let's inspect errors in all ABIs in coston2
console.log('Searching for error with selector:', targetSelector);

for (const [abiName, abi] of Object.entries(coston2)) {
  if (!Array.isArray(abi)) continue;
  
  const errors = abi.filter(item => item.type === 'error');
  for (const err of errors) {
    const params = (err.inputs || []).map(input => input.type).join(',');
    const signature = `${err.name}(${params})`;
    const hash = keccak256(stringToBytes(signature));
    const selector = hash.substring(0, 10);
    
    if (selector === targetSelector) {
      console.log(`\nMATCH FOUND in ABI: ${abiName}`);
      console.log(`Error Name: ${err.name}`);
      console.log(`Signature: ${signature}`);
      console.log(`Selector: ${selector}`);
      console.log('Inputs:', JSON.stringify(err.inputs, null, 2));
    }
  }
}
