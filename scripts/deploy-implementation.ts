import { ethers, upgrades } from "hardhat";
import { AddonsManager, FreeMintWhitelistFCFSStrategy, FreeMintWhitelistFixedTokenStrategy } from "../typechain-types";
import { ADDRESS_LENGTH, ImplementationKind, AddonsKind } from "./helper";


async function registerStrategy(managerAddress: string) {
    const addOnsManager = await ethers.getContractAt("AddonsManager", managerAddress);

    const freeMintWhitelistFCFS = await ethers.deployContract("FreeMintWhitelistFCFSStrategy");
    console.log(`Deploy FreeMintWhitelistFCFS strategy at address ${freeMintWhitelistFCFS.target}`);

    const freeMintWhitelistFixedToken = await ethers.deployContract("FreeMintWhitelistFixedTokenStrategy");
    console.log(`Deploy FreeMintWhitelistFixedToken strategy at address ${freeMintWhitelistFixedToken.target}`);

    await addOnsManager.registerStrategy(freeMintWhitelistFCFS.target, AddonsKind.FREE_MINT_WHITELIST_FCFS);
    console.log(`Register FreeMintWhitelistFCFS strategy to manager...`);
  
    await addOnsManager.registerStrategy(freeMintWhitelistFixedToken.target, AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN);
    console.log(`Register FreeMintWhitelistFixedToken strategy to manager...`);

    console.log(`AddonsManager is fully configured at address ${managerAddress}`);
  }

async function deployAddonsManager() {
  const AddonsManager = await ethers.getContractFactory("AddonsManager");
  const deployAddonsManager = await upgrades.deployProxy(AddonsManager, []);
  await deployAddonsManager.waitForDeployment();

  const addOnsManager = await ethers.getContractAt("AddonsManager", deployAddonsManager.target);
  console.log(`Deploy AddonsManager at address ${addOnsManager.target}`);

  await registerStrategy(await addOnsManager.getAddress());
  console.log(`AddonsManager is fully configured at address ${addOnsManager.target}`);
}

async function upgradeAddonsManager(managerAddress: string) {
  const AddonsManager = await ethers.getContractFactory("AddonsManager");
  const addOnsManager = await upgrades.upgradeProxy(managerAddress, AddonsManager);
  
  console.log(`AddonsManager is upgraded at address ${managerAddress}`);
}

async function main() {

  if (process.env.IMPLEMENTATION == undefined) {
    throw new Error("Missing argument: IMPLEMENTATION");
  }
  
  switch (Number(process.env.IMPLEMENTATION)) {
    case ImplementationKind.DATA_REGISTRY: {
      const dataRegistry = await ethers.deployContract("DataRegistry");
      console.log(`Deploy Data-registry implementation at address ${dataRegistry.target}`);
      break;
    }
    case ImplementationKind.COLLECTION: {
      const collection = await ethers.deployContract("Collection");
      console.log(`Deploy Collection implementation at address ${collection.target}`);
      break;
    }
    case ImplementationKind.DERIVED_ACCOUNT: {
      const derivedAccount = await ethers.deployContract("DerivedAccount");
      console.log(`Deploy Derived-account implementation at address ${derivedAccount.target}`);
      break;
    }
    case ImplementationKind.ERC712A_COLLECTION: {
      const erc721A = await ethers.deployContract("Collection721A");
      console.log(`Deploy Collection-721A implementation at address ${erc721A.target}`);
      break;
    }
    case ImplementationKind.DATA_REGISTRY_V2: {
      const dataRegistryV2 = await ethers.deployContract("DataRegistryV2");
      console.log(`Deploy DataRegistryV2 implementation at address ${dataRegistryV2.target}`);
      break;
    }
    case ImplementationKind.ADDONS_MANAGER: {
      await deployAddonsManager();            
      break;
    }
    case ImplementationKind.UPGRADE_ADDONS_MANAGER: {
      if (process.env.ADDONS_MANAGER == undefined || process.env.ADDONS_MANAGER.length != ADDRESS_LENGTH) {
        throw new Error("Missing argument: ADDONS_MANAGER...");
      }
      await upgradeAddonsManager(process.env.ADDONS_MANAGER);
      break;
    }
    case ImplementationKind.UPDATE_ADDONS_STRATEGY: {
      if (process.env.ADDONS_MANAGER == undefined || process.env.ADDONS_MANAGER.length != ADDRESS_LENGTH) {
        throw new Error("Missing argument: ADDONS_MANAGER...");
      }      
      await registerStrategy(process.env.ADDONS_MANAGER);
      break;
    }
    default: {
      throw new Error(`Kind ${process.env.IMPLEMENTATION} is not supported`);
      break;
    }
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});