const wagmi = require('@flarenetwork/flare-wagmi-periphery-package');

console.log('Keys in wagmi periphery package:');
console.log(Object.keys(wagmi));

if (wagmi.coston2) {
  console.log('\nKeys in coston2:');
  console.log(Object.keys(wagmi.coston2).filter(k => k.toLowerCase().includes('asset') || k.toLowerCase().includes('registry')));
} else {
  console.log('coston2 is not defined in the package.');
}
