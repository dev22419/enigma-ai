// Usage: npx hardhat compile && node scripts/export-abi.js  ->  abi/EnigmaAI.json, abi/MockUSDT.json
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "..", "abi");
fs.mkdirSync(out, { recursive: true });
for (const name of ["EnigmaAI", "MockUSDT"]) {
  const artifact = require(`../artifacts/contracts/${name}.sol/${name}.json`);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`wrote abi/${name}.json (${artifact.abi.length} entries)`);
}
