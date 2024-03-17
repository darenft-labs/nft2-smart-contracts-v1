// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../helpers/DataStruct.sol";
import "../interfaces/IFeeManager.sol";

contract FeeManager is IFeeManager, AccessControlUpgradeable {
  mapping (ProtocolAction action => uint256 amount) private _fees;
  address private _receiver;

  function initialize() public initializer {
    __AccessControl_init();
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    _receiver = _msgSender();
  }

  function setReceiver(address receiver) public onlyRole(DEFAULT_ADMIN_ROLE) {
    require(receiver != address(0), "Receiver MUST be valid address");
    
    _receiver = receiver;
  }

  function getReceiver() public view returns (address) {
    return _receiver;
  }

  function setFee(ProtocolAction action, uint256 fee) public onlyRole(DEFAULT_ADMIN_ROLE) {
    require(fee > 0, "Fee MUST be greater than zero");

    _fees[action] = fee;

    emit SetFee(action, fee);
  }

  function getFee(ProtocolAction action) public view returns (uint256) {
    return _fees[action];
  }
}