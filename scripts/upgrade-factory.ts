import { ethers, upgrades } from "hardhat";
import { ADDRESS_LENGTH, ImplementationKind } from "./helper";

enum Action {
  SET_ADDONS_MANAGER,
  UPDATE_IMPLEMENTATION,
  SET_FEE_MANAGER,
}

async function setAddOnsManager(addOnsManager: string) {
  const factory = await ethers.getContractAt("Factory", process.env.FACTORY!);
  await factory.setAddonsManager(addOnsManager);
  console.log(`AddonsManager ${process.env.ADDONS_MANAGER} is set to factory ${process.env.FACTORY}`);
}

async function setFeeManager(feeManager: string) {
  const factory = await ethers.getContractAt("Factory", process.env.FACTORY!);
  await factory.setFeeManager(feeManager);
  console.log(`FeeManager ${process.env.FEE_MANAGER} is set to factory ${process.env.FACTORY}`);
}

async function updateImplementation(kind: number, implementation: string) {
  let name = "";
  switch (kind) {
    case ImplementationKind.DATA_REGISTRY: {
      name = "Data-Registry";
      break;
    }
    case ImplementationKind.COLLECTION: {
      name = "Collection";
      break;
    }
    case ImplementationKind.DERIVED_ACCOUNT: {
      name = "Derived-Account";
      break;
    }
    case ImplementationKind.ERC712A_COLLECTION: {
      name = "Collection-721A";
      break;
    }
    case ImplementationKind.DATA_REGISTRY_V2: {
      name = "Data-Registry-V2";
      break;
    }
    default: {
      throw new Error(`Upsupported kind ${kind}`);
      break;
    }
  }

  const factory = await ethers.getContractAt("Factory", process.env.FACTORY!);
  await factory.updateImplementation(kind, implementation);
  console.log(`${name} new implementation ${implementation} has been updated to factory ${process.env.FACTORY}`);
}

async function upgradeContract(factoryAddress: string) {
  const Factory = await ethers.getContractFactory("Factory");
  
  const factory = await upgrades.upgradeProxy(factoryAddress, Factory);
  
  console.log("Factory is upgraded in address:", await factory.getAddress());
}

async function main() {
  // get factory address from env var
  if (process.env.FACTORY == undefined || process.env.FACTORY.length != ADDRESS_LENGTH) {
    throw new Error("Missing argument: FACTORY");
  }

  switch (Number(process.env.ACTION)) {
    case Action.SET_ADDONS_MANAGER: {
      if (process.env.ADDONS_MANAGER == undefined || process.env.ADDONS_MANAGER.length != ADDRESS_LENGTH) {
        throw new Error("Missing argument: ADDONS_MANAGER...");
      }
      await setAddOnsManager(process.env.ADDONS_MANAGER);
      break;
    }
    case Action.UPDATE_IMPLEMENTATION: {
      if (process.env.KIND == undefined) {
        throw new Error("Missing argument: KIND...");
      }
      if (process.env.IMPLEMENTATION == undefined || process.env.IMPLEMENTATION.length != ADDRESS_LENGTH) {
        throw new Error("Missing argument: IMPLEMENTATION...");
      }
      await updateImplementation(Number(process.env.KIND), process.env.IMPLEMENTATION);
      break;
    }
    case Action.SET_FEE_MANAGER: {
      if (process.env.FEE_MANAGER == undefined || process.env.FEE_MANAGER.length != ADDRESS_LENGTH) {
        throw new Error("Missing argument: FEE_MANAGER...");
      }
      await setFeeManager(process.env.FEE_MANAGER);
      break;
    }
    default: {
      await upgradeContract(process.env.FACTORY);
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