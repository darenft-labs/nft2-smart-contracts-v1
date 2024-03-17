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