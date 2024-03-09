// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

import "../abstracts/FreeMintWhitelistAbstractContract.sol";
import "../interfaces/addons/IFreeMintWhitelistStrategy.sol";
import "../interfaces/addons/IAddonsManager.sol";

contract FreeMintWhitelistFCFSStrategy is FreeMintWhitelistAbstractContract, ReentrancyGuardUpgradeable {
  IAddonsManager.AddonsKind public constant WHITELIST_KIND = IAddonsManager.AddonsKind.FREE_MINT_WHITELIST_FCFS;
  mapping (address wallet => uint256 total) private _totalMinted;

  struct Leaf {
    address wallet;
    uint256 quantity;    
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

  function freeMintWhitelist(bytes calldata leafData, bytes32[] calldata proof, uint256 amount) external payable override nonReentrant {
    if (startTime > 0) {
      require(block.timestamp >= startTime, "FreeMint campaign is not available yet");
    }

    if (endTime > 0) {
      require(block.timestamp <= endTime, "FreeMint campaign is finished already");
    }

    if (fee > 0) {
      require(msg.value >= fee, "Message value is insufficient");
    }

    Leaf memory leaf = _verifyProof(leafData, proof);
    require(leaf.wallet == msg.sender, "Sender MUST be whitelisted wallet");
    
    require(_totalMinted[msg.sender]+amount <= leaf.quantity, "Can not claim more than allocation");
    _totalMinted[msg.sender] += amount;
    IERC721Mintable(collection).safeMintBatch(msg.sender, amount);

    emit FreeMint(msg.sender, amount);
  }

  function claimableAmount(bytes calldata leafData, bytes32[] calldata proof, address receiver) public view returns (uint256 amount) {
    Leaf memory leaf = _verifyProof(leafData, proof);
    require(leaf.wallet == receiver, "Receiver MUST be whitelisted wallet");

    amount = leaf.quantity - _totalMinted[receiver];
    return amount;
  }

  function _verifyProof(bytes calldata leafData, bytes32[] calldata proof) private view returns (Leaf memory leaf) {
    bytes32 leafHash = keccak256(leafData);
    require(MerkleProof.verify(proof, merkleRoot, leafHash), "Invalid proof");

    leaf = abi.decode(leafData, (Leaf));
    return leaf;
  }
}