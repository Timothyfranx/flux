const esbuild = require('esbuild');
const path = require('path');
require('dotenv').config();

const xrplSeed = process.env.XRPL_SEED || '';
const coston2PrivateKey = process.env.COSTON2_PRIVATE_KEY || '';

console.log('Bundling widget.ts for browser deployment...');

esbuild.build({
  entryPoints: [path.join(__dirname, '../src/widget.ts')],
  bundle: true,
  outfile: path.join(__dirname, '../dist/widget.js'),
  minify: true,
  platform: 'browser',
  sourcemap: true,
  define: {
    'PROCESS_ENV': JSON.stringify({
      XRPL_SEED: xrplSeed,
      COSTON2_PRIVATE_KEY: coston2PrivateKey
    }),
    'process.env.NODE_ENV': '"production"'
  }
}).then(() => {
  console.log('Widget bundle built successfully in dist/widget.js!');
}).catch((err) => {
  console.error('Widget bundle build failed:', err);
  process.exit(1);
});
