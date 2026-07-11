const esbuild = require('esbuild');
const path = require('path');

console.log('Bundling widget.ts for browser deployment (Production Safe)...');

// No environment secrets are read or inlined here.
// Dev/Simulation mode retrieves test credentials strictly from local storage or UI inputs at runtime.
esbuild.build({
  entryPoints: [path.join(__dirname, '../src/widget.ts')],
  bundle: true,
  outfile: path.join(__dirname, '../dist/widget.js'),
  minify: true,
  platform: 'browser',
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).then(() => {
  console.log('Widget bundle built successfully in dist/widget.js!');
}).catch((err) => {
  console.error('Widget bundle build failed:', err);
  process.exit(1);
});
