import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { CollectionSettings, 
  convertPercentageToBasisPoint, 
  encodeCollectionSettings, 
  erc165InterfaceIdCalculator,
  IDynamicV2InterfaceId,
  IDerivableV2InterfaceId,
  IERC165InterfaceId, 
  IERC721InterfaceId, 
  IERC721MetadataInterfaceId,
  IERC2981InterfaceId, 
  FreeMintKind,
  DataRegistrySettings,
  ProtocolAction,
} from "./helpers/utils";

import { WILDCARD_KEY } from "./helpers/abi-coder";

const OWNER_TOKEN_ID = 0;
const OTHER_TOKEN_ID = 1;
const RANGE_SIZE_SMALL = 500;
const RANGE_SIZE_BIG = 10000;
const START_ID = 100;

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages
const DAPP_URI = "ipfs://dapp-uri";
const DAPP_URI2 = "ipfs://dapp-uri-2";

const KEY1 = "foo";
const KEY2 = "bar";
const KEY3 = "goo";
const SCHEMA1 = "transfer(address,uint256)";
const SCHEMA2 = "write(bytes23,bytes)";
const SCHEMA3 = "derive(address,unit256,uint256,uint256)";

const MAX_SIZE_KEY_COMPOSED = 10;
const EMPTY_BYTES = "0x";

const DERIVED_ROYALTY_RATE = 5 * 100; // 5% in basis point

const WRITE_FEE = "0.001";
const DERIVE_FEE = "0.003";
const DERIVE_WILDCARD_FEE = "0.01";
const CLAIM_ROYALTY_FEE = "0.005";

const COLLECTION_SETTINGS : CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),  
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

const REGISTRY_SETTINGS : DataRegistrySettings = {
  disableComposable: false,
  disableDerivable: false
}

const IERC721_RECEIVER_SELECTOR = "0x150b7a02";

