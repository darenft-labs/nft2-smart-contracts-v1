// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/// @dev the ERC-165 identifier for this interface is `0xd212301b`
interface IDynamicV2 {
  /**
   * @dev The registry MUST emit the WriteBatch event upon writing batch successful
   */
  event WriteBatch(address collection, uint256 startId, uint256 endId, bytes32 key, bytes value);

  /**
    * @dev Write single NFT data in terms of key/value.
    *   
    * Emits Write event.
    * @param collection the collection address of NFT
    * @param tokenId the NFT token ID
    * @param key the key hash
    * @param value the ABI encoded value
    */
  function write(address collection, uint256 tokenId, bytes32 key, bytes calldata value) external payable;

  /**
    * @dev Write batch NFT data in terms of key/value.
    *   
    * Emits Write event.
    * @param collection the collection address of NFT
    * @param startId the first id of batch
    * @param endId the last id of batch
    * @param key the key hash
    * @param value the ABI encoded value
    */
  function writeBatch(address collection, uint256 startId, uint256 endId, bytes32 key, bytes calldata value) external payable;

  /**
    * @dev Return the value corresponding to specific key of an NFT.
    *   
    * @param collection the collection address of NFT
    * @param tokenId the NFT token ID
    * @param key the Keccak256 hashed key
    * @return the ABI encoded value
    */
  function read(address collection, uint256 tokenId, bytes32 key) external view returns (bytes memory);  
}