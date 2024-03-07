import { ethers, upgrades } from "hardhat";

async function main() {
  if (process.env.DATA_REGISTRY == undefined || process.env.DATA_REGISTRY.length != 42) {
    throw new Error("Missing argument: DATA_REGISTRY...");
  }

  if (process.env.COLLECTION == undefined || process.env.COLLECTION.length != 42) {
    throw new Error("Missing argument: COLLECTION...");
  }

  if (process.env.DERIVED_ACCOUNT == undefined || process.env.DERIVED_ACCOUNT.length != 42) {
    throw new Error("Missing argument: DERIVED_ACCOUNT...");
  }

  if (process.env.COLLECTION_721A == undefined || process.env.COLLECTION_721A.length != 42) {
    throw new Error("Missing argument: COLLECTION_721A...");
  }

  if (process.env.DATA_REGISTRY_V2 == undefined || process.env.DATA_REGISTRY_V2.length != 42) {
    throw new Error("Missing argument: DATA_REGISTRY_V2...");
  }

  const [owner] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("Factory");
  const factory = await upgrades.deployProxy(Factory, [
                                  process.env.DATA_REGISTRY, 
                                  process.env.COLLECTION, 
                                  process.env.DERIVED_ACCOUNT, 
                                  process.env.COLLECTION_721A,
                                  process.env.DATA_REGISTRY_V2,
                                ]);

  await factory.waitForDeployment();

  console.log("Factory is deployed to: ", await factory.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});