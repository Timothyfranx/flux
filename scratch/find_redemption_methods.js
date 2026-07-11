const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

console.log('--- iAssetManagerAbi Functions ---');
const methods = coston2.iAssetManagerAbi.filter(x => x.type === 'function');
for (const m of methods) {
  if (m.name.toLowerCase().includes('confirm') || m.name.toLowerCase().includes('default') || m.name.toLowerCase().includes('redeem') || m.name.toLowerCase().includes('payout')) {
    console.log(`${m.name}(${m.inputs.map(i => `${i.type} ${i.name}`).join(', ')})`);
  }
}
