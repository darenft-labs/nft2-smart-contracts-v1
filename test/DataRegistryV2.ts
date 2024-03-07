import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { CollectionSettings, convertPercentageToBasisPoint, 
          encodeCollectionSettings, erc165InterfaceIdCalculator,
          IDynamicInterfaceId, IComposableInterfaceId, IDerivableInterfaceId, 
          IERC165InterfaceId, IERC721InterfaceId, IERC721MetadataInterfaceId,
          IERC2981InterfaceId, IInscriptableInterfaceId, FreeMintKind, 
          DataRegistrySettings } from "./helpers/utils";

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

describe("DataRegistryV2", function(){
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployDataRegistryFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

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

    return {dataRegistry, nftCollection, owner, otherAccount, factory};
  }

  // fixture for mocking data written to registry
  async function mockData() {
    const [owner, other] = await ethers.getSigners();

    const key = ethers.id(KEY1);
    const abiCoder = new ethers.AbiCoder();      
    const value = abiCoder.encode(["address","uint256"], [other.address, 12345]);

    return {key, value};
  }

  async function deployRegistryWithDefinedSchema() {
    const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

    // mint more nfts
    const [account1, account2, account3] = await ethers.getSigners();
    await nftCollection.safeMint(account3.address);
    await nftCollection.safeMint(account3.address);

    return {dataRegistry, nftCollection, owner, otherAccount, account3};
  }

  async function deployDataRegistryDisableComposable() {
    const { dataRegistry, nftCollection, owner, otherAccount, factory } =
      await loadFixture(deployDataRegistryFixture);

    const dataRegistryDisableComposable = await ethers.deployContract(
      "DataRegistryV2"
    );
    await dataRegistryDisableComposable.initialize(
      owner.address,
      factory.target,
      DAPP_URI,
      {
        disableComposable: true,
        disableDerivable: false,
      }
    );

    return {
      dataRegistryDisableComposable,
      nftCollection,
      owner,
      otherAccount,
      factory
    };
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
    const {dataRegistry, nftCollection, owner, otherAccount, factory} = await loadFixture(deployDataRegistryFixture);
    const { keys, values } = await loadFixture(mockComposedData);

    // derive some nfts
    const startTime = await time.latest() + 24*3600; // start time is 1 day later than current block timestamp
    await dataRegistry.derive(nftCollection.target, 0, startTime, startTime + 7*24*3600, DERIVED_ROYALTY_RATE); // end time is 7 days later than start

    // write some datas
    await dataRegistry.write(nftCollection.target, 0, keys[0], values[0]);
    await dataRegistry.write(nftCollection.target, 0, keys[1], values[1]);
    await dataRegistry.write(nftCollection.target, 0, keys[2], values[2]);

    return {dataRegistry, nftCollection, owner, otherAccount, keys, values, factory};
  }

  describe("Deployment", function(){
    it("Should deploy success", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
      
      expect(await dataRegistry.getAddress()).to.be.a.properAddress;
      expect(await nftCollection.getAddress()).to.be.a.properAddress;
      expect(await dataRegistry.uri()).to.equal(DAPP_URI);
    });

    it("Should mint NFT success", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

      expect(await nftCollection.ownerOf(OWNER_TOKEN_ID)).to.equal(owner.address);
      expect(await nftCollection.ownerOf(OTHER_TOKEN_ID)).to.equal(otherAccount.address);
    });

    it("Should grant role properly", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

      const writerRole = await dataRegistry.WRITER_ROLE();
      const minterRole = await nftCollection.MINTER_ROLE();

      expect(await dataRegistry.hasRole(writerRole, owner.address)).to.equal(true);
      expect(await nftCollection.hasRole(minterRole, owner.address)).to.equal(true);

      expect(await dataRegistry.hasRole(writerRole, otherAccount.address)).to.equal(false);
      expect(await nftCollection.hasRole(minterRole, otherAccount.address)).to.equal(false);
    });
  });

  describe("URI", function(){
    it("Should reverted due to unauthorized", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

      await expect(dataRegistry.connect(otherAccount).updateUri(DAPP_URI2)).to.be.reverted;
    });

    it("Should update successfully", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

      // before
      expect(await dataRegistry.uri()).to.equal(DAPP_URI);
      
      await expect(dataRegistry.updateUri(DAPP_URI2)).to.not.be.reverted;

      // after
      expect(await dataRegistry.uri()).to.equal(DAPP_URI2);
    });

    it("Should emit event properly", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
      await expect(dataRegistry.updateUri(DAPP_URI2))
              .to.emit(dataRegistry, "URIUpdated")
              .withArgs(DAPP_URI2);
    })
  });

  describe("Dynamic", function(){
    describe("Write", function() {
      it("Should safeWrite data failed due to unauthorized access", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(dataRegistry.connect(otherAccount).write(nftCollection.target, OTHER_TOKEN_ID, key, value))
               .to.be.reverted;
      });
  
      it("Should safeWrite data successfully", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        expect(await dataRegistry.write(nftCollection.target, OTHER_TOKEN_ID, key, value)).to.not.be.reverted;
        expect(await dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID, key)).to.equal(value);      
      });

      it("Should emit Write event upon success", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(
          dataRegistry.write(
            nftCollection.target,
            OTHER_TOKEN_ID,
            key,
            value
          )
        )
          .to.emit(dataRegistry, "WriteBatch")
          .withArgs(
            nftCollection.target,
            OTHER_TOKEN_ID,
            OTHER_TOKEN_ID, 
            key,
            value
          );
      }); 
    });

    describe("WriteBatch", function(){
      it("Should reverted due to unauthorized access", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);

        await expect(dataRegistry.connect(otherAccount).writeBatch(nftCollection.target, OWNER_TOKEN_ID, OTHER_TOKEN_ID, key, value))
                .to.be.reverted;
      });

      it("Should reverted due to invalid range", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);

        await expect(dataRegistry.writeBatch(nftCollection.target, OTHER_TOKEN_ID, OWNER_TOKEN_ID, key, value))
                .to.be.revertedWith("Start and End MUST be proper");
      });

      it("Should reverted due to range overlapped on zero start", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);

        expect(
          await dataRegistry.write(
            nftCollection.target,
            OWNER_TOKEN_ID,
            key,
            value
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            OWNER_TOKEN_ID,
            OTHER_TOKEN_ID,
            key,
            value
          )
        ).to.be.revertedWith("Range MUST not be overlapped");
      });

      it("Should reverted due to range overlapped on non-zero start", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);

        expect(
          await dataRegistry.write(
            nftCollection.target,
            OTHER_TOKEN_ID + 1,
            key,
            value
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            OTHER_TOKEN_ID,
            OTHER_TOKEN_ID+RANGE_SIZE_SMALL,
            key,
            value
          )
        ).to.be.revertedWith("Range MUST not be overlapped");

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            OTHER_TOKEN_ID + 1,
            OTHER_TOKEN_ID + RANGE_SIZE_SMALL,
            key,
            value
          )
        ).to.be.revertedWith("Range MUST not be overlapped");
      });

      it("Should write batch successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            OTHER_TOKEN_ID,
            OTHER_TOKEN_ID + RANGE_SIZE_BIG,
            key,
            value
          )
        ).to.not.be.reverted;

        expect(await dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID, key)).to.be.equal(value);
        expect(
          await dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID+RANGE_SIZE_BIG, key)
        ).to.be.equal(value);
        expect(
          await dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID+RANGE_SIZE_BIG/2, key)
        ).to.be.equal(value);

        await expect(
          dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID-1, key)
        ).to.be.reverted;

        await expect(
          dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID + RANGE_SIZE_BIG + 1, key)
        ).to.be.reverted;
      });

      it("Should write single after write batch successfully", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);
        const { keys, values } = await loadFixture(mockComposedData);

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            START_ID,
            START_ID + RANGE_SIZE_BIG,
            key,
            value
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.write(
            nftCollection.target,
            START_ID-1,
            keys[0],
            values[0]
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.write(
            nftCollection.target,
            START_ID,
            keys[1],
            values[1]
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.write(
            nftCollection.target,
            START_ID + RANGE_SIZE_BIG - 1,
            keys[2],
            values[2]
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.write(
            nftCollection.target,
            START_ID + RANGE_SIZE_BIG + 1,
            keys[1],
            values[1]
          )
        ).to.not.be.reverted;

        expect(await dataRegistry.read(nftCollection.target, START_ID + RANGE_SIZE_SMALL, key)).to.be.equal(value);
        expect(
          await dataRegistry.read(
            nftCollection.target,
            START_ID + RANGE_SIZE_BIG,
            key
          )
        ).to.be.equal(value);

        expect(
          await dataRegistry.read(
            nftCollection.target,
            START_ID-1,
            keys[0]
          )
        ).to.be.equal(values[0]);
        expect(
          await dataRegistry.read(nftCollection.target, START_ID, keys[1])
        ).to.be.equal(values[1]);
        expect(
          await dataRegistry.read(nftCollection.target, START_ID+RANGE_SIZE_BIG-1, keys[2])
        ).to.be.equal(values[2]);
        expect(
          await dataRegistry.read(
            nftCollection.target,
            START_ID + RANGE_SIZE_BIG + 1,
            keys[1]
          )
        ).to.be.equal(values[1]);

        await expect(dataRegistry.read(nftCollection.target, START_ID-2,key)).to.be.reverted;
        await expect(dataRegistry.read(nftCollection.target, START_ID+RANGE_SIZE_BIG+2, key))
          .to.be.reverted;

      });

      it("Should write batch with zero-range successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            OWNER_TOKEN_ID,
            OWNER_TOKEN_ID,
            key,
            value
          )
        ).to.not.be.reverted;

        expect(await dataRegistry.read(nftCollection.target, OWNER_TOKEN_ID, key)).to.be.equal(value);
      });

      it("Should write single in the middle after write batch successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { keys, values } = await loadFixture(mockComposedData);

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            START_ID,
            START_ID + RANGE_SIZE_BIG,
            keys[0],
            values[0]
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.write(
            nftCollection.target,
            START_ID + RANGE_SIZE_SMALL,
            keys[0],
            values[1]
          )
        ).to.not.be.reverted;

        expect(await dataRegistry.read(nftCollection.target, START_ID, keys[0])).to.be.equal(values[0]);
        expect(
          await dataRegistry.read(nftCollection.target, START_ID+RANGE_SIZE_SMALL, keys[0])
        ).to.be.equal(values[1]);
        
      });
    });

    describe("WriteBatchForSingleNFT", function () {
      it("Should write batch by requester reverted due to unauthorized access", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { keys, values } = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(
          dataRegistry
            .connect(otherAccount)
            .writeBatchForSingleNFT(
              nftCollection,
              tokenId,
              keys,
              [values[0], values[1]]
            )
        ).to.be.reverted;
      });

      it("Should write batch reverted due to different length", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { keys, values } = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(
          dataRegistry.writeBatchForSingleNFT(
            nftCollection,
            tokenId,
            keys,
            [values[0], values[1]]
          )
        ).to.be.revertedWith("Keys and values MUST be same length arrays");
      });

      it("Should write batch successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { keys, values } = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(
          dataRegistry.writeBatchForSingleNFT(
            nftCollection,
            tokenId,
            keys,
            values
          )
        ).to.not.be.reverted;

        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[0])
        ).to.equal(values[0]);
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.equal(values[1]);
        expect(
          await dataRegistry.read(nftCollection.target, tokenId, keys[2])
        ).to.equal(values[2]);
      });

      it("Should write batch for derived token reverted due to unusable", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { keys, values } = await loadFixture(mockComposedData);

        // derive some nfts
        const uTokenId = 0;
        const startTime = (await time.latest()) + 24 * 3600; // start time is 1 day later than current block timestamp
        await dataRegistry.derive(
          nftCollection.target,
          uTokenId,
          startTime,
          startTime + 7 * 24 * 3600,
          DERIVED_ROYALTY_RATE
        ); // end time is 7 days later than start

        const dTokenId = 1;
        await expect(
          dataRegistry.writeBatchForSingleNFT(
            dataRegistry.target,
            dTokenId,
            keys,
            values
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(30 * 24 * 3600); // shift 30d next, beyond the end time
        await expect(
          dataRegistry.writeBatchForSingleNFT(
            dataRegistry.target,
            dTokenId,
            keys,
            values
          )
        ).to.be.revertedWith("Token MUST be usable at the moment");
      });

      it("Should write batch for derived token succeeded", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { keys, values } = await loadFixture(mockComposedData);

        // derive some nfts
        const uTokenId = 0;
        const startTime = (await time.latest()) + 24 * 3600; // start time is 1 day later than current block timestamp
        await dataRegistry.derive(
          nftCollection.target,
          uTokenId,
          startTime,
          startTime + 7 * 24 * 3600,
          DERIVED_ROYALTY_RATE
        ); // end time is 7 days later than start

        await time.increase(3 * 24 * 3600); // shift 3 days next
        const dTokenId = 1;
        await expect(
          dataRegistry.writeBatchForSingleNFT(
            dataRegistry.target,
            dTokenId,
            keys,
            values
          )
        ).to.not.be.reverted;

        expect(
          await dataRegistry.read(dataRegistry.target, dTokenId, keys[0])
        ).to.equal(values[0]);
        expect(
          await dataRegistry.read(dataRegistry.target, dTokenId, keys[1])
        ).to.equal(values[1]);
        expect(
          await dataRegistry.read(dataRegistry.target, dTokenId, keys[2])
        ).to.equal(values[2]);
      });
    });

  });

  describe("Composable", function () {
    describe("Compose", function () {
      it("Should revert due to unauthorized access - source token", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployRegistryWithDefinedSchema);
        const [account1, account2, account3] = await ethers.getSigners();

        const srcToken = {
          collection: nftCollection.target,
          tokenId: 0,
        };

        const descToken = {
          collection: nftCollection.target,
          tokenId: 1,
        };

        const keys = [ethers.id(KEY1)];

        await expect(
          dataRegistry.connect(account3).compose(srcToken, descToken, keys)
        ).to.be.revertedWith("Sender MUST be owner of source token");
      });

      it("Should revert due to unauthorized access - dest token", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployRegistryWithDefinedSchema);
        const [account1, account2, account3] = await ethers.getSigners();

        const srcToken = {
          collection: nftCollection.target,
          tokenId: 0,
        };

        const descToken = {
          collection: nftCollection.target,
          tokenId: 1,
        };

        const keys = [ethers.id(KEY1)];

        await expect(
          dataRegistry.compose(srcToken, descToken, keys)
        ).to.be.revertedWith("Sender MUST be owner of destination token");
      });

      it("Should compose successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);
        const { keys, values } = await loadFixture(mockComposedData);

        const srcTokenId = 2;
        const descTokenId = 3;

        await expect(
          dataRegistry.write(
            nftCollection.target,
            srcTokenId,
            keys[0],
            values[0]
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistry.write(
            nftCollection.target,
            descTokenId,
            keys[1],
            values[1]
          )
        ).to.not.be.reverted;

        const srcToken = {
          collection: nftCollection.target,
          tokenId: srcTokenId,
        };

        const descToken = {
          collection: nftCollection.target,
          tokenId: descTokenId,
        };

        // before
        await expect(
          dataRegistry.read(nftCollection.target, descTokenId, keys[0])
        ).to.be.reverted;
        expect(
          await dataRegistry.read(nftCollection.target, srcTokenId, keys[0])
        ).to.be.equal(values[0]);

        // do composing
        await expect(
          dataRegistry.connect(account3).compose(srcToken, descToken, [keys[0]])
        ).to.not.be.reverted;

        // after
        expect(
          await dataRegistry.read(nftCollection.target, descTokenId, keys[0])
        ).to.be.equal(values[0]);

        await expect(
          dataRegistry.read(nftCollection.target, srcTokenId, keys[0])
        ).to.be.reverted;
      });
    });

    describe("Optin", function(){
      it("Should revert upon disable composable", async function(){
        const {
          dataRegistryDisableComposable,
          nftCollection,
          owner,
          otherAccount
        } = await loadFixture(deployDataRegistryDisableComposable);
        const { keys, values } = await loadFixture(mockComposedData);

        const [account1, account2, account3] = await ethers.getSigners();
        await nftCollection.safeMint(account3.address);
        await nftCollection.safeMint(account3.address);

        const srcTokenId = 2;
        const descTokenId = 3;

        await expect(
          dataRegistryDisableComposable.write(
            nftCollection.target,
            srcTokenId,
            keys[0],
            values[0]
          )
        ).to.not.be.reverted;

        await expect(
          dataRegistryDisableComposable.write(
            nftCollection.target,
            descTokenId,
            keys[1],
            values[1]
          )
        ).to.not.be.reverted;

        const srcToken = {
          collection: nftCollection.target,
          tokenId: srcTokenId,
        };

        const descToken = {
          collection: nftCollection.target,
          tokenId: descTokenId,
        };

        await expect(
          dataRegistryDisableComposable
            .connect(account3)
            .compose(srcToken, descToken, [keys[0]])
        ).to.be.reverted;

      });
    });
  });

  describe("Derivable", function () {
    describe("Derive", function () {
      it("Should derive failed due to invalid time range", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);

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
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);

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

      it("Should revert due to illegitimate sender", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);

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

      it("Should derive successfully", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);

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

      it("Should emit proper events", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);

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
            START_TIME + 7 * 24 * 3600
          );
      });

      it("Should revert upon derive second time", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);

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
        ).to.be.revertedWith("Underlying token SHALL NOT derivable");
      });
    });

    describe("Read-Write", function () {
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
        await expect(
          dataRegistry.read(nftCollection.target, tokenId, keys[1])
        ).to.be.revertedWith("Token MUST be usable at the moment");

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
        await expect(
          dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);

        await time.increase(30 * 24 * 3600); // next 30 days
        await expect(
          dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.be.revertedWith("Token MUST be usable at the moment");
      });
    });

    describe("Compose", function () {
      it("Should revert upon composition by derived", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, account3 } =
          await loadFixture(deployRegistryWithDefinedSchema);

        // write some data
        const srcTokenId = 2;
        const descTokenId = 3;

        const { keys, values } = await loadFixture(mockComposedData);

        await expect(
          dataRegistry.write(
            nftCollection.target,
            srcTokenId,
            keys[0],
            values[0]
          )
        ).to.not.be.reverted;
        await expect(
          dataRegistry.write(
            nftCollection.target,
            descTokenId,
            keys[1],
            values[1]
          )
        ).to.not.be.reverted;

        const srcToken = {
          collection: nftCollection.target,
          tokenId: srcTokenId,
        };

        const descToken = {
          collection: nftCollection.target,
          tokenId: descTokenId,
        };

        // derive some nfts
        const startTime = (await time.latest()) + 24 * 3600; // start time is 1 day later than current block timestamp
        await dataRegistry
          .connect(account3)
          .derive(
            nftCollection.target,
            descTokenId,
            startTime,
            startTime + 7 * 24 * 3600,
            DERIVED_ROYALTY_RATE
          ); // end time is 7 days later than start

        const derivedToken = {
          collection: dataRegistry.target,
          tokenId: 1,
        };

        await expect(
          dataRegistry
            .connect(account3)
            .compose(srcToken, derivedToken, [keys[0]])
        ).to.be.revertedWith("Derived token SHALL NOT be composable");

        await expect(
          dataRegistry
            .connect(account3)
            .compose(derivedToken, descToken, [keys[0]])
        ).to.be.revertedWith("Derived token SHALL NOT be composable");
      });
    });

    describe("Reclaim", function () {
      it("Should revert due to illegitimate time", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        // transfer derived token to another account
        await expect(
          dataRegistry.transferFrom(owner.address, otherAccount.address, 1)
        ).to.not.be.reverted;

        await time.increase(3 * 24 * 3600); // next 3 days
        await expect(
          dataRegistry.reclaim(nftCollection.target, 0)
        ).to.be.revertedWith("Token is not reclaimable");
      });

      it("Should revert due to unauthorized sender", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        await expect(
          dataRegistry.connect(otherAccount).reclaim(nftCollection.target, 0)
        ).to.be.revertedWith("Requester MUST be owner of token");
      });

      it("Should revert due to illegitimate claiming token", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        await expect(
          dataRegistry.reclaim(dataRegistry.target, 1)
        ).to.be.revertedWith("Claimed token MUST be underlying");
      });

      it("Should revert due to lack of derived token", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        await expect(
          dataRegistry.connect(otherAccount).reclaim(nftCollection.target, 1)
        ).to.be.revertedWith("Claimed token MUST has derived");
      });

      it("Should revert successfully while derived is held by another account", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        const underlyingTokenId = 0;
        const derivedTokenId = 1;

        // before
        {
          const { collection, tokenId, startTime, endTime } =
            await dataRegistry.derivedOf(
              nftCollection.target,
              underlyingTokenId
            );
          expect(collection).to.equal(dataRegistry.target);
          expect(tokenId).to.equal(derivedTokenId);
        }

        {
          const [collection, tokenId] = await dataRegistry.underlyingOf(
            derivedTokenId
          );
          expect(collection).to.equal(nftCollection.target);
          expect(tokenId).to.equal(underlyingTokenId);
        }

        // transfer derived token to another account
        await expect(
          dataRegistry.transferFrom(
            owner.address,
            otherAccount.address,
            derivedTokenId
          )
        ).to.not.be.reverted;

        await time.increase(30 * 24 * 3600); // next 30 days
        await expect(
          dataRegistry.reclaim(nftCollection.target, underlyingTokenId)
        ).to.not.be.reverted;

        // after
        {
          const { collection, tokenId, startTime, endTime } =
            await dataRegistry.derivedOf(
              nftCollection.target,
              underlyingTokenId
            );
          expect(collection).to.equal(ethers.ZeroAddress);
          expect(tokenId).to.equal(0);
        }

        {
          const [collection, tokenId] = await dataRegistry.underlyingOf(
            derivedTokenId
          );
          expect(collection).to.equal(ethers.ZeroAddress);
        }

        await expect(dataRegistry.ownerOf(derivedTokenId)).to.be.reverted;
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

      it("Should return isReclaimable properly", async function () {
        const {
          dataRegistry,
          nftCollection,
          owner,
          otherAccount,
          keys,
          values,
        } = await loadFixture(deployRegistryAndDeriveNFT);

        const underlyingTokenId = 0;
        const derivedTokenId = 1;

        await expect(
          dataRegistry.isReclaimable(
            otherAccount,
            nftCollection,
            underlyingTokenId
          )
        ).to.be.revertedWith("Requester MUST be owner of token");

        await expect(
          dataRegistry.isReclaimable(owner, dataRegistry, derivedTokenId)
        ).to.be.revertedWith("Claimed token MUST be underlying");

        await expect(
          dataRegistry.isReclaimable(otherAccount, nftCollection, 1)
        ).to.be.revertedWith("Claimed token MUST has derived");

        expect(
          await dataRegistry.isReclaimable(
            owner,
            nftCollection,
            underlyingTokenId
          )
        ).to.equal(true);

        // transfer derived token to another account
        await expect(
          dataRegistry.transferFrom(
            owner.address,
            otherAccount.address,
            derivedTokenId
          )
        ).to.not.be.reverted;

        expect(
          await dataRegistry.isReclaimable(
            owner,
            nftCollection,
            underlyingTokenId
          )
        ).to.equal(false);

        await time.increase(3 * 24 * 3600); // next 3 days
        expect(
          await dataRegistry.isReclaimable(
            owner,
            nftCollection,
            underlyingTokenId
          )
        ).to.equal(false);

        await time.increase(30 * 24 * 3600); // next 30 days, beyond derived time
        expect(
          await dataRegistry.isReclaimable(
            owner,
            nftCollection,
            underlyingTokenId
          )
        ).to.equal(true);
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
        ).to.be.reverted;
      });
    });
  });

  describe("ERC721", function () {
    it("Should compatible with IERC721Receiver", async function () {
      const { dataRegistry, nftCollection, owner, otherAccount } =
        await loadFixture(deployDataRegistryFixture);

      const tokenId = 0;
      expect(
        await dataRegistry.onERC721Received(
          owner.address,
          otherAccount.address,
          tokenId,
          "0x"
        )
      ).to.equal(IERC721_RECEIVER_SELECTOR);
    });
  });

  describe("ERC165", function () {
    it("Should determine ERC165 interfaceId properly", async function () {
      const { dataRegistry, nftCollection, owner, otherAccount } =
        await loadFixture(deployDataRegistryFixture);

      //console.log(`IDynamic `, IDynamicInterfaceId());

      // nft2.0
      expect(
        await dataRegistry.supportsInterface(IDynamicInterfaceId())
      ).to.equal(true);
      expect(
        await dataRegistry.supportsInterface(IComposableInterfaceId())
      ).to.equal(true);
      expect(
        await dataRegistry.supportsInterface(IDerivableInterfaceId())
      ).to.equal(true);

      // based
      expect(await dataRegistry.supportsInterface(IERC165InterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC721InterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC721MetadataInterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC2981InterfaceId())).to.equal(true);
    });
  });
});