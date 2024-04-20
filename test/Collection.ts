import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { CollectionSettings, convertPercentageToBasisPoint, encodeCollectionSettings,
          IERC165InterfaceId, IERC721InterfaceId, IERC721MetadataInterfaceId,
          IFreeMintableInterfaceId, ISemiTransferableInterfaceId, IERC2981InterfaceId,
          FreeMintKind, 
          LockingKind} from "./helpers/utils";
import { buildTree } from "./helpers/merkle-uri";

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages
const TOKEN_URI1 = "ipfs://bayc-1";
const TOKEN_URI2 = "ipfs://bayc-2";
const TOKEN_URI3 = "ipfs://bayc-3";

const COLLECTION_SETTINGS : CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),  
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

describe("Collection", function(){
  // fixtures  
  async function deployFixture() {
    const {collection, owner, account2} = await loadFixture(deployCollection);
    
    // initialize    
    let settings : string = encodeCollectionSettings(COLLECTION_SETTINGS);
    await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

    return {collection, owner, account2};
  }

  async function deployCollection() {
    const [owner, account2, account3] = await ethers.getSigners();

    const collection = await ethers.deployContract("Collection");
    return {collection, owner, account2, account3};
  }

  describe("Deployment", function(){
    it("Should deploy successfully", async function(){
      const {collection, owner} = await loadFixture(deployFixture);
      expect(await collection.getAddress()).to.be.properAddress;
      expect(await collection.getAddress()).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Initialization", function(){
    it("Should initialize successfully", async function(){
      const [owner, account2] = await ethers.getSigners();
      const collection = await ethers.deployContract("Collection");

      let settings : string = encodeCollectionSettings(COLLECTION_SETTINGS);
      await expect(collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings)).to.not.be.reverted;
    });

    it("Should revert due to excessive royalty rate", async function(){
      const [owner, account2] = await ethers.getSigners();
      const collection = await ethers.deployContract("Collection");

      let settings : string = encodeCollectionSettings({
        royaltyRate: 100000,
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false
      });
      
      await expect(collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings))
              .to.be.revertedWith("The royalty rate MUST NOT exceed limit percentage.");
    });
  });

  describe("Mint", function(){
    it("Should mint successfully", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);

      await expect(collection.safeMint(account2.address)).to.not.be.reverted;
    });

    it("Should mint-with-URI successfully", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);

      await expect(collection.safeMintWithTokenUri(account2.address, TOKEN_URI1)).to.not.be.reverted;
    });

    it("Should mint revert due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);

      await expect(collection.connect(account2).safeMint(account2.address)).to.be.reverted;
    });

    it("Should mint-with-URI revert due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);

      await expect(collection.connect(account2).safeMintWithTokenUri(account2.address, TOKEN_URI1)).to.be.reverted;
    });

    it("Should store tokenURI properly", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);

      await expect(collection.safeMintWithTokenUri(account2.address, TOKEN_URI1)).to.not.be.reverted;
      expect(await collection.tokenURI(0)).to.be.equal(TOKEN_URI1);
    });
  });

  describe("Royalty", function(){
    it("Should calculate royalty amount properly", async function(){
      const [owner, account2] = await ethers.getSigners();
      const collection = await ethers.deployContract("Collection");

      let settings : string = encodeCollectionSettings(COLLECTION_SETTINGS);
      await expect(collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings)).to.not.be.reverted;
      await expect(collection.safeMintWithTokenUri(account2.address, TOKEN_URI1)).to.not.be.reverted;

      const salePrice = ethers.parseEther("50");
      const {receiver, royaltyAmount} = await collection.royaltyInfo(0,salePrice);

      expect(receiver).to.be.equal(owner.address);
      expect(royaltyAmount).to.be.greaterThanOrEqual(ethers.parseEther("4.99999"));
      expect(royaltyAmount).to.be.lessThanOrEqual(ethers.parseEther("5.00001"));
    });
  });

  describe("MintBatch", function(){
    it("Should mint batch reverted due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      let uris : string[] = [];
      for (let j=0;j<1000;j++){
        uris.push(TOKEN_URI1);
      }

      await expect(collection.connect(account2).safeMintBatchWithTokenUris(account2.address, uris)).to.be.reverted;
    });

    it("Should mint batch reverted due to excessive input length", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      let uris : string[] = [];
      for (let j=0;j<1000;j++){
        uris.push(TOKEN_URI1);
      }

      await expect(collection.safeMintBatchWithTokenUris(account2.address, uris))
              .to.be.revertedWith("Batch size MUST not exceed limit");      
    });

    it("Should mint batch with URIs successfully", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);

      await expect(collection.safeMintBatchWithTokenUris(account2.address, [TOKEN_URI1, TOKEN_URI2, TOKEN_URI3])).to.not.be.reverted;

      let tokenId = 0;
      expect(await collection.tokenURI(tokenId++)).to.equal(TOKEN_URI1);
      expect(await collection.tokenURI(tokenId++)).to.equal(TOKEN_URI2);
      expect(await collection.tokenURI(tokenId++)).to.equal(TOKEN_URI3);
    });

    it("Should mint batch with URIs and Royalty reverted due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      let uris : string[] = [];
      for (let j=0;j<1000;j++){
        uris.push(TOKEN_URI1);
      }

      await expect(collection.connect(account2).safeMintBatchWithTokenUrisAndRoyalty(account2.address, uris, account2.address, convertPercentageToBasisPoint(5)))
              .to.be.reverted;
    });

    it("Should mint batch with URIs and Royalty reverted due to excessive input length", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      let uris : string[] = [];
      for (let j=0;j<1000;j++){
        uris.push(TOKEN_URI1);
      }

      await expect(collection.safeMintBatchWithTokenUrisAndRoyalty(account2.address, uris, account2.address, convertPercentageToBasisPoint(5)))
              .to.be.revertedWith("Batch size MUST not exceed limit");
    });

    it("Should mint batch with URIs and Royalty successfully", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      const uris : string[] = [TOKEN_URI1, TOKEN_URI2, TOKEN_URI3];
      const rate = 5;
      const price = "9.55"; // in ETH

      await expect(collection.safeMintBatchWithTokenUrisAndRoyalty(account2.address, uris, account2.address, convertPercentageToBasisPoint(rate))).to.not.be.reverted;

      let tokenId = 0;
      expect(await collection.tokenURI(tokenId++)).to.equal(TOKEN_URI1);
      expect(await collection.tokenURI(tokenId++)).to.equal(TOKEN_URI2);
      expect(await collection.tokenURI(tokenId++)).to.equal(TOKEN_URI3);

      const {receiver, royaltyAmount} = await collection.royaltyInfo(0,ethers.parseEther(price));
      expect(receiver).equal(account2.address);

      const delta = parseFloat(price)*rate/100 - parseFloat(ethers.formatEther(royaltyAmount));
      expect(Math.abs(delta)).to.lte(1e-5);

    });
  });

  describe("Burn", function(){
    it("Should burn failed due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      await expect(collection.safeMint(account2.address)).to.not.be.reverted;

      const tokenId = 0;
      await expect(collection.burn(tokenId))
              .to.be.revertedWith("Sender MUST be owner of token");
    });

    it("Should burn failed due to invalid tokenId", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      await expect(collection.safeMint(account2.address)).to.not.be.reverted;

      const tokenId = 100;
      await expect(collection.burn(tokenId))
              .to.be.reverted;
    });

    it("Should burn succeeded", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      await expect(collection.safeMint(account2.address)).to.not.be.reverted;
      const tokenId = 0;

      // before
      expect(await collection.ownerOf(tokenId)).to.equal(account2.address);

      await expect(collection.connect(account2).burn(tokenId)).to.not.be.reverted;
      
      // after
      await expect(collection.ownerOf(tokenId)).to.be.reverted;
    });
  });

  describe("SoulBound", function(){
    it("Should transfer will be succeeded if soul-bound is disable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.safeMint(owner.address)).to.not.be.reverted;

      const tokenId = 0;
      expect(await collection.ownerOf(tokenId)).to.equal(owner.address);

      await expect(collection.transferFrom(owner.address, account2.address, tokenId)).to.not.be.reverted;
      expect(await collection.ownerOf(tokenId)).to.equal(account2.address);
    });

    it("Should transfer will be reverted if soul-bound is enable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: true,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.safeMint(owner.address)).to.not.be.reverted;

      const tokenId = 0;
      expect(await collection.ownerOf(tokenId)).to.equal(owner.address);

      await expect(collection.transferFrom(owner.address, account2.address, tokenId)).to.be.reverted;
    });

    it("Should soulbound addons is visible", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
      expect(await collection.isSoulBound()).to.equal(false);

      const collection2 = await ethers.deployContract("Collection");
      let settings2 : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: true,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection2.initialize(owner.address, `${COLLECTION_NAME}-1`, `${COLLECTION_SYMBOL}-1`, settings2);
      expect(await collection2.isSoulBound()).to.equal(true);
    });
  });

  describe("URI MerkleTree", function(){
    it("Should update root reverted if disable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.updateUriMerkleRoot(ethers.id("foo"))).to.be.reverted;
    });

    it("Should update root reverted due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.FREE_MINT_WHITELIST,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.connect(account2).updateUriMerkleRoot(ethers.id("foo"))).to.be.reverted;
    });

    it("Should update root successfully", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.FREE_MINT_WHITELIST,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
      expect(await collection.isFreeMintable()).to.equal(FreeMintKind.FREE_MINT_WHITELIST);

      const {rootHash, proofs} = buildTree([0,1],[TOKEN_URI1, TOKEN_URI2])!;

      await expect(collection.updateUriMerkleRoot(rootHash)).to.not.be.reverted;
      expect(await collection.uriMerkleRoot()).to.equal(rootHash);
    });

    it("Should claimURI will be reverted if disable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.claimTokenUri(0,TOKEN_URI1,[ethers.id("foo")])).to.be.reverted;
    });

    it("Should claimURI reverted due to invalid proof", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.FREE_MINT_WHITELIST,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
      await expect(collection.claimTokenUri(0, TOKEN_URI1, [ethers.id("foo")]))
        .to.be.reverted;
    });

    it("Should claimURI successfully", async function(){
      const {collection, owner, account2, account3} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.FREE_MINT_WHITELIST,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await collection.safeMint(owner.address);
      await collection.safeMint(account2.address);
      await collection.safeMint(account3.address);

      const tokenIds = [0,1,2];
      const tokenUris = [TOKEN_URI1, TOKEN_URI2, TOKEN_URI3];

      const {rootHash, proofs} = buildTree(tokenIds,tokenUris)!;
      await expect(collection.updateUriMerkleRoot(rootHash)).to.not.be.reverted;
      expect(await collection.uriMerkleRoot()).to.equal(rootHash);

      await expect(collection.connect(account3).claimTokenUri(tokenIds[2], tokenUris[2], proofs[2])).to.not.be.reverted;
      expect(await collection.ownerOf(tokenIds[2])).to.equal(account3.address);
      expect(await collection.tokenURI(tokenIds[2])).to.equal(tokenUris[2]);

      await expect(
        collection
          .connect(account2)
          .claimTokenUri(tokenIds[1], tokenUris[1], proofs[1])
      ).to.not.be.reverted;
      expect(await collection.ownerOf(tokenIds[1])).to.equal(account2.address);
      expect(await collection.tokenURI(tokenIds[1])).to.equal(tokenUris[1]);

      await expect(
        collection.claimTokenUri(tokenIds[0], tokenUris[0], proofs[0])
      ).to.not.be.reverted;
      expect(await collection.ownerOf(tokenIds[0])).to.equal(owner.address);
      expect(await collection.tokenURI(tokenIds[0])).to.equal(tokenUris[0]);

      // should tx reverted should user try to mint with tampered proof
      await expect(
        collection
          .connect(account3)
          .claimTokenUri(tokenIds[2], tokenUris[2], proofs[0])
      ).to.be.reverted;
    });
  });

  describe("SemiTransferable", function(){
    describe("Lock", function(){
      it("Should lock/unlock/isLocked reverted should semi-transferable addons is disable", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: false,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

        await expect(collection.safeMint(owner.address)).to.not.be.reverted;
        const tokenId = 0;
        await expect(collection.lock(tokenId)).to.be.reverted;
        await expect(collection.unlock(tokenId)).to.be.reverted;
        await expect(collection.isLocked(tokenId)).to.be.reverted;
      });

      it("Should lock reverted due to illegitimate sender", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(owner.address)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.connect(account2).lock(tokenId))
                .to.be.revertedWith("Sender MUST be owner of token");
      });

      it("Should lock reverted upon locking perpetually twice", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;
        await expect(collection.connect(account2).lock(tokenId)).to.be.revertedWith("Token is locked perpetually already");
      });

      it("Should lock successfully", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;

        const locks = await collection.locks(tokenId);

        expect(locks.kind).to.equal(LockingKind.PERPETUAL);
        expect(locks.startTime).to.equal(await time.latest());
        expect(locks.endTime).to.equal(0);
      });

      it("Should emit Lock event properly", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(owner.address)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.lock(tokenId))
                .to.emit(collection, "Lock")
                .withArgs(owner.address, tokenId);        
      });

      it("Should lock works properly", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;
        expect(await collection.isLocked(tokenId)).to.equal(true);
  
        await expect(collection.connect(account2).transferFrom(owner.address, account2.address, tokenId)).to.be.reverted;
      });

      it("Should Semi-Transferable property is visible", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: false,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
        expect(await collection.isSemiTransferable()).to.equal(false);

        const collection2 = await ethers.deployContract("Collection");
        let settings2 : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: true,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection2.initialize(owner.address, `${COLLECTION_NAME}-1`, `${COLLECTION_SYMBOL}-1`, settings2);
        expect(await collection2.isSemiTransferable()).to.equal(true);
      });

      it("Should lock successfully if token is locking fixed time", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() + 7*24*3600)).to.not.be.reverted;
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;
      });

      it("Should lock successfully after unlocking", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;

        await time.increase(3*24*2400);
        await expect(collection.connect(account2).unlock(tokenId)).to.not.be.reverted;

        await time.increase(5*24*3600);
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;
      });

      it("Should lock works properly with tokenId non zero", async function(){
        const {collection, owner, account2, account3} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;

        const tokenId = 2;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;        
        await expect(collection.connect(account2).transferFrom(account2.address, account3.address, tokenId)).to.be.reverted;
      });
    });

    describe("LockWithTime", function(){
      it("Should lockWithTime reverted if semi-transferable addons is disable", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: false,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;

        await expect(collection.lockWithTime(tokenId, await time.latest() + 7*24*3600)).to.be.reverted;
      });

      it("Should lockWithTime reverted due to illegitimate sender", async function(){
        const {collection, owner, account2, account3} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account3).lockWithTime(tokenId, await time.latest() + 7*24*3600))
                .to.be.revertedWith("Sender MUST be owner of token");
      });

      it("Should lockWithTime reverted due to invalid time range", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() - 7*24*3600))
                .to.be.revertedWith("End time MUST be valid");
      });

      it("Should lockWithTime reverted if token is locking perpetually", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;
        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() + 7*24*3600)).to.be.revertedWith("Token is locking perpetually");
      });

      it("Should lockWithTime reverted if token is locking fixed time not yet ended", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() + 7*24*3600)).to.not.be.reverted;

        await time.increase(24*3600);
        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() + 3*24*3600)).to.be.revertedWith("Token locking fixed time not yet ended");
      });

      it("Should lockWithTime once successfully", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        const endTime = await time.latest() + 7*24*3600;
        await expect(collection.connect(account2).lockWithTime(tokenId, endTime)).to.not.be.reverted;

        const locks = await collection.locks(tokenId);
        expect(locks.kind).to.equal(LockingKind.FIXED_TIME);
        expect(locks.startTime).to.equal(await time.latest());
        expect(locks.endTime).to.equal(endTime);
      });

      it("Should lockWithTime twice successfully", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() + 7*24*3600)).to.not.be.reverted;

        const startTime = await time.increase(8*24*3600);
        const endTime = await time.latest() + 15*24*3600;
        await expect(collection.connect(account2).lockWithTime(tokenId, endTime)).to.not.be.reverted;

        const locks = await collection.locks(tokenId);
        expect(locks.kind).to.equal(LockingKind.FIXED_TIME);
        expect(locks.startTime).to.be.greaterThanOrEqual(startTime);
        expect(locks.endTime).to.equal(endTime);
      });

      it("Should lockWithTime successfully after unlocking", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;

        await time.increase(3*24*2400);
        await expect(collection.connect(account2).unlock(tokenId)).to.not.be.reverted;

        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() + 30*24*3600)).to.not.be.reverted;
      });

      it("Should lockWithTime emits LockWithTime event", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(account2.address);
        
        const endTime = await time.latest() + 7*24*3600;
        await expect(collection.connect(account2).lockWithTime(tokenId, endTime))
                  .to.emit(collection, "LockWithTime")
                  .withArgs(account2.address, 0, anyValue, endTime);
      });

      it("Should lockWithTime works properly", async function(){
        const {collection, owner, account2, account3} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(account2.address);
        
        const endTime = await time.latest() + 7*24*3600;

        await expect(collection.connect(account2).lockWithTime(tokenId, endTime)).to.not.reverted;

        await expect(collection.connect(account2).transferFrom(account2.address, account3.address, tokenId)).to.be.reverted;

        await time.increase(15*24*3600);
        await expect(collection.connect(account2).transferFrom(account2.address, account3.address, tokenId)).to.not.be.reverted;
        expect(await collection.ownerOf(tokenId)).to.equal(account3.address);
      });

      it("Should lockWithTime works properly with tokenId non zero", async function(){
        const {collection, owner, account2, account3} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;

        const tokenId = 2;
        
        const endTime = await time.latest() + 7*24*3600;

        await expect(collection.connect(account2).lockWithTime(tokenId, endTime)).to.not.reverted;
        await expect(collection.connect(account2).transferFrom(account2.address, account3.address, tokenId)).to.be.reverted;
      });

      it("Should isLocked works properly upon locking successfully", async function(){
        const {collection, owner, account2, account3} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(account2.address);
        
        const endTime = await time.latest() + 7*24*3600;

        await expect(collection.connect(account2).lockWithTime(tokenId, endTime)).to.not.reverted;

        expect(await collection.isLocked(tokenId)).to.equal(true);

        await time.increase(15*24*3600);
        expect(await collection.isLocked(tokenId)).to.equal(false);
      });
    });

    describe("Unlock", function(){
      it("Should unlock reverted due to illegitimate sender", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(owner.address)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.connect(account2).unlock(tokenId))
                .to.be.revertedWith("Sender MUST be owner of token");
      });

      it("Should unlock reverted if token has not been locked", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;        
        
        await expect(collection.connect(account2).unlock(tokenId)).to.be.revertedWith("Token MUST be locking perpetually");
      });

      it("Should unlock reverted if token has been locked with fixed time", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;        
        
        await expect(collection.connect(account2).lockWithTime(tokenId, await time.latest() + 7*24*3600)).to.not.be.reverted;
        await expect(collection.connect(account2).unlock(tokenId)).to.be.revertedWith("Token MUST be locking perpetually");
      });

      it("Should unlock successfully", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(account2.address)).to.not.be.reverted;
        const tokenId = 0;
        
        await expect(collection.connect(account2).lock(tokenId)).to.not.be.reverted;
        await expect(collection.connect(account2).unlock(tokenId)).to.not.be.reverted;

        expect(await collection.isLocked(tokenId)).to.equal(false);

        const locks = await collection.locks(tokenId);
        expect(locks.kind).to.equal(LockingKind.UNLOCKING);
        expect(locks.startTime).to.equal(0);
        expect(locks.endTime).to.equal(0);
      });

      it("Should emit Unlock event properly", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.safeMint(owner.address)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.lock(tokenId)).to.not.be.reverted;
        await expect(collection.unlock(tokenId))
                .to.emit(collection, "Unlock")
                .withArgs(owner.address, tokenId);
      });
    });
  });

  describe("ERC165", function(){
    it("Should determine ERC165 interfaceId properly", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      // add-ons
      expect(await collection.supportsInterface(ISemiTransferableInterfaceId())).to.equal(true);

      // based
      expect(await collection.supportsInterface(IERC165InterfaceId())).to.equal(true);
      expect(await collection.supportsInterface(IERC721InterfaceId())).to.equal(true);
      expect(await collection.supportsInterface(IERC721MetadataInterfaceId())).to.equal(true);
      expect(await collection.supportsInterface(IERC2981InterfaceId())).to.equal(true);
    });
  });

});