const artifacts = require('@flarenetwork/flare-periphery-contract-artifacts');

console.log('Available keys in contract artifacts package:');
console.log(Object.keys(artifacts).filter(k => k.toLowerCase().includes('asset') || k.toLowerCase().includes('manager') || k.toLowerCase().includes('registry')));
