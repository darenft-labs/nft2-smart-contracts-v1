// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

import "../abstracts/FreeMintWhitelistAbstractContract.sol";
import "../interfaces/addons/IFreeMintWhitelistStrategy.sol";
import "../interfaces/addons/IAddonsManager.sol";

contract FreeMintWhitelistFixedTokenStrategy is FreeMintWhitelistAbstractContract, ReentrancyGuardUpgradeable {
  IAddonsManager.AddonsKind public constant WHITELIST_KIND = IAddonsManager.AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN;
  mapping (bytes32 leafHash => bool) private _isUsed;

  struct Leaf {
    address wallet;
    uint256 tokenId;
    string tokenUri;
  }

  function campaignId() external override view returns (bytes32) {
    return keccak256(
      abi.encode(
        collection,
        WHITELIST_KIND,
        name,
        startTime,
        endTime,
        fee
      )
    );
  }

  function freeMintWhitelist(bytes calldata leafData, bytes32[] calldata proof, uint256 amount) external override payable nonReentrant {
    require(amount == 1, "Only mint one token per try");

    if (startTime > 0) {
      require(block.timestamp >= startTime, "FreeMint campaign is not available yet");
    }

    if (endTime > 0) {
      require(block.timestamp <= endTime, "FreeMint campaign is finished already");
    }

    if (fee > 0) {
      require(msg.value >= fee, "Message value is insufficient");
    }

    bytes32 leafHash = keccak256(leafData);
    require(MerkleProof.verify(proof, merkleRoot, leafHash), "Invalid proof");

    Leaf memory leaf = abi.decode(leafData, (Leaf));
    require(leaf.wallet == msg.sender, "Sender MUST be whitelisted wallet");

    require(!_isUsed[leafHash], "Token has already claimed");
    _isUsed[leafHash] = true;
    IERC721Mintable(collection).safeMintWithTokenUri(msg.sender, leaf.tokenUri);

    emit FreeMint(msg.sender, amount);
  }
}