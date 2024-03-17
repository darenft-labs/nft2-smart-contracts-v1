import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { accessControlErrorRegex, getRandomInt, getRandomIntInclusive, 
          mockVestingSchedules, convertPercentageToBasisPoint, CollectionSettings, encodeCollectionSettings, FreeMintKind } from "../helpers/utils";

const LINEAR_VESTING_TYPE = 1;
const STAGED_VESTING_TYPE = 2;

const DAILY_LINEAR_TYPE = 1;
const WEEKLY_LINEAR_TYPE = 2;
const MONTHLY_LINEAR_TYPE = 3;
const QUARTERLY_LINEAR_TYPE = 4;

const UNVESTED_STATUS = 0;
const VESTED_STATUS = 1;
const VESTING_STATUS = 2;

const AFFORDABLE_CREATE_GAS_LIMIT = 2000000;
const AFFORDABLE_REDEEM_GAS_LIMIT = 1000000;
const MAX_NUMBER_SCHEDULES = 10;

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages
const DAPP_URI = "ipfs://dapp-uri";

const COLLECTION_SETTINGS : CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),  
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

describe("Benchmark", function(){
  // fixtures
  async function deployVoucherFixture(){
    const [owner, account1, account2] = await ethers.getSigners();

    // deploy supplementary contracts
    const { dataRegistry, nftCollection } = await loadFixture(
      deployDataRegistryAndCollectionFromFactory
    );
    const erc20Token = await ethers.deployContract("USDT", [owner.address]);

    // deploy voucher contract
    const voucher = await ethers.deployContract("Voucher", [erc20Token.target, nftCollection.target, dataRegistry.target]);

    // grant roles
    await nftCollection.grantRole(
      await nftCollection.MINTER_ROLE(),
      voucher.target
    );
    await dataRegistry.grantRole(
      await dataRegistry.WRITER_ROLE(),
      voucher.target
    );

    return {voucher, erc20Token, nftCollection, dataRegistry, owner, account1, account2};
  };

  async function deployDataRegistryAndCollectionFromFactory() {
    const [owner, otherAccount] = await ethers.getSigners();

    const erc721Impl = await ethers.deployContract("Collection");
    const dataRegistryImpl = await ethers.deployContract("DataRegistryV2");
    const derivedAccountImpl = await ethers.deployContract("DerivedAccount");
    const erc721AImpl = await ethers.deployContract("Collection721A");

    const Factory = await ethers.getContractFactory("Factory");
    const factory = await upgrades.deployProxy(Factory, [
      dataRegistryImpl.target,
      erc721Impl.target,
      derivedAccountImpl.target,
      erc721AImpl.target,
      dataRegistryImpl.target,
    ]);

    // initialization
    const tx = await factory.createCollection(
      COLLECTION_NAME,
      COLLECTION_SYMBOL,
      COLLECTION_SETTINGS,
      0
    );
    await tx.wait();

    const nftCollection = await ethers.getContractAt(
      "Collection",
      await factory.collectionOf(
        owner.address,
        COLLECTION_NAME,
        COLLECTION_SYMBOL
      )
    );

    const settings = {
      disableComposable: false,
      disableDerivable: false,
    };
    const tx2 = await factory.createDataRegistryV2(DAPP_URI, settings);
    const receipt = await tx2.wait();

    const registryAddress = await factory.dataRegistryOf(owner.address);
    const dataRegistry = await ethers.getContractAt(
      "DataRegistryV2",
      registryAddress
    );

    return { dataRegistry, nftCollection };
  }

  it("Should CREATE voucher with many schedules successfully", async function(){
    const {
      voucher,
      erc20Token,
      nftCollection,
      dataRegistry,
      owner,
      account1,
      account2,
    } = await loadFixture(deployVoucherFixture);

    // mint erc20 token and approve for voucher contract
    const totalAmount = "1000000";
    await erc20Token.mint(account1.address, ethers.parseEther(totalAmount));
    await erc20Token
      .connect(account1)
      .approve(voucher.target, ethers.parseEther(totalAmount));

    // mock schedules
    const schedules = await mockVestingSchedules(MAX_NUMBER_SCHEDULES);  
    let vesting = {
      balance: ethers.parseEther(totalAmount),
      schedules
    };

    //console.log(`Number of schedules ${schedules.length}`);

    // gas estimation
    const gasEstimation = await voucher.connect(account1).create.estimateGas(vesting);
    //console.log(`Gas estimation CREATE ${gasEstimation}`);

    // assertions
    await expect(voucher.connect(account1).create(vesting, {gasLimit: AFFORDABLE_CREATE_GAS_LIMIT})).to.not.be.reverted;
  });

  it("Should REDEEM voucher with many schedules successfully", async function(){
    const {
      voucher,
      erc20Token,
      nftCollection,
      dataRegistry,
      owner,
      account1,
      account2,
    } = await loadFixture(deployVoucherFixture);

    // mint erc20 token and approve for voucher contract
    const totalAmount = "1000000";
    await erc20Token.mint(account1.address, ethers.parseEther(totalAmount));
    await erc20Token
      .connect(account1)
      .approve(voucher.target, ethers.parseEther(totalAmount));

    // mock schedules
    const schedules = await mockVestingSchedules(MAX_NUMBER_SCHEDULES);
  
    let vesting = {
      balance: ethers.parseEther(totalAmount),
      schedules
    };

    //console.log(`Number of schedules ${schedules.length}`);
    await expect(voucher.connect(account1).create(vesting)).to.not.be.reverted;

    // mock block timestamp
    const startTimestamp = await time.latest();
    const endTimestamp = startTimestamp + 365 * 24 * 3600;
    const blockTimestamp = await getRandomIntInclusive(startTimestamp, endTimestamp);
    //console.log(`Start timestamp ${startTimestamp} - End timestamp ${endTimestamp} - Block timestamp ${blockTimestamp}`);

    // gas estimation
    await time.increaseTo(blockTimestamp);
    const gasEstimation = await voucher.connect(account1).redeem.estimateGas(0);
    //console.log(`Gas estimation REDEEM ${gasEstimation}`);

    // assertions
    await expect(voucher.connect(account1).redeem(0)).to.not.be.reverted;
  });

});