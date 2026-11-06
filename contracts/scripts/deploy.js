// Usage: npx hardhat run scripts/deploy.js --network whitechain
// Env: PROVIDER_ADDRESS (payee), ORACLE_SIGNER_ADDRESS (backend signer),
//      optional USDT_ADDRESS (deploys MockUSDT when unset), QUERY_PRICE (default 500000), JOB_TIMEOUT_SECONDS (default 3600)
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = process.env.PROVIDER_ADDRESS;
  const oracle = process.env.ORACLE_SIGNER_ADDRESS;
  if (!ethers.isAddress(provider)) throw new Error("PROVIDER_ADDRESS is missing or invalid");
  if (!ethers.isAddress(oracle)) throw new Error("ORACLE_SIGNER_ADDRESS is missing or invalid");

  let usdtAddress = process.env.USDT_ADDRESS;
  if (!usdtAddress) {
    const usdt = await (await ethers.getContractFactory("MockUSDT")).deploy();
    await usdt.waitForDeployment();
    usdtAddress = await usdt.getAddress();
    console.log("MockUSDT deployed:", usdtAddress);
  }

  const price = BigInt(process.env.QUERY_PRICE || "500000");
  const timeout = BigInt(process.env.JOB_TIMEOUT_SECONDS || "3600");
  const enigma = await (await ethers.getContractFactory("EnigmaAI")).deploy(
    usdtAddress,
    provider,
    price,
    timeout,
    deployer.address
  );
  await enigma.waitForDeployment();
  const enigmaAddress = await enigma.getAddress();
  await (await enigma.addSigner(oracle)).wait();
  console.log("EnigmaAI deployed:", enigmaAddress, "signer registered:", oracle);
  // The backend submits createJobFor/startProcessing/failJob/markKeyDestroyed from the deployer wallet,
  // and those are signer-only, so the deployer has to be a registered signer as well.
  if (deployer.address.toLowerCase() !== oracle.toLowerCase()) {
    await (await enigma.addSigner(deployer.address)).wait();
    console.log("signer registered:", deployer.address);
  }

  const { chainId } = await ethers.provider.getNetwork();
  const out = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `${network.name}.json`),
    JSON.stringify({ chainId: Number(chainId), enigmaAI: enigmaAddress, usdt: usdtAddress, provider, oracle, price: price.toString(), timeout: timeout.toString() }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
