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
          IERC2981InterfaceId, IInscriptableInterfaceId, FreeMintKind } from "./helpers/utils";

const OWNER_TOKEN_ID = 0;
const OTHER_TOKEN_ID = 1;
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

const IERC721_RECEIVER_SELECTOR = "0x150b7a02";

describe("DataRegistry", function(){
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployDataRegistryFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

    const nftCollection = await ethers.deployContract("Collection");
    const dataRegistry = await ethers.deployContract("DataRegistry");
    const derivedAccount = await ethers.deployContract("DerivedAccount");
    const erc721A = await ethers.deployContract("Collection721A");

    const Factory = await ethers.getContractFactory("Factory");    
    const factory = await upgrades.deployProxy(Factory, [dataRegistry.target, nftCollection.target, derivedAccount.target, erc721A.target, dataRegistry.target]);

    // initialization
    let settings : string = encodeCollectionSettings(COLLECTION_SETTINGS);
    await nftCollection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

    await dataRegistry.initialize(owner.address, factory.target, DAPP_URI);

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

  async function mockSchemas() {
    let keys = [KEY1, KEY2, KEY3];
    keys = keys.map(ethers.id);

    const schemas = [SCHEMA1, SCHEMA2, SCHEMA3];
    return {keys, schemas};
  }  

  async function deployRegistryWithDefinedSchema() {
    const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

    // mint more nfts
    const [account1, account2, account3] = await ethers.getSigners();
    await nftCollection.safeMint(account3.address);
    await nftCollection.safeMint(account3.address);

    return {dataRegistry, nftCollection, owner, otherAccount, account3};
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
    await dataRegistry.safeWrite(owner.address, nftCollection.target, 0, keys[0], values[0]);
    await dataRegistry.safeWrite(owner.address, nftCollection.target, 0, keys[1], values[1]);
    await dataRegistry.safeWrite(owner.address, nftCollection.target, 0, keys[2], values[2]);

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
      it("Should safeWrite data reverted due to zero address requester", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(dataRegistry.safeWrite(ethers.ZeroAddress, nftCollection.target, OTHER_TOKEN_ID, key, value))
               .to.be.revertedWith("Requester MUST be true owner of NFT");
      });
  
      it("Should safeWrite data reverted due to invalid nftCollection address", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        const [signer1, signer2, signer3] = await ethers.getSigners();
        
        await expect(dataRegistry.safeWrite(otherAccount.address, signer3.address, OTHER_TOKEN_ID, key, value))
               .to.be.revertedWith("Requester MUST be true owner of NFT");
      });
  
      it("Should safeWrite data failed due to unauthorized access", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(dataRegistry.connect(otherAccount).safeWrite(otherAccount.address, nftCollection.target, OTHER_TOKEN_ID, key, value))
               .to.be.reverted;
      });
  
      it("Should safeWrite data failed due to invalid owner", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(dataRegistry.safeWrite(otherAccount.address, nftCollection.target, OWNER_TOKEN_ID, key, value))
               .to.be.revertedWith("Requester MUST be true owner of NFT");
      });
  
      it("Should safeWrite data successfully", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        expect(await dataRegistry.safeWrite(otherAccount.address, nftCollection.target, OTHER_TOKEN_ID, key, value)).to.not.be.reverted;
        expect(await dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID, key)).to.equal(value);      
      });

      it("Should write data successfully", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        expect(await dataRegistry.write(nftCollection.target, OTHER_TOKEN_ID, key, value)).to.not.be.reverted;
        expect(await dataRegistry.read(nftCollection.target, OTHER_TOKEN_ID, key)).to.equal(value);      
      });

      it("Should emit Write event upon success", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
        
        await expect(dataRegistry.safeWrite(otherAccount.address, nftCollection.target, OTHER_TOKEN_ID, key, value))
               .to.emit(dataRegistry, "Write")
               .withArgs(nftCollection.target, OTHER_TOKEN_ID, key, value);
      }); 
    });

    describe("WriteBatchForSingleNFT", function(){
      it("Should write batch reverted due to unauthorized access", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {keys, values} = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(dataRegistry.connect(otherAccount).safeWriteBatchForSingleNFT(owner.address, nftCollection, tokenId, keys, [values[0], values[1]]))
                .to.be.reverted;
      });

      it("Should write batch reverted due to illegitimate requester", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {keys, values} = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(dataRegistry.safeWriteBatchForSingleNFT(otherAccount.address, nftCollection, tokenId, keys, [values[0], values[1]]))
                .to.be.revertedWith("Requester MUST be true owner of NFT");
      });

      it("Should write batch reverted due to different length", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {keys, values} = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(dataRegistry.safeWriteBatchForSingleNFT(owner.address, nftCollection, tokenId, keys, [values[0], values[1]]))
                .to.be.revertedWith("Keys and values MUST be same length arrays");
      });

      it("Should write batch reverted due to excessive length", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);

        let keys : string[] = [];
        let values : string[] = [];
        const len = 100;
        for (let j=0; j<len; j++) {
          keys.push(key);
          values.push(value);
        }

        const tokenId = 0;
        await expect(dataRegistry.safeWriteBatchForSingleNFT(owner.address, nftCollection, tokenId, keys, values))
                .to.be.revertedWith("Array length MUST not exceed limit");
      });

      it("Should write batch successfully", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {keys, values} = await loadFixture(mockComposedData);

        const tokenId = 0;
        await expect(dataRegistry.safeWriteBatchForSingleNFT(owner.address, nftCollection, tokenId, keys, values)).to.not.be.reverted;

        expect(await dataRegistry.read(nftCollection.target, tokenId, keys[0])).to.equal(values[0]);
        expect(await dataRegistry.read(nftCollection.target, tokenId, keys[1])).to.equal(values[1]);
        expect(await dataRegistry.read(nftCollection.target, tokenId, keys[2])).to.equal(values[2]);
      });

      it("Should write batch for derived token reverted due to unusable", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {keys, values} = await loadFixture(mockComposedData);

        // derive some nfts
        const uTokenId = 0;
        const startTime = await time.latest() + 24*3600; // start time is 1 day later than current block timestamp
        await dataRegistry.derive(nftCollection.target, uTokenId, startTime, startTime + 7*24*3600, DERIVED_ROYALTY_RATE); // end time is 7 days later than start
        
        const dTokenId = 1;
        await expect(dataRegistry.safeWriteBatchForSingleNFT(owner.address, dataRegistry.target, dTokenId, keys, values))
                .to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(30*24*3600); // shift 30d next, beyond the end time
        await expect(dataRegistry.safeWriteBatchForSingleNFT(owner.address, dataRegistry.target, dTokenId, keys, values))
                .to.be.revertedWith("Token MUST be usable at the moment");
      });

      it("Should write batch for derived token succeeded", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {keys, values} = await loadFixture(mockComposedData);

        // derive some nfts
        const uTokenId = 0;
        const startTime = await time.latest() + 24*3600; // start time is 1 day later than current block timestamp
        await dataRegistry.derive(nftCollection.target, uTokenId, startTime, startTime + 7*24*3600, DERIVED_ROYALTY_RATE); // end time is 7 days later than start
        
        await time.increase(3*24*3600); // shift 3 days next
        const dTokenId = 1;
        await expect(dataRegistry.safeWriteBatchForSingleNFT(owner.address, dataRegistry.target, dTokenId, keys, values))
                .to.not.be.reverted;

        expect(await dataRegistry.read(dataRegistry.target, dTokenId, keys[0])).to.equal(values[0]);
        expect(await dataRegistry.read(dataRegistry.target, dTokenId, keys[1])).to.equal(values[1]);
        expect(await dataRegistry.read(dataRegistry.target, dTokenId, keys[2])).to.equal(values[2]);
      });
    });

    describe("WriteBatchForMultipleNFTs", function(){
      it("Should write-batch-multiple-nfts reverted due to unauthorized access", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        const tokenIds = [0,1,2];
        await expect(dataRegistry.connect(otherAccount).writeBatchForMultipleNFTs(nftCollection, tokenIds, key, value))
                .to.be.reverted;
      });
  
      it("Should write-batch-multiple-nfts reverted due to excessive input length", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        const tokenIds : number[] = [];
        for (let j=0; j<1000; j++){
          tokenIds.push(j);
        }
  
        await expect(dataRegistry.writeBatchForMultipleNFTs(nftCollection, tokenIds, key, value))
                .to.be.revertedWith("Array length MUST not exceed limit");
      });
  
      it("Should write-batch-multiple-nfts succeeded", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        const tokenIds : number[] = [];
        for (let j=0; j<10; j++){
          tokenIds.push(j);
        }
  
        await expect(dataRegistry.writeBatchForMultipleNFTs(nftCollection, tokenIds, key, value)).to.not.be.reverted;
                
        expect(await dataRegistry.read(nftCollection.target, 0, key)).to.equal(value);
        expect(await dataRegistry.read(nftCollection.target, 9, key)).to.equal(value);
        expect(await dataRegistry.read(nftCollection.target, 10, key)).to.not.equal(value);
      });
  
      it("Should write-batch-multiple-nfts for derived token reverted due to unusable", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        // mint some more underlying nfts
        await nftCollection.safeMint(owner.address);
        
        // derive nfts
        const startTime = await time.latest() + 24*3600;
        const endTime = startTime + 7*24*3600;
        const royaltyRate = 500; // in terms of basis point
  
        await dataRegistry.derive(nftCollection.target, 0, startTime, endTime, royaltyRate);
        await dataRegistry.derive(nftCollection.target, 2, startTime, endTime, royaltyRate);
        await dataRegistry.connect(otherAccount).derive(nftCollection.target, 1, startTime, endTime, royaltyRate);
  
        const tokenIds = [1,2,3];      
  
        await expect(dataRegistry.writeBatchForMultipleNFTs(dataRegistry.target, tokenIds, key, value))
                .to.be.revertedWith("Token MUST be usable at the moment");
      });
  
      it("Should write-batch-multiple-nfts for derived token succeeded", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);
        const {key, value} = await loadFixture(mockData);
  
        // mint some more underlying nfts
        await nftCollection.safeMint(owner.address);
        
        // derive nfts
        const startTime = await time.latest() + 24*3600;
        const endTime = startTime + 7*24*3600;
        const royaltyRate = 500; // in terms of basis point
  
        await dataRegistry.derive(nftCollection.target, 0, startTime, endTime, royaltyRate);
        await dataRegistry.derive(nftCollection.target, 2, startTime, endTime, royaltyRate);
        await dataRegistry.connect(otherAccount).derive(nftCollection.target, 1, startTime, endTime, royaltyRate);
  
        const tokenIds = [1,2,3]; // derived token ids
  
        await time.increase(3*24*3600);
        await expect(dataRegistry.writeBatchForMultipleNFTs(dataRegistry.target, tokenIds, key, value))
                .to.not.be.reverted;
        
        expect(await dataRegistry.read(dataRegistry.target, 1, key)).to.equal(value);
        expect(await dataRegistry.read(dataRegistry.target, 2, key)).to.equal(value);
        expect(await dataRegistry.read(dataRegistry.target, 3, key)).to.equal(value);      
  
        await time.increase(30*24*3600);
        await expect(dataRegistry.writeBatchForMultipleNFTs(dataRegistry.target, tokenIds, key, value))
                .to.be.revertedWith("Token MUST be usable at the moment");
      });
    });
  });

  describe("Derivable", function(){
    describe("Derive", function(){
      it("Should derive failed due to invalid time range", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, account3} = await loadFixture(deployRegistryWithDefinedSchema);

        const START_TIME = await time.latest() + 24*3600;
        await expect(dataRegistry.derive(nftCollection.target, 0, START_TIME, START_TIME - 7*24*3600, DERIVED_ROYALTY_RATE))
                .to.be.revertedWith("Start time MUST be before End time");
      });

      it("Should derive failed due to invalid royalty rate", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, account3} = await loadFixture(deployRegistryWithDefinedSchema);

        const START_TIME = await time.latest() + 24*3600;
        await expect(dataRegistry.derive(nftCollection.target, 0, START_TIME, START_TIME + 7*24*3600, DERIVED_ROYALTY_RATE * 1000))
                .to.be.revertedWith("The royalty rate MUST NOT exceed limit percentage");
      });

      it("Should revert due to illegitimate sender", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, account3} = await loadFixture(deployRegistryWithDefinedSchema);

        const tokenId = 0;
        const START_TIME = await time.latest() + 24*3600;
        await expect(dataRegistry.connect(otherAccount).derive(nftCollection.target, tokenId, START_TIME, START_TIME + 7*24*3600, DERIVED_ROYALTY_RATE))
                .to.be.revertedWith("Sender MUST be owner of underlying token");
      });

      it("Should derive successfully", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, account3} = await loadFixture(deployRegistryWithDefinedSchema);

        const START_TIME = await time.latest() + 24*3600;
        await expect(dataRegistry.derive(nftCollection.target, 0, START_TIME, START_TIME + 7*24*3600, DERIVED_ROYALTY_RATE)).to.not.be.reverted;

        const { collection, tokenId , startTime, endTime } = await dataRegistry.derivedOf(nftCollection.target, 0);
        expect(tokenId).to.be.greaterThan(0);
        expect(collection).to.be.equal(dataRegistry.target);
        expect(startTime).to.equal(START_TIME);
        expect(endTime).to.equal(START_TIME + 7*24*3600);

        const [ underlyingCollection, underlyingTokenId ] = await dataRegistry.underlyingOf(tokenId);
        expect(underlyingCollection).to.equal(nftCollection.target);
        expect(underlyingTokenId).to.equal(0);
      });

      it("Should emit proper events", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, account3} = await loadFixture(deployRegistryWithDefinedSchema);

        const tokenId = 0;
        const START_TIME = await time.latest() + 24*3600;
        await expect(dataRegistry.derive(nftCollection.target, tokenId, START_TIME, START_TIME + 7*24*3600, DERIVED_ROYALTY_RATE))
                .to.emit(dataRegistry, "Derive")
                .withArgs(nftCollection.target, tokenId, dataRegistry.target, 1, START_TIME, START_TIME + 7*24*3600);
      });

      it("Should revert upon derive second time", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, account3} = await loadFixture(deployRegistryWithDefinedSchema);

        const tokenId = 0;
        const START_TIME = await time.latest() + 24*3600;
        await expect(dataRegistry.derive(nftCollection.target, tokenId, START_TIME, START_TIME + 7*24*3600, DERIVED_ROYALTY_RATE)).to.not.be.reverted;

        await expect(dataRegistry.derive(nftCollection.target, tokenId, START_TIME, START_TIME + 7*24*3600, DERIVED_ROYALTY_RATE))
                .to.be.revertedWith("Underlying token SHALL NOT derivable");
      });
    });

    describe("Access", function(){
      it("Should write data properly for underlying", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployRegistryAndDeriveNFT);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"],[666777]);

        const tokenId = 0;
        await expect(dataRegistry.safeWrite(owner.address, nftCollection.target, tokenId, key, value)).to.not.be.reverted;

        await time.increase(3*24*3600); // next 3 days
        await expect(dataRegistry.safeWrite(owner.address, nftCollection.target, tokenId, key, value))
                .to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(30*24*3600); // next 30 days
        await expect(dataRegistry.safeWrite(owner.address, nftCollection.target, tokenId, key, value)).to.not.be.reverted;
      });

      it("Should write data properly for derived", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployRegistryAndDeriveNFT);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"],[666777]);

        // before: underlying has no data
        expect(await dataRegistry.read(nftCollection.target, 0, key)).to.equal(EMPTY_BYTES);

        const tokenId = 1;
        await expect(dataRegistry.safeWrite(owner.address, dataRegistry.target, tokenId, key, value))
                .to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(3*24*3600); // next 3 days
        await expect(dataRegistry.safeWrite(owner.address, dataRegistry.target, tokenId, key, value)).to.not.be.reverted;

        await time.increase(30*24*3600); // next 30 days
        await expect(dataRegistry.safeWrite(owner.address, dataRegistry.target, tokenId, key, value))
                .to.be.revertedWith("Token MUST be usable at the moment");
        
        // after: data is persisted in underlying token
        expect(await dataRegistry.read(nftCollection.target, 0, key)).to.equal(value);
      });

      it("Should emit proper event upon write data by derived", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployRegistryAndDeriveNFT);

        // generate some dummy data
        const key = ethers.id("dummy data");
        const value = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"],[666777]);

        const tokenId = 1;
        await time.increase(3*24*3600); // next 3 days
        await expect(dataRegistry.safeWrite(owner.address, dataRegistry.target, tokenId, key, value))
                .to.emit(dataRegistry, "Write")
                .withArgs(nftCollection.target, 0, key, value);
      });

      it("Should read data properly for underlying", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 0;
        expect(await dataRegistry.read(nftCollection.target, tokenId, keys[1])).to.equal(values[1]);

        await time.increase(3*24*3600); // next 3 days
        await expect(dataRegistry.read(nftCollection.target, tokenId, keys[1]))
                .to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(30*24*3600); // next 30 days
        expect(await dataRegistry.read(nftCollection.target, tokenId, keys[1])).to.equal(values[1]);
      });

      it("Should read data properly for derived", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 1;
        await expect(dataRegistry.read(dataRegistry.target, tokenId, keys[1]))
                .to.be.revertedWith("Token MUST be usable at the moment");

        await time.increase(3*24*3600); // next 3 days
        expect(await dataRegistry.read(dataRegistry.target, tokenId, keys[1])).to.equal(values[1]);

        await time.increase(30*24*3600); // next 30 days
        await expect(dataRegistry.read(dataRegistry.target, tokenId, keys[1]))
                .to.be.revertedWith("Token MUST be usable at the moment");
      });
    });

    describe("Reclaim", function(){
      it("Should revert due to illegitimate time", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        // transfer derived token to another account
        await expect(dataRegistry.transferFrom(owner.address, otherAccount.address, 1)).to.not.be.reverted;

        await time.increase(3*24*3600); // next 3 days
        await expect(dataRegistry.reclaim(nftCollection.target, 0))
                .to.be.revertedWith("Token is not reclaimable");
      });

      it("Should revert due to unauthorized sender", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        await expect(dataRegistry.connect(otherAccount).reclaim(nftCollection.target, 0))
                .to.be.revertedWith("Requester MUST be owner of token");
      });

      it("Should revert due to illegitimate claiming token", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        await expect(dataRegistry.reclaim(dataRegistry.target, 1))
                .to.be.revertedWith("Claimed token MUST be underlying");
      });

      it("Should revert due to lack of derived token", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        await expect(dataRegistry.connect(otherAccount).reclaim(nftCollection.target, 1))
                .to.be.revertedWith("Claimed token MUST has derived");
      });

      it("Should revert successfully while derived is held by another account", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        const underlyingTokenId = 0;
        const derivedTokenId = 1;

        // before
        {
          const { collection, tokenId, startTime, endTime } = await dataRegistry.derivedOf(nftCollection.target, underlyingTokenId);
          expect(collection).to.equal(dataRegistry.target);
          expect(tokenId).to.equal(derivedTokenId);
        }

        {
          const [ collection, tokenId ] = await dataRegistry.underlyingOf(derivedTokenId);
          expect(collection).to.equal(nftCollection.target);
          expect(tokenId).to.equal(underlyingTokenId);
        }

        // transfer derived token to another account
        await expect(dataRegistry.transferFrom(owner.address, otherAccount.address, derivedTokenId)).to.not.be.reverted;

        await time.increase(30*24*3600); // next 30 days
        await expect(dataRegistry.reclaim(nftCollection.target, underlyingTokenId)).to.not.be.reverted;

        // after
        {
          const { collection, tokenId, startTime, endTime } = await dataRegistry.derivedOf(nftCollection.target, underlyingTokenId);
          expect(collection).to.equal(ethers.ZeroAddress);
          expect(tokenId).to.equal(0);
        }

        {
          const [ collection, tokenId ] = await dataRegistry.underlyingOf(derivedTokenId);
          expect(collection).to.equal(ethers.ZeroAddress);          
        }

        await expect(dataRegistry.ownerOf(derivedTokenId)).to.be.reverted;
      });
    });

    describe("Query", function(){
      it("Should return isDerivable properly", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        expect(await dataRegistry.isDerivable(nftCollection.target, 1)).to.equal(true);
        expect(await dataRegistry.isDerivable(nftCollection.target, 0)).to.equal(false);
      });

      it("Should return isUsable properly", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        expect(await dataRegistry.isUsable(nftCollection.target, 0)).to.equal(true);
        expect(await dataRegistry.isUsable(dataRegistry.target, 1)).to.equal(false);

        await time.increase(3*24*3600); // next 3 days
        expect(await dataRegistry.isUsable(nftCollection.target, 0)).to.equal(false);
        expect(await dataRegistry.isUsable(dataRegistry.target, 1)).to.equal(true);

        await time.increase(30*24*3600); // next 30 days
        expect(await dataRegistry.isUsable(nftCollection.target, 0)).to.equal(true);
        expect(await dataRegistry.isUsable(dataRegistry.target, 1)).to.equal(false);

      });

      it("Should return isReclaimable properly", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        const underlyingTokenId = 0;
        const derivedTokenId = 1;

        await expect(dataRegistry.isReclaimable(otherAccount, nftCollection, underlyingTokenId))
                .to.be.revertedWith("Requester MUST be owner of token");

        await expect(dataRegistry.isReclaimable(owner, dataRegistry, derivedTokenId))
                .to.be.revertedWith("Claimed token MUST be underlying");

        await expect(dataRegistry.isReclaimable(otherAccount, nftCollection, 1))
                .to.be.revertedWith("Claimed token MUST has derived");

        expect(await dataRegistry.isReclaimable(owner, nftCollection, underlyingTokenId)).to.equal(true);

        // transfer derived token to another account
        await expect(dataRegistry.transferFrom(owner.address, otherAccount.address, derivedTokenId)).to.not.be.reverted;

        expect(await dataRegistry.isReclaimable(owner, nftCollection, underlyingTokenId)).to.equal(false);

        await time.increase(3*24*3600); // next 3 days
        expect(await dataRegistry.isReclaimable(owner, nftCollection, underlyingTokenId)).to.equal(false);

        await time.increase(30*24*3600); // next 30 days, beyond derived time
        expect(await dataRegistry.isReclaimable(owner, nftCollection, underlyingTokenId)).to.equal(true);
        
      });
    });

    describe("Royalty", function(){
      it("Should revert due to invalid tokenId", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values} = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 2;
        await expect(dataRegistry.royaltyInfo(tokenId,ethers.parseEther("1")))
                .to.be.revertedWith("Derived token MUST be valid");
      });

      it("Should return royalty info properly", async function(){
        const {dataRegistry, nftCollection, owner, otherAccount, keys, values, factory} = await loadFixture(deployRegistryAndDeriveNFT);

        const tokenId = 1;
        const ethAmountString = "1";
        const salePrice = ethers.parseEther(ethAmountString);

        const [receiver, royaltyAmount] = await dataRegistry.royaltyInfo(tokenId, salePrice);
        
        expect(receiver).to.be.properAddress;
        expect(receiver).to.not.equal(ethers.ZeroAddress);
        expect(receiver).to.equal(await factory.derivedAccountOf(nftCollection.target,0));

        const delta = Math.abs(parseFloat(ethAmountString)*DERIVED_ROYALTY_RATE/10000 - parseFloat(ethers.formatEther(royaltyAmount)));
        expect(delta).to.lessThan(1e-5);        
      });
    });    
  });

  describe("ERC721", function(){
    it("Should compatible with IERC721Receiver", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

      const tokenId = 0;      
      expect(await dataRegistry.onERC721Received(owner.address, otherAccount.address, tokenId, "0x")).to.equal(IERC721_RECEIVER_SELECTOR);
    });
  });

  describe("ERC165", function(){
    it("Should determine ERC165 interfaceId properly", async function(){
      const {dataRegistry, nftCollection, owner, otherAccount} = await loadFixture(deployDataRegistryFixture);

      //console.log(`IDynamic `, IDynamicInterfaceId());

      // nft2.0
      expect(await dataRegistry.supportsInterface(IDynamicInterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IDerivableInterfaceId())).to.equal(true);

      // based
      expect(await dataRegistry.supportsInterface(IERC165InterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC721InterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC721MetadataInterfaceId())).to.equal(true);
      expect(await dataRegistry.supportsInterface(IERC2981InterfaceId())).to.equal(true);
    });
  });
});