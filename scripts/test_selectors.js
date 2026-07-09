const { keccak256, stringToBytes } = require('viem');

function getSelector(sig) {
  return keccak256(stringToBytes(sig)).substring(0, 10);
}

const list = [
  'DirectMintingDelayed(bytes32,uint256,uint256)',
  'DirectMintingDelayed(bytes32,uint64,uint64)',
  'DirectMintingDelayed(bytes32,uint256)',
  'DirectMintingDelayed(bytes32,uint64)',
  'DirectMintingDelayed(uint256,uint256,uint256)',
  'LargeDirectMintingDelayed(bytes32,uint256,uint256)',
  'LargeDirectMintingDelayed(bytes32,uint64,uint64)'
];

for (const sig of list) {
  const sel = getSelector(sig);
  if (sel === '0x40d8d67b') {
    console.log(`MATCH!!! ${sig} -> ${sel}`);
  } else {
    console.log(`${sig} -> ${sel}`);
  }
}
