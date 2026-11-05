const hre = require("hardhat");

async function main() {
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();

  const address = await usdt.getAddress();
  console.log("MockUSDT deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
