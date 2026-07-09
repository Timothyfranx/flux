const fs = require('fs');
const path = require('path');
const { keccak256, toHex, stringToBytes } = require('viem');

const TARGET_SELECTOR = '0x40d8d67b';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

function computeSelector(signature) {
  // Normalize signature: remove spaces inside parameters
  const normalized = signature.replace(/\s+/g, '');
  const hash = keccak256(stringToBytes(normalized));
  return hash.substring(0, 10); // '0x' + 8 hex chars
}

async function main() {
  const rootDir = path.join(__dirname, '../node_modules');
  
  if (!fs.existsSync(rootDir)) {
    console.error('node_modules/@flarenetwork does not exist.');
    return;
  }

  console.log('Searching for error selector matching:', TARGET_SELECTOR);

  walkDir(rootDir, filePath => {
    if (path.extname(filePath) !== '.sol') return;

    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find all "error Name(...)"
    const matches = content.matchAll(/error\s+(\w+)\s*\(([^)]*)\)/g);
    for (const match of matches) {
      const errorName = match[1];
      const paramsStr = match[2];
      
      // Parse parameters to types only
      const params = paramsStr.split(',').map(p => {
        const parts = p.trim().split(/\s+/);
        // The type is the first word (e.g. "uint256", "address")
        return parts[0];
      }).filter(p => p !== '');

      const signature = `${errorName}(${params.join(',')})`;
      const selector = computeSelector(signature);

      if (selector === TARGET_SELECTOR) {
        console.log(`\nMATCH FOUND!`);
        console.log(`File: ${filePath}`);
        console.log(`Signature: ${signature}`);
        console.log(`Selector: ${selector}`);
      }
    }
  });
}

main();
