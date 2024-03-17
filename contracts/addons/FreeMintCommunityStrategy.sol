// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IFactory.sol";
import "../interfaces/addons/IAddonsManager.sol";
import "../interfaces/addons/IFreeMintCommunityStrategy.sol";

contract FreeMintCommunityStrategy is IFreeMintCommunityStrategy, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
  struct Settings {
    string name;
    uint256 startTime;
    uint256 endTime;
    uint256 fee;
    uint256 maxAllocation;
  }

  mapping (address wallet => uint256 total) private _totalMinted;

  address public factory;
  address public collection;
  string public name;
  uint256 public startTime;
  uint256 public endTime;
  uint256 public fee;
  address public feeReceiver;
  uint256 public maxAllocation;
  
  function initialize(address owner, address _collection, 
            string calldata _name, uint256 _startTime, uint256 _endTime, 
            uint256 _fee, uint256 _maxAllocation) external initializer {
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
    maxAllocation = _maxAllocation;
  }

  function campaignId() public view returns (bytes32) {
    return keccak256(
      abi.encode(
        collection,
        IAddonsManager.AddonsKind.FREE_MINT_COMMUNITY,
        name,
        startTime,
        endTime,
        fee,
        maxAllocation
      )
    );
  }

  function freeMint(uint256 amount) public payable nonReentrant {
    if (startTime > 0) {
      require(block.timestamp >= startTime, "FreeMint campaign is not available yet");
    }

    if (endTime > 0) {
      require(block.timestamp <= endTime, "FreeMint campaign is finished already");
    }

    if (fee > 0) {
      require(msg.value >= fee, "Message value is insufficient");
      (bool sent, bytes memory data) = feeReceiver.call{value: fee}("");
    }

    require(_totalMinted[msg.sender]+amount <= maxAllocation, "Can not claim more than maximum allocation");

    _totalMinted[msg.sender] += amount;
    IERC721Mintable(collection).safeMintBatch(msg.sender, amount);

    emit FreeMint(msg.sender, amount);
  }

  function claimableAmount(address receiver) public view returns (uint256) {
    return maxAllocation - _totalMinted[receiver];
  }
}