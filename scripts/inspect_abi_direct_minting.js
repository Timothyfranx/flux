const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const fExecute = coston2.iAssetManagerAbi.find(item => item.name === 'executeDirectMinting');
console.log('executeDirectMinting Inputs:', JSON.stringify(fExecute.inputs, null, 2));
