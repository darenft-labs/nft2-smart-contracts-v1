import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { ethers } from "hardhat";

export function buildTree(addresses: string[], tokenIds: number[], tokenUris: string[]) {
  if (addresses.length == tokenIds.length &&
    addresses.length == tokenUris.length) {
    const leafs : Buffer[] = [];
    for (let j=0;j<addresses.length; j++){
      leafs.push(keccak256(createLeaf(addresses[j], tokenIds[j], tokenUris[j])));
    }
    const tree = new MerkleTree(leafs, keccak256, {sortPairs: true});
    const rootHash = `0x${tree.getRoot().toString('hex')}`;    
    let proofs : string[][] = [];
    for (let j=0;j<addresses.length; j++){
      proofs.push(tree.getHexProof(leafs[j]));
    }
    return {rootHash, proofs};
  }
}

export function createLeaf(address: string, tokenId: number, tokenUri: string) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,uint256,string)"],
    [[address, tokenId, tokenUri]]
  );
}