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

describe("DataRegistryV2-Dynamic", function(){
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

  // fixture for mocking data written to registry
  async function mockData() {
    const [owner, other] = await ethers.getSigners();

    const key = ethers.id(KEY1);
    const abiCoder = new ethers.AbiCoder();      
    const value = abiCoder.encode(["address","uint256"], [other.address, 12345]);

    return {key, value};
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

  describe("Dynamic", function(){
    describe("Write", function() {
      it("Should write data failed due to unauthorized access", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(dataRegistry.connect(otherAccount).write(nftCollection.target, OTHER_TOKEN_ID, key, value))
               .to.be.reverted;
      });

      it("Should write data failed due to invalid collection", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(dataRegistry.write(ethers.ZeroAddress, OTHER_TOKEN_ID, key, value))
               .to.be.revertedWith("Collection MUST be valid");
      });
  
      it("Should write data successfully", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        expect(await dataRegistry.write(nftCollection.target, OTHER_TOKEN_ID, key, value)).to.not.be.reverted;
        expect(await dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID, key)).to.equal(value);      
      });

      it("Should emit WriteBatch event upon success", async function(){
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

      it("Should reverted due to invalid collection", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount } = await loadFixture(deployDataRegistryFixture);
        const { key, value } = await loadFixture(mockData);

        await expect(dataRegistry.writeBatch(ethers.ZeroAddress, OWNER_TOKEN_ID, OTHER_TOKEN_ID, key, value))
                .to.be.revertedWith("Collection MUST be valid");
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

        expect(await dataRegistry.tipOfKeyOnCollection(key, nftCollection.target)).to.equal(OTHER_TOKEN_ID+RANGE_SIZE_BIG);
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

      it("Should overwrite-batch successfully", async function () {
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

        expect(await dataRegistry.read(nftCollection.target, START_ID, keys[0])).to.be.equal(values[0]);

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            START_ID,
            START_ID + RANGE_SIZE_BIG,
            keys[0],
            values[1]
          )
        ).to.not.be.reverted;

        expect(await dataRegistry.read(nftCollection.target, START_ID, keys[0])).to.be.equal(values[1]);
      });
    });

    describe("WriteBatchForSingleNFT", function () {
      it("Should write batch by requester reverted due to invalid collection", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount } =
          await loadFixture(deployDataRegistryFixture);
        const { keys, values } = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(
          dataRegistry            
            .writeBatchForSingleNFT(
              ethers.ZeroAddress,
              tokenId,
              keys,
              [values[0], values[1]]
            )
        ).to.be.revertedWith("Collection MUST be valid");
      });

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
        const startTimeT = (await time.latest()) + 24 * 3600; // start time is 1 day later than current block timestamp

        expect(await dataRegistry.derive(
          nftCollection.target,
          uTokenId,
          startTimeT,
          startTimeT + 7 * 24 * 3600,
          DERIVED_ROYALTY_RATE
        )).to.not.be.reverted;

        const { collection, tokenId, startTime, endTime } =
          await dataRegistry.derivedOf(nftCollection.target, uTokenId);

        expect(collection).to.equal(dataRegistry.target);
        expect(tokenId).to.equal(1);
        expect(startTime).to.equal(startTimeT);
        expect(endTime).to.equal(startTimeT + 7 * 24 * 3600);

        await time.increase(3 * 24 * 3600); // shift 3 days next

        await expect(
          dataRegistry.writeBatchForSingleNFT(
            dataRegistry.target,
            tokenId,
            keys,
            values
          )
        ).to.not.be.reverted;

        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[0])
        ).to.equal(values[0]);
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[1])
        ).to.equal(values[1]);
        expect(
          await dataRegistry.read(dataRegistry.target, tokenId, keys[2])
        ).to.equal(values[2]);
      });
    });
  });

  describe.skip("Protocol fee", function(){
    describe("WriteBatch", function(){
      it("Should revert if not pay sufficiently", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
        const { key, value } = await loadFixture(mockData);

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            OTHER_TOKEN_ID,
            OTHER_TOKEN_ID + RANGE_SIZE_BIG,
            key,
            value
          )
        ).to.be.revertedWith("Message value MUST sufficient");
      });

      it("Should success if pay sufficiently", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
        const { key, value } = await loadFixture(mockData);

        const PAID_AMOUNT = "11";

        // before
        const balanceBefore = await ethers.provider.getBalance(otherAccount);

        await expect(
          dataRegistry.writeBatch(
            nftCollection.target,
            OTHER_TOKEN_ID,
            OTHER_TOKEN_ID + RANGE_SIZE_BIG,
            key,
            value,
            {value: ethers.parseEther(PAID_AMOUNT)}
          )
        ).to.not.be.reverted;

        // after
        const balanceAfter = await ethers.provider.getBalance(otherAccount);

        expect(balanceAfter-balanceBefore).to.equal(ethers.parseEther(PAID_AMOUNT));
      });

      it("Should write-batch success if fee is not configured", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
        const { feeManager } = await loadFixture(deployFeeManager);
        await factory.setFeeManager(feeManager.target);

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
      });
    });

    describe("Write", function(){
      it("Should revert if not pay sufficiently", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
        const { key, value } = await loadFixture(mockData);

        await expect(
          dataRegistry.write(
            nftCollection.target,
            OTHER_TOKEN_ID,
            key,
            value
          )
        ).to.be.revertedWith("Message value MUST sufficient");
      });

      it("Should success if pay sufficiently", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
        const { key, value } = await loadFixture(mockData);

        const PAID_AMOUNT = "0.01";

        // before
        const balanceBefore = await ethers.provider.getBalance(otherAccount);

        await expect(
          dataRegistry.write(
            nftCollection.target,
            OTHER_TOKEN_ID,
            key,
            value,
            {value: ethers.parseEther(PAID_AMOUNT)}
          )
        ).to.not.be.reverted;

        // after
        const balanceAfter = await ethers.provider.getBalance(otherAccount);

        expect(balanceAfter-balanceBefore).to.equal(ethers.parseEther(PAID_AMOUNT));
      });

      it("Should write success if fee is not configured", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
        const { feeManager } = await loadFixture(deployFeeManager);
        await factory.setFeeManager(feeManager.target);

        const { key, value } = await loadFixture(mockData);
        
        await expect(
          dataRegistry.write(
            nftCollection.target,
            OTHER_TOKEN_ID,
            key,
            value
          )
        ).to.not.be.reverted;
      });
    });

    describe("WriteBatchForSingleNFT", function(){
      it("Should revert if not pay sufficiently", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
        const { keys, values } = await loadFixture(mockComposedData);

        await expect(
          dataRegistry.writeBatchForSingleNFT(
            nftCollection.target,
            OTHER_TOKEN_ID,
            keys,
            values
          )
        ).to.be.revertedWith("Message value MUST sufficient");
      });

      it("Should success if pay sufficiently", async function(){
        const { dataRegistry, nftCollection, owner, otherAccount, factory, feeManager } = await loadFixture(setFeeManager);
        const { keys, values } = await loadFixture(mockComposedData);

        const PAID_AMOUNT = "0.01";

        // before
        const balanceBefore = await ethers.provider.getBalance(otherAccount);

        await expect(
          dataRegistry.writeBatchForSingleNFT(
            nftCollection.target,
            OTHER_TOKEN_ID,
            keys,
            values,
            {value: ethers.parseEther(PAID_AMOUNT)}
          )
        ).to.not.be.reverted;

        // after
        const balanceAfter = await ethers.provider.getBalance(otherAccount);

        expect(balanceAfter-balanceBefore).to.equal(ethers.parseEther(PAID_AMOUNT));
      });

      it("Should success if fee is not configured", async function () {
        const { dataRegistry, nftCollection, owner, otherAccount, factory } = await loadFixture(deployDataRegistryFixture);
        const { feeManager } = await loadFixture(deployFeeManager);
        await factory.setFeeManager(feeManager.target);

        const { keys, values } = await loadFixture(mockComposedData);
        
        await expect(
          dataRegistry.writeBatchForSingleNFT(
            nftCollection.target,
            OTHER_TOKEN_ID,
            keys,
            values
          )
        ).to.not.be.reverted;
      });
    });
  });

  describe("ERC165", function () {
    it("Should determine ERC165 interfaceId properly", async function () {
      const { dataRegistry, nftCollection, owner, otherAccount } =
        await loadFixture(deployDataRegistryFixture);

      // nft2.0
      expect(await dataRegistry.supportsInterface(IDynamicV2InterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IDerivableV2InterfaceId())).to.equal(true);

      // based
      expect(await dataRegistry.supportsInterface(IERC165InterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC721InterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC721MetadataInterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC2981InterfaceId())).to.equal(true);
    });
  });
});