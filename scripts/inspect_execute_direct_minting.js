const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const func = coston2.iAssetManagerAbi.find(item => item.name === 'executeDirectMinting');

console.log('executeDirectMinting Inputs:');
console.log(JSON.stringify(func.inputs, null, 2));
