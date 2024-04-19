// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum FreeMintableKind {
  NON_FREE_MINTABLE,
  FREE_MINT_COMMUNITY,
  FREE_MINT_WHITELIST
}

enum CollectionKind {
  ERC721Standard, 
  ERC721A
}

enum ProtocolAction {
  WRITE,
  DERIVE,
  DERIVE_WILDCARD,
  CLAIM_DERIVED_ROYALTY
}

enum LockingKind {
  UNLOCKING,
  PERPETUAL,
  FIXED_TIME
}

struct CollectionSettings {
  uint96 royaltyRate;
  bool isSoulBound;
  FreeMintableKind isFreeMintable;
  bool isSemiTransferable;
}

struct RoyaltySettings {
  address receiver;
  uint96 rate;
}

struct Token {
  address collection;
  uint256 tokenId;
}

struct TokenRange {
  uint256 start;
  uint256 end;
}

struct DataRegistrySettings {
  bool disableComposable;
  bool disableDerivable;
}

struct DerivedToken {
  address collection;
  uint256 tokenId;
  uint256 startTime;
  uint256 endTime;
}

struct FreemintCampaignSettings {
  string name;
  uint256 startTime;
  uint256 endTime;
  uint256 fee;
  address feeReceiver;
}

struct LockingSettings {
  LockingKind kind;
  uint256 startTime;
  uint256 endTime;
}