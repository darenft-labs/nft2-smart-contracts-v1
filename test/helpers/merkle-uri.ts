import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { ethers } from "hardhat";

export function buildTree(
  tokenIds: number[],
  tokenUris: string[]
) {
  if (
    tokenIds.length == tokenUris.length
  ) {
    const leafs: Buffer[] = [];
    for (let j = 0; j < tokenIds.length; j++) {
      leafs.push(
        keccak256(createLeaf(tokenIds[j], tokenUris[j]))
      );
    }
    const tree = new MerkleTree(leafs, keccak256, { sortPairs: true });
    const rootHash = `0x${tree.getRoot().toString("hex")}`;
    let proofs: string[][] = [];
    for (let j = 0; j < tokenIds.length; j++) {
      proofs.push(tree.getHexProof(leafs[j]));
    }
    return { rootHash, proofs };
  }
}

export function createLeaf(tokenId: number, tokenUri: string) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "string"],
    [tokenId, tokenUri]
  );
}
