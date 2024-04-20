import {
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

import { LINEAR_VESTING_TYPE, STAGED_VESTING_TYPE, DAILY_LINEAR_TYPE, QUARTERLY_LINEAR_TYPE, UNVESTED_STATUS } from "../examples/Voucher";

const IDYNAMIC_ABI = [
  "write(address,uint256,bytes32,bytes)",
  "safeWrite(address,address,uint256,bytes32,bytes)",
  "read(address,uint256,bytes32)",
];

const IDYNAMIC_V2_ABI = [
  "write(address,uint256,bytes32,bytes)",
  "writeBatch(address,uint256,uint256,bytes32,bytes)",
  "read(address,uint256,bytes32)",
];

const ICOMPOSABLE_ABI = [
  "compose((address,uint256),(address,uint256),bytes32[])",  
];

const IDERIVABLE_ABI = [
  "derive(address,uint256,uint256,uint256,uint256)",
  "reclaim(address,uint256)",
  "derivedOf(address,uint256)",
  "underlyingOf(uint256)",
  "isUsable(address,uint256)",
  "isDerivable(address,uint256)",
  "isReclaimable(address,address,uint256)",
];

const IDERIVABLE_V2_ABI = [
  "derive(address,uint256,uint256,uint256,uint256)",
  "deriveByKeys(address,uint256,uint256,uint256,uint256,bytes32[])",
  "derivedOf(address,uint256)",
  "derivedByKeyOf(address,uint256,bytes32)",
  "underlyingOf(uint256)",
  "isUsable(address,uint256)",
  "isUsableByKey(address,uint256,bytes32)",
  "isDerivable(address,uint256)",
  "isDerivableByKey(address,uint256,bytes32)",
];

const IINSCRIPTABLE_ABI = [
  "inscribe(address,uint256,bytes32,bytes)",
];

const IFREEMINTABLE_ABI = [
  "freeMint(address)",
];

const ISEMITRANSFERABLE_ABI = [
  "lock(uint256)",
  "lockWithTime(uint256,uint256)",
  "unlock(uint256)",
  "isLocked(uint256)",
];

const IERC6551_ABI = [
  "token()",
  "state()",
  "isValidSigner(address,bytes)",
];

const IDERIVED_ACCOUNT_ABI = [  
  "claimRoyalty(address,uint256)",
];


// utilities helper functions
export function accessControlErrorRegex(){
  return /^AccessControl: account 0x[0-9a-zA-Z]{40} is missing role 0x[0-9a-zA-Z]{64}/;
}

export function getRandomInt(max: number ) {
  return Math.floor(Math.random() * max);
}

export function getRandomIntInclusive(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); // The maximum is inclusive and the minimum is inclusive
}

export async function mockVestingSchedules(numberSchedules: number) : Promise<any[]> {
  const amount = "100000";
  const startTimestamp = await time.latest();
  const endTimestamp = startTimestamp + 365 * 24 * 3600;

  let schedules : any[] = [];
  for (let j=0; j<numberSchedules; j++){
    const vestingType = getRandomIntInclusive(LINEAR_VESTING_TYPE, STAGED_VESTING_TYPE);
    const linearType = getRandomIntInclusive(DAILY_LINEAR_TYPE, QUARTERLY_LINEAR_TYPE);

    schedules.push({
        amount: ethers.parseEther(amount),
        vestingType,
        linearType: vestingType == LINEAR_VESTING_TYPE ? linearType : 0,
        startTimestamp: ethers.getBigInt(startTimestamp),
        endTimestamp: vestingType == LINEAR_VESTING_TYPE ? ethers.getBigInt(endTimestamp) : 0,
        isVested: UNVESTED_STATUS,
        remainingAmount: vestingType == LINEAR_VESTING_TYPE ? ethers.parseEther(amount) : 0,
      })
  }

  return schedules;
}

export function convertPercentageToBasisPoint(percentage: number) {
  return Math.floor(percentage / 0.01);
}

export type CollectionSettings = {
  royaltyRate: number;
  isSoulBound: boolean;
  isFreeMintable: FreeMintKind;
  isSemiTransferable: boolean;
}