describe("DataRegistryV2-Derivable", function(){
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployDataRegistryFixture() {
    const [owner, otherAccount, account3] = await ethers.getSigners();

    const nftCollection = await ethers.deployContract("Collection");
    const dataRegistry = await ethers.deployContract("DataRegistryV2");
    const derivedAccount = await ethers.deployContract("DerivedAccount");
    const erc721A = await ethers.deployContract("Collection721A");

    const Factory = await ethers.getContractFactory("Factory");    
    const factory = await upgrades.deployProxy(Factory, [
      dataRegistry.target,
      nftCollection.target,
      derivedAccount.target,
      erc721A.target,
      dataRegistry.target
    ]);

    // initialization
    let settings : string = encodeCollectionSettings(COLLECTION_SETTINGS);
    await nftCollection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
    await dataRegistry.initialize(owner.address, factory.target, DAPP_URI, REGISTRY_SETTINGS);

    // mint an NFT on collection to be used for data writing
    await nftCollection.safeMint(owner.address);   
    await nftCollection.safeMint(otherAccount.address);
    await nftCollection.safeMint(account3.address);
    await nftCollection.safeMint(account3.address);

    return { dataRegistry, nftCollection, owner, otherAccount, factory };
  }

  async function deployDataRegistryDisableDerivable() {
    const { dataRegistry, nftCollection, owner, otherAccount, factory } =
      await loadFixture(deployDataRegistryFixture);

    const dataRegistryDisableDerivable = await ethers.deployContract(
      "DataRegistryV2"
    );
    await dataRegistryDisableDerivable.initialize(
      owner.address,
      factory.target,
      DAPP_URI,
      {
        disableComposable: false,
        disableDerivable: true,
      }
    );

    return {
      dataRegistryDisableDerivable,
      nftCollection,
      owner,
      otherAccount,
      factory,
    };
  }

  async function mockComposedData() {
    const [owner, other] = await ethers.getSigners();
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    let keys = [];
    let values = [];

    keys.push(ethers.id(KEY1));
    values.push(abiCoder.encode(["address","uint256"], [other.address, 12345]));

    keys.push(ethers.id(KEY2));
    values.push(abiCoder.encode(["address","uint256","uint256"], [other.address, 12345, 56789]));

    keys.push(ethers.id(KEY3));
    values.push(abiCoder.encode(["address","address","uint256"], [owner.address, other.address, 56789]));

    return {keys, values};
  }

  async function deployRegistryAndDeriveNFT() {
    const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
    const { keys, values } = await loadFixture(mockComposedData);

    // derive some nfts
    const startTime = await time.latest() + 24*3600; // start time is 1 day later than current block timestamp
    await dataRegistry.derive(nftCollection.target, 0, startTime, startTime + 7*24*3600, DERIVED_ROYALTY_RATE); // end time is 7 days later than start

    // write some datas
    await dataRegistry.write(nftCollection.target, 0, keys[0], values[0]);
    await dataRegistry.write(nftCollection.target, 0, keys[1], values[1]);
    await dataRegistry.write(nftCollection.target, 0, keys[2], values[2]);

    return {dataRegistry, nftCollection, owner, otherAccount, keys, values, factory, startTime};
  }

  async function deployRegistryAndDeriveByKeys() {
    const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
    const { keys, values } = await loadFixture(mockComposedData);

    // derive some nfts
    const uTokenId = 0;
    const startTime = await time.latest() + 24*3600; // start time is 1 day later than current block timestamp
    await dataRegistry.deriveByKeys(
            nftCollection.target, 
            uTokenId, 
            startTime, 
            startTime + 7*24*3600, 
            DERIVED_ROYALTY_RATE,
            keys
          );

    // write some datas
    await dataRegistry.write(nftCollection.target, uTokenId, keys[0], values[0]);
    await dataRegistry.write(nftCollection.target, uTokenId, keys[1], values[1]);
    await dataRegistry.write(nftCollection.target, uTokenId, keys[2], values[2]);

    return {dataRegistry, nftCollection, owner, otherAccount, keys, values, factory};
  }

  async function deployFeeManager() {
    const FeeManager = await ethers.getContractFactory("FeeManager");
    const deployManager = await upgrades.deployProxy(FeeManager, []);
    await deployManager.waitForDeployment();

    const feeManager = await ethers.getContractAt("FeeManager", deployManager.target);
    return { feeManager };
  }

  async function setFeeManager() {
    const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
    const { feeManager } = await loadFixture(deployFeeManager);

    await feeManager.setFee(ProtocolAction.WRITE, ethers.parseEther(WRITE_FEE));
    await feeManager.setFee(
      ProtocolAction.DERIVE,
      ethers.parseEther(DERIVE_FEE)
    );
    await feeManager.setFee(
      ProtocolAction.DERIVE_WILDCARD,
      ethers.parseEther(DERIVE_WILDCARD_FEE)
    );
    await feeManager.setFee(
      ProtocolAction.CLAIM_DERIVED_ROYALTY,
      ethers.parseEther(CLAIM_ROYALTY_FEE)
    );

    await feeManager.setReceiver(otherAccount);

    await factory.setFeeManager(feeManager.target);

    return { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager }
  }

  describe("Derivable", function () {
    describe("Derive", function () {
      it("Should revert due to invalid collection", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry
            .connect(otherAccount)
            .derive(
              ethers.ZeroAddress,
              tokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE
            )
        ).to.be.revertedWith("Collection MUST be valid");
      });

      it("Should revert due to unauthorized sender", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry
            .connect(otherAccount)
            .derive(
              nftCollection.target,
              tokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE
            )
        ).to.be.revertedWith("Sender MUST be owner of underlying token");
      });

      it("Should derive failed due to invalid time range", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.derive(
            nftCollection.target,
            0,
            START_TIME,
            START_TIME - 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        ).to.be.revertedWith("Start time MUST be before End time");
      });

      it("Should derive failed due to invalid royalty rate", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.derive(
            nftCollection.target,
            0,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE * 1000
          )
        ).to.be.revertedWith(
          "The royalty rate MUST NOT exceed limit percentage"
        );
      });

      it("Should derive successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.derive(
            nftCollection.target,
            0,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        ).to.not.be.reverted;

        const { collection, tokenId, startTime, endTime } =
          await dataRegistry.derivedOf(nftCollection.target, 0);
        expect(tokenId).to.be.greaterThan(0);
        expect(collection).to.be.equal(dataRegistry.target);
        expect(startTime).to.equal(START_TIME);
        expect(endTime).to.equal(START_TIME + 7 * 24 * 3600);

        const [underlyingCollection, underlyingTokenId] =
          await dataRegistry.underlyingOf(tokenId);
        expect(underlyingCollection).to.equal(nftCollection.target);
        expect(underlyingTokenId).to.equal(0);
      });

      it("Should emit DeriveByKeys events", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.derive(
            nftCollection.target,
            tokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        )
          .to.emit(dataRegistry, "DeriveByKeys")
          .withArgs(
            nftCollection.target,
            tokenId,
            dataRegistry.target,
            1,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            [WILDCARD_KEY],
          );
      });

      it("Should emit Derive events", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.derive(
            nftCollection.target,
            tokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        )
          .to.emit(dataRegistry, "Derive")
          .withArgs(
            nftCollection.target,
            tokenId,
            dataRegistry.target,
            1,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
          );
      });

      it("Should revert upon derive second time", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;

        await expect(
          dataRegistry.derive(
            nftCollection.target,
            tokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.derive(
            nftCollection.target,
            tokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        ).to.be.revertedWith("Token MUST be derivable with requested keys");
      });
    });

    describe("Burn", function(){
      async function deriveFixture() {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);

        const uTokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.derive(
            nftCollection.target,
            uTokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        ).to.not.be.reverted;

        return { dataRegistry };
      }

      it("Should burn failed due to unauthorized sender", async function(){
        const [ owner, account2 ] = await ethers.getSigners();
        const { dataRegistry } = await loadFixture(deriveFixture);

        const dTokenId = 1;
        await expect(dataRegistry.connect(account2).burn(dTokenId))
                .to.be.revertedWith("Sender MUST be owner of token");
      });

      it("Should burn failed due to unauthorized sender", async function(){
        const [ owner, account2 ] = await ethers.getSigners();
        const { dataRegistry } = await loadFixture(deriveFixture);

        const dTokenId = 2;
        await expect(dataRegistry.burn(dTokenId))
                .to.be.revertedWith("ERC721: invalid token ID");
      });

      it("Should burn successfully", async function(){
        const [ owner, account2 ] = await ethers.getSigners();
        const { dataRegistry } = await loadFixture(deriveFixture);

        const dTokenId = 1;
        await expect(dataRegistry.burn(dTokenId))
                .to.not.be.reverted;

        await expect(dataRegistry.ownerOf(dTokenId))
                .to.be.revertedWith("ERC721: invalid token ID");
      });

    });

    describe("Write", function () {
      it("Should write data properly for underlying", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployRegistryAndDeriveNFT);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256"],
          [666777]
        );

        const tokenId = 0;
        await expect(
          dataRegistry.write(
            nftCollection.target,
            tokenId,
            key,
            value
          )
        ).to.not.be.reverted;

        await time.increase(3 * 24 * 3600); // next 3 days
        await expect(
          dataRegistry.write(
            nftCollection.target,
            tokenId,
            key,
            value
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(30 * 24 * 3600); // next 30 days
        await expect(
          dataRegistry.write(
            nftCollection.target,
            tokenId,
            key,
            value
          )
        ).to.not.be.reverted;
      });

      it("Should write data properly for derived", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployRegistryAndDeriveNFT);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256"],
          [666777]
        );

        // before: underlying has no data
        await expect(dataRegistry.read(nftCollection.target, 0, key)).to.be.reverted;

        const tokenId = 1;
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            tokenId,
            key,
            value
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(3 * 24 * 3600); // next 3 days
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            tokenId,
            key,
            value
          )
        ).to.not.be.reverted;

        await time.increase(30 * 24 * 3600); // next 30 days
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            tokenId,
            key,
            value
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");

        // after: data is persisted in underlying token
        expect(await dataRegistry.read(nftCollection.target, 0, key)).to.equal(
          value
        );
      });

      it("Should emit proper event upon write data by derived", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployRegistryAndDeriveNFT);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256"],
          [666777]
        );

        const tokenId = 1;
        await time.increase(3 * 24 * 3600); // next 3 days
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            tokenId,
            key,
            value
          )
        )
          .to.emit(dataRegistry, "WriteBatch")
          .withArgs(
            nftCollection.target,
            0,
            0,
            key,
            value
          );
      });
    });

    describe("Read", function() {
      it("Should read data properly for underlying", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 0;
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(30 * 24 * 3600); // next 30 days
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.equal(values[1]);
      });

      it("Should read data properly for derived", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 1;
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(30 * 24 * 3600); // next 30 days
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);
      });
    });

    describe("Query", function () {
      it("Should return isDerivable properly", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        expect(
          await dataRegistry.isDerivable(nftCollection.target, 1)
        ).to.equal(true);
        expect(
          await dataRegistry.isDerivable(nftCollection.target, 0)
        ).to.equal(false);
      });

      it("Should return isUsable properly", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        expect(await dataRegistry.isUsable(nftCollection.target, 0)).to.equal(
          true
        );
        expect(await dataRegistry.isUsable(dataRegistry.target, 1)).to.equal(
          false
        );

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(await dataRegistry.isUsable(nftCollection.target, 0)).to.equal(
          false
        );
        expect(await dataRegistry.isUsable(dataRegistry.target, 1)).to.equal(
          true
        );

        await time.increase(30 * 24 * 3600); // next 30 days
        expect(await dataRegistry.isUsable(nftCollection.target, 0)).to.equal(
          true
        );
        expect(await dataRegistry.isUsable(dataRegistry.target, 1)).to.equal(
          false
        );
      });

    });

    describe("Royalty", function () {
      it("Should revert due to invalid tokenId", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 2;
        await expect(
          dataRegistry.royaltyInfo(tokenId, ethers.parseEther("1"))
        ).to.be.revertedWith("Derived token MUST be valid");
      });

      it("Should return royalty info properly", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
          factory,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 1;
        const ethAmountString = "1";
        const salePrice = ethers.parseEther(ethAmountString);

        const [receiver, royaltyAmount] = await dataRegistry.royaltyInfo(
          tokenId,
          salePrice
        );

        expect(receiver).to.be.properAddress;
        expect(receiver).to.not.equal(ethers.ZeroAddress);
        expect(receiver).to.equal(
          await factory.derivedAccountOf(nftCollection.target, 0)
        );

        const delta = Math.abs(
          (parseFloat(ethAmountString) * DERIVED_ROYALTY_RATE) / 10000 -
            parseFloat(ethers.formatEther(royaltyAmount))
        );
        expect(delta).to.lessThan(1e-5);
      });
    });

    describe("Optin", function(){
      it("Should revert upon disable derivable", async function(){
        const {
          dataRegistryDisableDerivable,
          nftCollection,
          owner,
          otherAccount,
        } = await loadFixture(deployDataRegistryDisableDerivable);

        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistryDisableDerivable.derive(
            nftCollection.target,
            0,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          )
        ).to.be.revertedWith("Derivable MUST be enable");
      });
    });
  });

  describe("DeriveByKeys" ,function(){
    describe("Derive", function() {
      it("Should derive by keys failed due to invalid collection", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry
            .connect(otherAccount)
            .deriveByKeys(
              ethers.ZeroAddress,
              tokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
              keys,
            )
        ).to.be.revertedWith("Collection MUST be valid");
      });

      it("Should derive by keys failed due to unauthorized sender", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry
            .connect(otherAccount)
            .deriveByKeys(
              nftCollection.target,
              tokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
              keys,
            )
        ).to.be.revertedWith("Sender MUST be owner of underlying token");
      });

      it("Should derive by keys failed due to invalid time range", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            tokenId,
            START_TIME,
            START_TIME - 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.be.revertedWith("Start time MUST be before End time");
      });

      it("Should derive by keys failed due to invalid royalty rate", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const tokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            tokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE * 1000,
            keys
          )
        ).to.be.revertedWith(
          "The royalty rate MUST NOT exceed limit percentage"
        );
      });

      it("Should derive by keys successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const uTokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            uTokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.not.be.reverted;

        let dTokenId = 0;
        for (let j=0; j<keys.length; j++) {
          const { collection, tokenId, startTime, endTime } =
            await dataRegistry.derivedByKeyOf(nftCollection.target, uTokenId, keys[j]);

          expect(tokenId).to.be.greaterThan(0);
          expect(collection).to.be.equal(dataRegistry.target);
          expect(startTime).to.equal(START_TIME);
          expect(endTime).to.equal(START_TIME + 7 * 24 * 3600);
          dTokenId = Number(tokenId);
        }

        const [underlyingCollection, underlyingTokenId] =
          await dataRegistry.underlyingOf(dTokenId);
        expect(underlyingCollection).to.equal(nftCollection.target);
        expect(underlyingTokenId).to.equal(uTokenId);
      });

      it("Should derive by keys emit event properly", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const uTokenId = 0;
        const dTokenId = 1;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            uTokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.emit(dataRegistry, "DeriveByKeys")
            .withArgs(
              nftCollection.target,
              uTokenId,
              dataRegistry.target,
              dTokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,              
              keys,
            );
      });

      it("Should derive by keys failed on replay", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const uTokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            uTokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            uTokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.be.reverted;
      });

      it("Should derive by keys success if range not overlapped", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { keys } = await loadFixture(mockComposedData);

        const uTokenId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            uTokenId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.not.be.reverted;

        await time.increase(15*24*3600);

        await expect(
          dataRegistry.deriveByKeys(
            nftCollection.target,
            uTokenId,
            START_TIME + 15 * 24 * 3600,
            START_TIME + 30 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.not.be.reverted;
      });
    });

    describe("Write", function () {
      it("Should write data properly for underlying", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, keys, values } =
          await loadFixture(deployRegistryAndDeriveByKeys);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256"],
          [666777]
        );

        const tokenId = 0;
        await expect(
          dataRegistry.write(
            nftCollection.target,
            tokenId,
            key,
            value
          )
        ).to.not.be.reverted;

        await time.increase(3 * 24 * 3600); // next 3 days
        await expect(
          dataRegistry.write(
            nftCollection.target,
            tokenId,
            keys[0],
            value
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");

        await expect(
          dataRegistry.write(
            nftCollection.target,
            tokenId,
            key,
            value
          )
        ).to.not.be.reverted;

        await time.increase(30 * 24 * 3600); // next 30 days
        await expect(
          dataRegistry.write(
            nftCollection.target,
            tokenId,
            keys[keys.length-1],
            value
          )
        ).to.not.be.reverted;
      });

      it("Should write data properly for derived", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, keys, values } =
          await loadFixture(deployRegistryAndDeriveByKeys);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256"],
          [666777]
        );

        // before: underlying has no data
        await expect(dataRegistry.read(nftCollection.target, 0, key)).to.be.reverted;

        const uTokendId =0;
        const dTokenId = 1;
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            dTokenId,
            keys[0],
            value
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(3 * 24 * 3600); // next 3 days
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            dTokenId,
            keys[keys.length-1],
            value
          )
        ).to.not.be.reverted;

        await time.increase(30 * 24 * 3600); // next 30 days
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            dTokenId,
            keys[1],
            value
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");

        // after: data is persisted in underlying token
        expect(await dataRegistry.read(nftCollection.target, uTokendId, keys[keys.length-1])).to.equal(value);
      });

      it("Should emit proper event upon write data by derived", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, keys, values } =
          await loadFixture(deployRegistryAndDeriveByKeys);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256"],
          [666777]
        );

        const uTokenId = 0;
        const dTokenId = 1;
        await time.increase(3 * 24 * 3600); // next 3 days
        await expect(
          dataRegistry.write(
            dataRegistry.target,
            dTokenId,
            keys[keys.length-1],
            value
          )
        ).to.emit(dataRegistry, "WriteBatch")
          .withArgs(
            nftCollection.target,
            uTokenId,
            uTokenId,
            keys[keys.length-1],
            value
          );
      });
    });

    describe("Read", function() {
      it("Should read data properly for underlying", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveByKeys);

        const tokenId = 0;
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(30 * 24 * 3600); // next 30 days
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.equal(values[1]);
      });

      it("Should read data properly for derived", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveByKeys);

        const tokenId = 1;
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(30 * 24 * 3600); // next 30 days
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);
      });
    });

    describe("isDerivable", function () {
      it("Should return isDerivable properly if wildcard derived expired", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values, factory} = await loadFixture(deployRegistryAndDeriveNFT);

        await time.increase(45*24*3600); // shift next 15 days

        const uTokenId = 0;
        expect(
          await dataRegistry.isDerivable(nftCollection.target, uTokenId)
        ).to.equal(true);

        expect(
          await dataRegistry.isDerivableByKey(nftCollection.target, uTokenId, keys[0])
        ).to.equal(true);

        expect(
          await dataRegistry.isDerivableByKey(nftCollection.target, uTokenId, keys[keys.length-1])
        ).to.equal(true);
      });

      it("Should return isDerivable properly if derived token has been burned", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveByKeys);

        await time.increase(3*24*3600); // shift next 15 days

        // before
        const uTokenId = 0;
        const dTokenId = 1;
        expect(
          await dataRegistry.isDerivableByKey(nftCollection.target, uTokenId, keys[0])
        ).to.equal(false);

        // burning
        await dataRegistry.burn(dTokenId);

        // after
        expect(
          await dataRegistry.isDerivableByKey(nftCollection.target, uTokenId, keys[0])
        ).to.equal(true);
      });

      it("Should return isDerivable properly", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveByKeys);

        expect(
          await dataRegistry.isDerivableByKey(nftCollection.target, 1, keys[0])
        ).to.equal(true);

        expect(
          await dataRegistry.isDerivableByKey(nftCollection.target, 0, keys[keys.length-1])
        ).to.equal(false);
      });
    });

    describe("isUsable", function(){
      it("Should return isUsable properly", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveByKeys);

        const uTokenId = 0;
        const dTokenId = 1;

        expect(await dataRegistry.isUsableByKey(nftCollection.target, uTokenId, keys[0]))
          .to.equal(true);

        expect(await dataRegistry.isUsableByKey(dataRegistry.target, dTokenId, keys[keys.length - 1]))
          .to.equal(false);

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(await dataRegistry.isUsableByKey(nftCollection.target, uTokenId, keys[keys.length - 1]))
          .to.equal(false);

        expect(await dataRegistry.isUsableByKey(dataRegistry.target, dTokenId, keys[0]))
          .to.equal(true);

        await time.increase(30 * 24 * 3600); // next 30 days
        expect(await dataRegistry.isUsableByKey(nftCollection.target, uTokenId, keys[1]))
          .to.equal(true);

        expect(await dataRegistry.isUsableByKey(dataRegistry.target, dTokenId, keys[1]))
          .to.equal(false);
      });
    });

    describe("derivedByKeyOf", function(){
      it("Should returns derivedByKeyOf properly if wildcard derived existed", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values, factory, startTime} = await loadFixture(deployRegistryAndDeriveNFT);

        await time.increase(3*24*3600); // shift 3 days next

        const uTokenId = 0;
        const dTokenId = 1;
        const dStartTime = startTime;
        {
          const { collection, tokenId, startTime, endTime } =
              await dataRegistry.derivedByKeyOf(nftCollection.target, uTokenId, keys[0]);

          expect(collection).to.equal(dataRegistry.target);
          expect(tokenId).to.equal(dTokenId);
          expect(startTime).to.equal(dStartTime);
          expect(endTime).to.equal(dStartTime + 7*24*3600);
        }
      });
    });

    describe("Royalty", function () {
      it("Should revert due to invalid tokenId", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveByKeys);

        const tokenId = 2;
        await expect(
          dataRegistry.royaltyInfo(tokenId, ethers.parseEther("1"))
        ).to.be.revertedWith("Derived token MUST be valid");
      });

      it("Should return royalty info properly", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
          factory,
        } = await loadFixture(deployRegistryAndDeriveByKeys);

        const tokenId = 1;
        const ethAmountString = "1";
        const salePrice = ethers.parseEther(ethAmountString);

        const [receiver, royaltyAmount] = await dataRegistry.royaltyInfo(tokenId, salePrice);

        expect(receiver).to.be.properAddress;
        expect(receiver).to.not.equal(ethers.ZeroAddress);
        expect(receiver).to.equal(
          await factory.derivedAccountOf(nftCollection.target, 0)
        );

        const delta = Math.abs(
          (parseFloat(ethAmountString) * DERIVED_ROYALTY_RATE) / 10000 -
            parseFloat(ethers.formatEther(royaltyAmount))
        );
        expect(delta).to.lessThan(1e-5);
      });
    });

    describe("Optin", function(){
      it("Should revert upon disable derivable", async function(){
        const {
          dataRegistryDisableDerivable,
          nftCollection,
          owner,
          otherAccount,          
        } = await loadFixture(deployDataRegistryDisableDerivable);
        const { keys, values } = await loadFixture(mockComposedData);
 
        const uTokeId = 0;
        const START_TIME = (await time.latest()) + 24 * 3600;
        await expect(
          dataRegistryDisableDerivable.deriveByKeys(
            nftCollection.target,
            uTokeId,
            START_TIME,
            START_TIME + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE,
            keys
          )
        ).to.be.revertedWith("Derivable MUST be enable");
      });
    });

    describe.skip("Protocol fee", function(){
      describe("DeriveByKeys", function(){
        it("Should derive revert if not pay fee sufficiently", async function () {          
          const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
          const { keys } = await loadFixture(mockComposedData);

          const uTokenId = 0;
          const START_TIME = (await time.latest()) + 24 * 3600;
          await expect(
            dataRegistry.deriveByKeys(
              nftCollection.target,
              uTokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
              keys
            )
          ).to.be.revertedWith("Message value MUST sufficient");
        });
  
        it("Should derive success if pay fee sufficiently", async function () {
          const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
          const { keys } = await loadFixture(mockComposedData);

          const PAID_AMOUNT = "0.01";
          const uTokenId = 0;
          const START_TIME = (await time.latest()) + 24 * 3600;

          const before = await ethers.provider.getBalance(otherAccount.address);

          await expect(
            dataRegistry.deriveByKeys(
              nftCollection.target,
              uTokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
              keys,
              {value: ethers.parseEther(PAID_AMOUNT)}
            )
          ).to.not.be.reverted;
  
          const after = await ethers.provider.getBalance(otherAccount.address);
  
          expect(after).to.equal(
            before + ethers.parseEther(PAID_AMOUNT)
          );
        });
  
        it("Should derive success if fee is not configured", async function () {
          const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
          const { feeManager } = await loadFixture(deployFeeManager);
          await factory.setFeeManager(feeManager.target);

          const { keys } = await loadFixture(mockComposedData);
  
          const tokenId = 0;
          await expect(
            dataRegistry.deriveByKeys(
              nftCollection.target,
              tokenId,
              (await time.latest()) + 24 * 3600,
              (await time.latest()) + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
              keys
            )
          ).to.not.be.reverted;
        });
      });

      describe("Derive", function(){
        it("Should derive revert if not pay fee sufficiently", async function () {          
          const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);

          const uTokenId = 0;
          const START_TIME = (await time.latest()) + 24 * 3600;
          await expect(
            dataRegistry.derive(
              nftCollection.target,
              uTokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
            )
          ).to.be.revertedWith("Message value MUST sufficient");
        });
  
        it("Should derive success if pay fee sufficiently", async function () {
          const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
          const { keys } = await loadFixture(mockComposedData);

          const PAID_AMOUNT = "0.01";
          const uTokenId = 0;
          const START_TIME = (await time.latest()) + 24 * 3600;

          const before = await ethers.provider.getBalance(otherAccount.address);

          await expect(
            dataRegistry.derive(
              nftCollection.target,
              uTokenId,
              START_TIME,
              START_TIME + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
              {value: ethers.parseEther(PAID_AMOUNT)}
            )
          ).to.not.be.reverted;
  
          const after = await ethers.provider.getBalance(otherAccount.address);
  
          expect(after).to.equal(
            before + ethers.parseEther(PAID_AMOUNT)
          );
        });
  
        it("Should derive success if fee is not configured", async function () {
          const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
          const { feeManager } = await loadFixture(deployFeeManager);
          await factory.setFeeManager(feeManager.target);

          const { keys } = await loadFixture(mockComposedData);
  
          const tokenId = 0;
          await expect(
            dataRegistry.derive(
              nftCollection.target,
              tokenId,
              (await time.latest()) + 24 * 3600,
              (await time.latest()) + 7 * 24 * 3600,
              DERIVED_ROYALTY_RATE,
            )
          ).to.not.be.reverted;
        });
      });
    });
  });
});