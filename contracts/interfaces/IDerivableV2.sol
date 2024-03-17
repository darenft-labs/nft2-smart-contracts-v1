// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../helpers/DataStruct.sol";

/// @dev the ERC-165 identifier for this interface is `0xd63e236c`
interface IDerivableV2 {
  /**
    * @dev The registry MUST emit the Derive event upon successful wildcard deriving NFT.
    * This event is persisted in order to comply with v1 interface
    * It should be replaced by DeriveByKeys event.
    */
  event Derive(address underlyingCollection, uint256 underlyingTokenId, address derivedCollection, uint256 derivedTokenId, uint256 startTime, uint256 endTime);

  /**
    * @dev The registry MUST emit the DeriveByKeys event upon successful deriving NFT by specified keys.
    */
  event DeriveByKeys(address underlyingCollection, uint256 underlyingTokenId, address derivedCollection, uint256 derivedTokenId, uint256 startTime, uint256 endTime, bytes32[] keyHashes);

  /**
    * @dev Derive NFT from an underlying NFT by all keys.
    *   
    * Emits Derive event.
    * @param underlyingCollection collection address of the underlying NFT
    * @param underlyingTokenId token ID of the underlying NFT
    * @param startTime Unix timestamp from which the derived NFT is usable
    * @param endTime Unix timestamp beyond which the derived NFT is unusable
    * @param royaltyRate royalty rate in basis point of derived NFT
    */
  function derive(address underlyingCollection, uint256 underlyingTokenId, uint256 startTime, uint256 endTime, uint256 royaltyRate) external payable returns (uint256 tokenId);

  /**
    * @dev Derive NFT from an underlying NFT by specified keys.
    *   
    * Emits DeriveByKeys event.
    * @param underlyingCollection collection address of the underlying NFT
    * @param underlyingTokenId token ID of the underlying NFT
    * @param startTime Unix timestamp from which the derived NFT is usable
    * @param endTime Unix timestamp beyond which the derived NFT is unusable
    * @param royaltyRate royalty rate in basis point of derived NFT
    * @param keyHashes list of keys
    */
  function deriveByKeys(address underlyingCollection, uint256 underlyingTokenId, uint256 startTime, uint256 endTime, uint256 royaltyRate, bytes32[] calldata keyHashes) external payable returns (uint256 tokenId);

  /**
    * @dev Returns the derived NFT of a underlying NFT by all keys.
    *       
    * @param underlyingCollection collection address of the underlying NFT
    * @param underlyingTokenId token ID of the underlying NFT    
    */
  function derivedOf(address underlyingCollection, uint256 underlyingTokenId) external view returns (DerivedToken memory);

  /**
    * @dev Returns the derived NFT of a underlying NFT by specified key.
    *       
    * @param underlyingCollection collection address of the underlying NFT
    * @param underlyingTokenId token ID of the underlying NFT
    * @param key the key hash
    */
  function derivedByKeyOf(address underlyingCollection, uint256 underlyingTokenId, bytes32 key) external view returns (DerivedToken memory);

  /**
    * @dev Returns the underlying NFT of a specific derived NFT.
    *           
    * @param derivedTokenId token ID of the derived NFT    
    */
  function underlyingOf(uint256 derivedTokenId) external view returns (address, uint256);

  /**
    * @dev Returns boolean indicates whether the NFT is usable by all keys or not.
    *   
    * @param collection collection address of the NFT        
    * @param tokenId token ID of the NFT
    */
  function isUsable(address collection, uint256 tokenId) external view returns (bool);

  /**
    * @dev Returns boolean indicates whether the NFT is usable by specified key or not.
    *   
    * @param collection collection address of the NFT
    * @param tokenId token ID of the NFT
    * @param key the key hash need to lookup
    */
  function isUsableByKey(address collection, uint256 tokenId, bytes32 key) external view returns (bool);

  /**
    * @dev Returns boolean indicates whether the NFT is derivable or not
    *   
    * @param collection collection address of the NFT        
    * @param tokenId token ID of the NFT    
    */
  function isDerivable(address collection, uint256 tokenId) external view returns (bool);
  
  /**
    * @dev Returns boolean indicates whether the NFT is derivable by specified key or not.
    *   
    * @param collection collection address of the NFT        
    * @param tokenId token ID of the NFT
    * @param key the key hash need to lookup    
    */
  function isDerivableByKey(address collection, uint256 tokenId, bytes32 key) external view returns (bool);
}