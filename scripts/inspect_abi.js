const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const functions = coston2.iAssetManagerAbi
  .filter(item => item.type === 'function')
  .map(item => item.name)
  .sort();

console.log('Functions in iAssetManagerAbi:');
console.log(functions);