export enum ImplementationKind { 
  DATA_REGISTRY,
  COLLECTION,
  DERIVED_ACCOUNT,
  ERC712A_COLLECTION,
  DATA_REGISTRY_V2
}

export enum FreeMintKind {
  NON_FREE_MINT,
  FREE_MINT_COMMUNITY,
  FREE_MINT_WHITELIST
}

export enum AddonsKind {
  FREE_MINT_WHITELIST_FCFS,
  FREE_MINT_WHITELIST_FIXED_TOKEN,
  FREE_MINT_COMMUNITY,
}

export enum ProtocolAction {
  WRITE,
  DERIVE,
  DERIVE_WILDCARD,
  CLAIM_DERIVED_ROYALTY
}

export enum LockingKind {
  UNLOCKING,
  PERPETUAL,
  FIXED_TIME
}

export type DataRegistrySettings = {
  disableComposable: boolean;
  disableDerivable: boolean;
};

export function encodeCollectionSettings(settings: CollectionSettings) {
  return ethers.AbiCoder.defaultAbiCoder().encode(["tuple(uint96,bool,uint8,bool)"],[[settings.royaltyRate,settings.isSoulBound,settings.isFreeMintable,settings.isSemiTransferable]]);
}

export function erc165InterfaceIdCalculator(signatures: string[]) : string {
  let interfaceId : string = "";
  for (let j=0; j<signatures.length; j++){
    const selector = ethers.id(signatures[j]).substring(2, 10);
    interfaceId = xorHex(interfaceId, selector);
    //console.log(`interface id ${interfaceId}`);
  }
  return '0x' + interfaceId;
}

export function xorHex(hex1: string, hex2: string) : string {
  if (hex1.length == 0) {
    return hex2;
  }

  const buf1 = Buffer.from(hex1, 'hex');
  const buf2 = Buffer.from(hex2, 'hex');
  const bufResult = buf1.map((b, i) => b ^ buf2[i]);
  
  return Buffer.from(bufResult).toString('hex');
}

export function IDynamicInterfaceId() : string {
  return erc165InterfaceIdCalculator(IDYNAMIC_ABI);
}

export function IDynamicV2InterfaceId() : string {
  return erc165InterfaceIdCalculator(IDYNAMIC_V2_ABI);
}

export function IComposableInterfaceId() : string {
  return erc165InterfaceIdCalculator(ICOMPOSABLE_ABI);
}

export function IDerivableInterfaceId() : string {
  return erc165InterfaceIdCalculator(IDERIVABLE_ABI);
}

export function IDerivableV2InterfaceId() : string {
  return erc165InterfaceIdCalculator(IDERIVABLE_V2_ABI);
}

export function IInscriptableInterfaceId() : string {
  return erc165InterfaceIdCalculator(IINSCRIPTABLE_ABI);
}

export function IFreeMintableInterfaceId() : string {
  return erc165InterfaceIdCalculator(IFREEMINTABLE_ABI);
}

export function ISemiTransferableInterfaceId() : string {
  return erc165InterfaceIdCalculator(ISEMITRANSFERABLE_ABI);
}

export function IERC6551InterfaceId() : string {
  return erc165InterfaceIdCalculator(IERC6551_ABI);
}

export function IDerivedAccountInterfaceId() : string {
  return erc165InterfaceIdCalculator(IDERIVED_ACCOUNT_ABI);
}

export function IERC165InterfaceId() : string {
  return "0x01ffc9a7";
}

export function IERC721InterfaceId() : string {
  return "0x80ac58cd";
}

export function IERC721MetadataInterfaceId() : string {
  return "0x5b5e139f";
}

export function IERC2981InterfaceId() : string {
  return "0x2a55205a";
}

describe("Utils", function(){
  it("Should determine ERC165 interfaceId properly", async function(){
    let interfaceId = erc165InterfaceIdCalculator(["name()","symbol()","tokenURI(uint256)"]);
    expect(interfaceId).to.equal("0x5b5e139f");
  });
});
