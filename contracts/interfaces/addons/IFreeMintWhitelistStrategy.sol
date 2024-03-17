// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IERC721Mintable.sol";

interface IFreeMintWhitelistStrategy {
  
  /**
    * @dev The freeMinter MUST emit the FreeMint event upon successful claiming.
    */
  event FreeMint(address receiver, uint256 amount);

  /**
    * @dev Freemint by whitelist
    *   
    * Emits FreeMint event.
    * @param leafData encoded leaf data
    * @param proof merkle proof
    * @param amount number to mint
    */
  function freeMintWhitelist(bytes calldata leafData, bytes32[] calldata proof, uint256 amount) external payable;

  /** 
   * @dev The freeminter MUST emit UpdateMerkleRoot event upon successful update.
   */
  event UpdateMerkleRoot(bytes32 merkleRoot);

  /**
   * @dev Update Merkle root
   * 
   * Emits UpdateMerkleRoot event.
   * @param merkleRoot root hash
   */
  function updateMerkleRoot(bytes32 merkleRoot) external;

  /**
   * @dev Returns id hash of campaign   
   */
  function campaignId() external view returns (bytes32 id);
}