// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../helpers/DataStruct.sol";

interface IFactory {
  /**
   * @dev The factory MUST emit the DataRegistryCreated event upon successful creation data registry.
   */
  event DataRegistryCreated(address dapp, address registry, string dappURI);

  /**
   * @dev The factory MUST emit the DataRegistryV2Created event upon successful creation data registry.
   */
  event DataRegistryV2Created(address indexed dapp, address indexed registry, string dappURI);

  /**
   * @dev The factory MUST emit the CollectionCreated event upon successful creation collection.
   */  
  event CollectionCreated(address owner, address collection, CollectionKind kind);

  /**
   * @dev The factory MUST emit the AddonsCreated event upon successful creation addons.
   */ 
  event AddonsCreated(address indexed collection, uint8 indexed kind, address addons, bytes32 campaignId, bytes data);

  /**
   * @dev The factory MUST emit the DerivedAccountCreated event upon successful creation derived account.
   */ 
  event DerivedAccountCreated(address underlyingCollection, uint256 underlyingTokenId, address derivedAccount);

  /**
   * @dev The factory MUST emit the Fee event upon successful setting fee.
   */ 
  event Fee(bytes32 action, uint256 fee);

  /**
   * @dev create data registry v1
   * @param dappURI dapp uri
   */
  function createDataRegistry(string calldata dappURI) external returns (address registry);

  /**
   * @dev create ERC721 collection
   * @param name name of collection
   * @param symbol symbol
   * @param settings including royalty rate, addons settings
   * @param kind standard or 721A
   */
  function createCollection(string calldata name, string calldata symbol, CollectionSettings calldata settings, CollectionKind kind) external returns (address);

  /**
   * @dev create collection addons
   * @param collection address
   * @param kind uint8
   * @param settingsData abi encoded
   * @return address addons contract 
   */
  function createAddons(address collection, uint8 kind, bytes calldata settingsData) external returns (address);

  /**
   * @dev create TBA account for NFT
   * @param underlyingCollection collection address
   * @param underlyingTokenId tokenId
   */
  function createDerivedAccount(address underlyingCollection, uint256 underlyingTokenId) external returns (address);

  /**
   * @dev lookup data registry
   * @param dapp owner address
   */
  function dataRegistryOf(address dapp) external view returns (address);

  /**
   * @dev lookup dapp uri
   * @param dapp uri of dapp
   */
  function dappURI(address dapp) external view returns (string memory);

  /**
   * @dev lookup collection
   * @param owner account address
   * @param name collection name
   * @param symbol collection symbol
   */
  function collectionOf(address owner, string calldata name, string calldata symbol) external view returns (address);

  /**
   * @dev lookup TBA
   * @param underlyingCollection collection address
   * @param underlyingTokenId tokenId
   */
  function derivedAccountOf(address underlyingCollection, uint256 underlyingTokenId) external view returns (address);

  /**
   * @dev Returns fee of action in wei
   * 
   * @param action action kind
   * @param times number of executions
   */
  function getFee(ProtocolAction action, uint256 times) external view returns (address, uint256);
}