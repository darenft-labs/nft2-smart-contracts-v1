// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IERC721Mintable {
  /**
   * @dev Mint with token Uri
   * @param to receiver address
   * @param tokenUri token Uri
   * @return tokenId
   */
  function safeMintWithTokenUri(address to, string calldata tokenUri) external returns (uint256 tokenId);

  /**
   * @dev Mint with quantity
   * @param to receiver address
   * @param quantity number of mintable token
   */
  function safeMintBatch(address to, uint256 quantity) external;
}

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
   * @dev Determine campaign id
   * @return id digest hash
   */
  function campaignId() external returns (bytes32 id);
}