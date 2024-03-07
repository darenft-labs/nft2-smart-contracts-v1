import { ethers, keccak256 } from "ethers";

export function abiEncodeAddonSettings(
  name: string,
  startTime: number,
  endTime: number,
  fee: bigint,
) {
  return new ethers.AbiCoder().encode(
    ["tuple(string,uint256,uint256,uint256)"],
    [[name,startTime,endTime,fee]]
  );
}

export function abiEncodeCampaignId(
  collection: string,
  kind: number,
  name: string,
  startTime: number,
  endTime: number,
  fee: bigint,  
) {
  return keccak256(new ethers.AbiCoder().encode(
    ["address","uint8","string","uint256","uint256","uint256"],
    [collection,kind,name,startTime,endTime,fee]
  ));
}