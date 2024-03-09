import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { 
  accessControlErrorRegex, 
  convertPercentageToBasisPoint, 
  CollectionSettings, 
  FreeMintKind,
  AddonsKind,
  ImplementationKind,
} from "./helpers/utils";
import { abiEncodeAddonSettings, abiEncodeCampaignId } from "./helpers/abi-coder";

import {
  Factory,
  DataRegistryV2,  
} from "../typechain-types";
import { EventLog } from "ethers";

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages

const CAMPAIGN_NAME_1 = "Campaign 1";
const FEE = "0.0001";

const COLLECTION_SETTINGS : CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

const DAPP_URI = "ipfs://dapp-uri";

describe("Factory", function(){
  // fixtures
  async function deployCollectionAndMint() {
    const {collection, factory, owner, account2} = await loadFixture(deployCollection);

    // mint some nfts
    await collection.safeMint(owner.address);
    await collection.safeMint(owner.address);
    await collection.safeMint(account2.address);

    return {collection, factory, owner, account2};
  }

  async function deployCollection() {
    const {factory, owner, account2} = await loadFixture(deployFixture);

    const tx = await factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 0);
    await tx.wait();

    const collection = await ethers.getContractAt("Collection", await factory.collectionOf(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL));
    return {collection, factory, owner, account2};
  }

  async function deployFixture() {
    const [owner, account2] = await ethers.getSigners();

    const { dataRegistry, collection, derivedAccount, erc721A, dataRegistryV2 } =
      await loadFixture(deployImplementation);

    const Factory = await ethers.getContractFactory("Factory");
    const deployFactory = await upgrades.deployProxy(Factory, [
                                            dataRegistry.target, 
                                            collection.target, 
                                            derivedAccount.target, 
                                            erc721A.target, 
                                            dataRegistryV2.target
                                          ]);
    await deployFactory.waitForDeployment();

    const factory = await ethers.getContractAt("Factory", deployFactory.target);

    return {factory, owner, account2};
  }

  async function deployImplementation() {
    const dataRegistry = await ethers.deployContract("DataRegistry");    
    const collection = await ethers.deployContract("Collection");
    const derivedAccount = await ethers.deployContract("DerivedAccount");
    const erc721A = await ethers.deployContract("Collection721A");
    const dataRegistryV2 = await ethers.deployContract("DataRegistryV2");

    return { dataRegistry, collection, derivedAccount, erc721A, dataRegistryV2 };
  }

  async function deployAddonsManager() {
    const freeMintWhitelistFCFS = await ethers.deployContract("FreeMintWhitelistFCFSStrategy");
    const freeMintWhitelistFixedToken = await ethers.deployContract("FreeMintWhitelistFixedTokenStrategy");

    const AddonsManager = await ethers.getContractFactory("AddonsManager");
    const deployAddonsManager = await upgrades.deployProxy(AddonsManager, []);
    await deployAddonsManager.waitForDeployment();

    const addOnsManager = await ethers.getContractAt("AddonsManager", deployAddonsManager.target);
    await addOnsManager.registerStrategy(freeMintWhitelistFCFS.target, AddonsKind.FREE_MINT_WHITELIST_FCFS);
    await addOnsManager.registerStrategy(freeMintWhitelistFixedToken, AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN);

    return { addOnsManager };
  }

  async function setAddonsManager() {
    const { collection, factory, owner, account2 } = await loadFixture(deployCollectionAndMint);
    const { addOnsManager } = await loadFixture(deployAddonsManager);
    await factory.setAddonsManager(addOnsManager.target);

    return { collection, factory, owner, account2, addOnsManager }
  }

  describe("Deployment", function() {
    it("Should deploy successfully", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      expect(await factory.getAddress()).to.be.properAddress;
    });
  });

  describe("Update Implementation", function(){
    it("Should revert due to unauthorized access", async function(){
      const {factory, owner, account2} = await loadFixture(deployFixture);      

      let kind = 0;
      await expect(factory.connect(account2).updateImplementation(kind, ethers.ZeroAddress)).to.be.reverted;
    });

    it("Should update implementation successfully", async function(){
      const { dataRegistry, collection, derivedAccount, erc721A, dataRegistryV2 } = await deployImplementation();
      const { factory } = await loadFixture(deployFixture);

      // before
      expect(await factory._dataRegistryImplementation()).to.not.equal(dataRegistry.target);
      expect(await factory._collectionImplementation()).to.not.equal(collection.target);
      expect(await factory._derivedAccountImplementation()).to.not.equal(derivedAccount.target);
      expect(await factory._erc721AImplementation()).to.not.equal(erc721A.target);
      expect(await factory._dataRegistryV2Implementation()).to.not.equal(dataRegistryV2.target);

      // doing
      await expect(factory.updateImplementation(ImplementationKind.DATA_REGISTRY, dataRegistry.target)).to.not.be.reverted;
      await expect(factory.updateImplementation(ImplementationKind.COLLECTION, collection.target)).to.not.be.reverted;
      await expect(factory.updateImplementation(ImplementationKind.DERIVED_ACCOUNT, derivedAccount.target)).to.not.be.reverted;
      await expect(factory.updateImplementation(ImplementationKind.ERC712A_COLLECTION, erc721A.target)).to.not.be.reverted;
      await expect(factory.updateImplementation(ImplementationKind.DATA_REGISTRY_V2, dataRegistryV2.target)).to.not.be.reverted;

      await expect(factory.updateImplementation(ImplementationKind.DATA_REGISTRY_V2+1, ethers.ZeroAddress)).to.be.reverted;

      // after
      expect(await factory._dataRegistryImplementation()).to.equal(dataRegistry.target);
      expect(await factory._collectionImplementation()).to.equal(collection.target);
      expect(await factory._derivedAccountImplementation()).to.equal(derivedAccount.target);
      expect(await factory._erc721AImplementation()).to.equal(erc721A.target);
      expect(await factory._dataRegistryV2Implementation()).to.equal(dataRegistryV2.target);
    });
  });

  describe("DataRegistry", function(){
    it("Should create data registry successfully", async function(){
      const {factory, owner} = await loadFixture(deployFixture);
      const tx = await factory.createDataRegistry(DAPP_URI);
      const receipt = await tx.wait();

      expect(await factory.dataRegistryOf(owner.address)).to.be.properAddress;
      expect(await factory.dappURI(owner.address)).to.equal(DAPP_URI);      
    });

    it("Should created data registry is properly functioning", async function(){
      const {factory, owner} = await loadFixture(deployFixture);
      const tx = await factory.createDataRegistry(DAPP_URI);
      const receipt = await tx.wait();

      expect(await factory.dataRegistryOf(owner.address)).to.be.properAddress;

      const registryAddress = await factory.dataRegistryOf(owner.address);
      const registry = await ethers.getContractAt("DataRegistry", registryAddress);
      expect(await registry.dapp()).to.equal(owner.address);
      expect(await registry.uri()).to.equal(DAPP_URI);
    });

    it("Should emit proper events", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      await expect(factory.createDataRegistry(DAPP_URI))
              .to.emit(factory, "DataRegistryCreated")
              .withArgs(owner.address, anyValue, DAPP_URI);
    });

    it("Should revert upon create registry second time", async function(){
      const {factory, owner} = await loadFixture(deployFixture);
      const tx = await factory.createDataRegistry(DAPP_URI);
      const receipt = await tx.wait();

      expect(await factory.dataRegistryOf(owner.address)).to.be.properAddress;

      await expect(factory.createDataRegistry(DAPP_URI)).to.be.revertedWith("Data registry is deployed already.");
    });
  });

  describe("Collection", function(){
    it("Should create collection successfully", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 0)).to.not.be.reverted;
    });

    it("Should created collection is properly functioning", async function(){
      const {collection,factory,owner,account2} = await loadFixture(deployCollection);
      expect(await collection.name()).to.equal(COLLECTION_NAME);
      expect(await collection.symbol()).to.equal(COLLECTION_SYMBOL);
    });

    it("Should emit proper event", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 0))
              .to.emit(factory, "CollectionCreated")
              .withArgs(owner.address, anyValue, 0);
    });

    it("Should revert due to redeploy collection with the same signature", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      // 1st time should be succeeded
      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 0)).to.not.be.reverted;

      // 2nd time should be failed
      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 0))
              .to.be.revertedWith("Collection is deployed already.");
    });

    it("Should create collection failed due to excessive royalty rate", async function(){
      const {factory, owner, account2} = await loadFixture(deployFixture);

      const settings = {
        royaltyRate: 100000,
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      };

      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, settings, 0)).to.be.reverted;
    });
  });

  describe("DerivedAccount", function(){
    it("Should create derived-account successfully", async function(){
      const {collection,factory,owner,account2} = await loadFixture(deployCollectionAndMint);

      await expect(factory.createDerivedAccount(collection.target, 0)).to.not.be.reverted;
      expect(await factory.derivedAccountOf(collection.target, 0)).to.be.properAddress;
      expect(await factory.derivedAccountOf(collection.target, 0)).to.not.equal(ethers.ZeroAddress);

      //console.log(`Derived account deployed at `, await factory.derivedAccountOf(collection.target, 0));
    });

    it("Should not revert upon second deployment", async function(){
      const {collection,factory,owner,account2} = await loadFixture(deployCollectionAndMint);

      await expect(factory.createDerivedAccount(collection.target, 0)).to.not.be.reverted;
      await expect(factory.createDerivedAccount(collection.target, 0)).to.not.be.reverted;
    });

    it("Should emit proper event", async function(){
      const {collection,factory,owner,account2} = await loadFixture(deployCollectionAndMint);

      await expect(factory.createDerivedAccount(collection.target, 0))
              .to.emit(factory, "DerivedAccountCreated")
              .withArgs(collection.target, 0, anyValue);
    });
  });

  describe("ERC721A", function(){
    it("Should create 721A failed due to excessive royalty rate", async function(){
      const {factory, owner, account2} = await loadFixture(deployFixture);

      const settings = {
        royaltyRate: 100000,
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      };

      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, settings, 1)).to.be.reverted;
    });

    it("Should create 721A failed on second time", async function(){
      const {factory, owner, account2} = await loadFixture(deployFixture);
      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 1)).to.not.be.reverted;
      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 1)).to.be.reverted;
    });

    it("Should create 721A collection successfully", async function(){
      const {factory, owner, account2} = await loadFixture(deployFixture);
      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 1)).to.not.be.reverted;
    });

    it("Should emit proper event upon deploying collection", async function(){
      const {factory, owner, account2} = await loadFixture(deployFixture);
      await expect(factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 1))
              .to.emit(factory, "CollectionCreated")
              .withArgs(owner.address, anyValue, 1);
    });
  });

  describe("DataRegistryV2", function(){
    it("Should create data registry V2 successfully", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      const settings = {
        disableComposable: false,
        disableDerivable: false,
      }
      const tx = await factory.createDataRegistryV2(DAPP_URI, settings);
      const receipt = await tx.wait();

      expect(await factory.dataRegistryOf(owner.address)).to.be.properAddress;
      expect(await factory.dappURI(owner.address)).to.equal(DAPP_URI);

      const registryAddress = await factory.dataRegistryOf(owner.address);
      const registry = (await ethers.getContractAt("DataRegistryV2", registryAddress)) as DataRegistryV2;
      expect(await registry.dapp()).to.equal(owner.address);
      expect(await registry.uri()).to.equal(DAPP_URI);
      expect(await registry.disableComposable()).to.equal(false);
      expect(await registry.disableDerivable()).to.equal(false);
    });

    it("Should created data registry disable composable is properly functioning", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      const settings = {
        disableComposable: true,
        disableDerivable: false,
      }
      const tx = await factory.createDataRegistryV2(DAPP_URI, settings);
      const receipt = await tx.wait();

      expect(await factory.dataRegistryOf(owner.address)).to.be.properAddress;

      const registryAddress = await factory.dataRegistryOf(owner.address);
      const registry = (await ethers.getContractAt("DataRegistryV2", registryAddress)) as DataRegistryV2;
      expect(await registry.dapp()).to.equal(owner.address);
      expect(await registry.uri()).to.equal(DAPP_URI);
      expect(await registry.disableComposable()).to.equal(true);
      expect(await registry.disableDerivable()).to.equal(false);
    });

    it("Should created data registry disable derivable is properly functioning", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      const settings = {
        disableComposable: false,
        disableDerivable: true,
      }
      const tx = await factory.createDataRegistryV2(DAPP_URI, settings);
      const receipt = await tx.wait();

      expect(await factory.dataRegistryOf(owner.address)).to.be.properAddress;

      const registryAddress = await factory.dataRegistryOf(owner.address);
      const registry = (await ethers.getContractAt("DataRegistryV2", registryAddress)) as DataRegistryV2;
      expect(await registry.dapp()).to.equal(owner.address);
      expect(await registry.uri()).to.equal(DAPP_URI);
      expect(await registry.disableComposable()).to.equal(false);
      expect(await registry.disableDerivable()).to.equal(true);
    });

    it("Should emit proper events", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      const settings = {
        disableComposable: false,
        disableDerivable: true,
      }

      await expect(factory.createDataRegistryV2(DAPP_URI, settings))
              .to.emit(factory, "DataRegistryV2Created")
              .withArgs(owner.address, anyValue, DAPP_URI);
    });

    it("Should revert upon create registry second time", async function(){
      const {factory, owner} = await loadFixture(deployFixture);

      const settings = {
        disableComposable: false,
        disableDerivable: true,
      }
      const tx = await factory.createDataRegistryV2(DAPP_URI, settings);
      const receipt = await tx.wait();

      expect(await factory.dataRegistryOf(owner.address)).to.be.properAddress;
      await expect(factory.createDataRegistryV2(DAPP_URI, settings)).to.be.revertedWith("Data registry is deployed already.");
    });
  });

  describe("Addons collection", function(){
    describe("SetAddonsManager", function(){
      it("Should set addons manager reverted due to unauthorized", async function(){
        const { collection, factory, owner, account2 } = await loadFixture(
          deployCollectionAndMint
        );

        const { addOnsManager } = await loadFixture(deployAddonsManager);

        await expect(factory.connect(account2).setAddonsManager(addOnsManager.target))
                .to.be.reverted;      
      });

      it("Should set addons manager successfully", async function(){
        const { collection, factory } = await loadFixture(deployCollectionAndMint);

        const { addOnsManager } = await deployAddonsManager();

        // before
        expect(await factory._addOnsManager()).to.not.equal(addOnsManager.target);

        // doing
        await expect(factory.setAddonsManager(addOnsManager.target))
                .to.not.be.reverted;

        // after
        expect(await factory._addOnsManager()).to.equal(addOnsManager.target);
      });

      it("Should reverted if addons manager is not configured yet", async function(){
        const { collection, factory, owner, account2 } = await loadFixture(
          deployCollectionAndMint
        );

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          await time.latest(),
          await time.latest() + 7*24*3600,
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN + 1,
            settings
          )
        ).to.be.revertedWith("Addons Manager has not configured yet");
      });

      it("Should revert due to unsupported kind", async function(){
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          await time.latest(),
          await time.latest() + 7*24*3600,
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN + 1,
            settings
          )
        ).to.be.revertedWith("Strategy has not configured yet");
      });
    });

    describe("Freemint-Whitelist-FCFS", function(){
      it("Should revert due to invalid time range", async function(){
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          await time.latest() + 7*24*3600,
          await time.latest(),
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FCFS,
            settings
          )
        ).to.be.revertedWith("Start time MUST be less than equal End time");
      });

      it("Should create freemint FCFS successfully", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          await time.latest(),
          await time.latest() + 7*24*3600,
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FCFS,
            settings
          )
        ).to.not.be.reverted;
      });

      it("Should create freemint FCFS emit event properly", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const startTime = await time.latest();
        const endTime = await time.latest() + 7*24*3600;
        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          startTime,
          endTime,
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FCFS,
            settings
          )
        ).to.emit(factory, "AddonsCreated")
            .withArgs(
              collection.target, 
              AddonsKind.FREE_MINT_WHITELIST_FCFS, 
              anyValue, 
              abiEncodeCampaignId(
                await collection.getAddress(),                
                AddonsKind.FREE_MINT_WHITELIST_FCFS,
                CAMPAIGN_NAME_1,
                startTime,
                endTime,
                ethers.parseEther(FEE),
              ),
              "0x"
            );
      });

      it("Should created freemint FCFS configured properly", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const startTime = await time.latest();
        const endTime = startTime + 30*24*3600;

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          startTime,
          endTime,
          ethers.parseEther(FEE)
        );

        const tx = await factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FCFS,
            settings
          );
        const result = await tx.wait();
        //console.log(`logs`, result?.logs);

        const kind = (result?.logs[2] as EventLog).args[1];
        const addOnsAddress = (result?.logs[2] as EventLog).args[2];
        
        //console.log(`addons address`, addOnsAddress);
        expect(addOnsAddress).to.be.properAddress;
        expect(kind).to.equal(AddonsKind.FREE_MINT_WHITELIST_FCFS);

        const freeMintWhitelistFCFS = await ethers.getContractAt("FreeMintWhitelistFCFSStrategy", addOnsAddress);
        expect(await freeMintWhitelistFCFS.collection()).to.equal(collection.target);
        expect(await freeMintWhitelistFCFS.startTime()).to.equal(startTime);
        expect(await freeMintWhitelistFCFS.endTime()).to.equal(endTime);
        expect(await freeMintWhitelistFCFS.fee()).to.equal(ethers.parseEther(FEE));
      });

      it("Should create freemint FCFS addons with undefined time successfully", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          0,
          0,
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FCFS,
            settings
          )
        ).to.not.be.reverted;
      });

      it("Should create freemint FCFS addons with zero fee successfully", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const startTime = await time.latest();
        const endTime = startTime + 30*24*3600;
        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          startTime,
          endTime,
          ethers.parseEther("0"),          
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FCFS,
            settings
          )
        ).to.not.be.reverted;
      });
    });

    describe("Freemint-Whitelist-FixedToken", function(){
      it("Should revert due to invalid time range", async function(){
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          await time.latest() + 7*24*3600,
          await time.latest(),
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN,
            settings
          )
        ).to.be.revertedWith("Start time MUST be less than equal End time");
      });

      it("Should create freemint fixed-token successfully", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          await time.latest(),
          await time.latest() + 7*24*3600,
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN,
            settings
          )
        ).to.not.be.reverted;
      });

      it("Should create freemint fixed-token emit event properly", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const startTime = await time.latest();
        const endTime = await time.latest() + 7*24*3600;
        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          startTime,
          endTime,
          ethers.parseEther(FEE),
        );

        await expect(
          factory.createAddons(
            collection.target,
            AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN,
            settings
          )
        ).to.emit(factory, "AddonsCreated")
            .withArgs(
              collection.target, 
              AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN,
              anyValue, 
              abiEncodeCampaignId(
                await collection.getAddress(),                
                AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN,
                CAMPAIGN_NAME_1,
                startTime,
                endTime,
                ethers.parseEther(FEE),
              ),
              "0x"
            );
      });

      it("Should created freemint fixed-token configured properly", async function () {
        const { collection, factory, owner, account2, addOnsManager } = await loadFixture(setAddonsManager);

        const startTime = await time.latest();
        const endTime = startTime + 7*24*3600;

        const settings = abiEncodeAddonSettings(
          CAMPAIGN_NAME_1,
          startTime,
          endTime,
          ethers.parseEther(FEE)
        );

        const tx = await factory.createAddons(
          collection.target,
          AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN,
          settings
        );
        const result = await tx.wait();
        //console.log(`logs`, result?.logs);

        const kind = (result?.logs[2] as EventLog).args[1];
        const addOnsAddress = (result?.logs[2] as EventLog).args[2];      
        //console.log(`addons address`, addOnsAddress);
        expect(addOnsAddress).to.be.properAddress;
        expect(kind).to.equal(AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN);

        const freeMintWhitelist = await ethers.getContractAt(
          "FreeMintWhitelistFixedTokenStrategy",
          addOnsAddress
        );
        expect(await freeMintWhitelist.collection()).to.equal(
          collection.target
        );
        expect(await freeMintWhitelist.startTime()).to.equal(startTime);
        expect(await freeMintWhitelist.endTime()).to.equal(endTime);
        expect(await freeMintWhitelist.fee()).to.equal(ethers.parseEther(FEE));
      });
    });
  });
});