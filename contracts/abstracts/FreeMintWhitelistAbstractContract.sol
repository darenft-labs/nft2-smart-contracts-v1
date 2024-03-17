// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "../interfaces/addons/IFreeMintWhitelistStrategy.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

abstract contract FreeMintWhitelistAbstractContract is IFreeMintWhitelistStrategy, AccessControlUpgradeable {

  struct Settings {
    string name;
    uint256 startTime;
    uint256 endTime;
    uint256 fee;
  }

  address public factory;
  address public collection;
  string public name;
  uint256 public startTime;
  uint256 public endTime;
  uint256 public fee;
  address public feeReceiver;

  bytes32 public merkleRoot;
  
  function initialize(address owner, address _collection, string calldata _name, uint256 _startTime, uint256 _endTime, 
        uint256 _fee) external initializer {
    require(_startTime <= _endTime, "Start time MUST be less than equal End time");

    factory = _msgSender();
    __AccessControl_init();
    _grantRole(DEFAULT_ADMIN_ROLE, owner);

    collection = _collection;
    name = _name;
    startTime = _startTime;
    endTime = _endTime;
    fee = _fee;
    feeReceiver = owner;
  }

  function campaignId() external view virtual returns (bytes32);

  function updateMerkleRoot(bytes32 _merkleRoot) external onlyRole(DEFAULT_ADMIN_ROLE) {
    merkleRoot = _merkleRoot;
    emit UpdateMerkleRoot(merkleRoot);
  }

  function freeMintWhitelist(bytes calldata leafData, bytes32[] calldata proof, uint256 amount) external payable virtual;
}