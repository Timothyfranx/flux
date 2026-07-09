const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const errors = coston2.iAssetManagerAbi.filter(item => item.type === 'error');
console.log('Number of errors in iAssetManagerAbi:', errors.length);
if (errors.length > 0) {
  console.log('Errors:', errors.map(e => e.name));
}
