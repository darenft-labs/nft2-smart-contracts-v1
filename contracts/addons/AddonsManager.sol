// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EnumerableSetUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "../interfaces/addons/IAddonsManager.sol";

contract AddonsManager is IAddonsManager, AccessControlUpgradeable {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  EnumerableSetUpgradeable.AddressSet private _whitelistedStrategies;

  mapping (uint8 kind => address strategy) private _addonsKind;

  function initialize() public initializer {
    __AccessControl_init();
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function registerStrategy(address strategy, uint8 kind) public onlyRole(DEFAULT_ADMIN_ROLE) {
    require(
        !_whitelistedStrategies.contains(strategy),
        "Strategy: Already whitelisted"
    );
    _whitelistedStrategies.add(strategy);
    _addonsKind[kind] = strategy;

    emit RegisterStrategy(strategy, kind);
  }

  function isWhitelistedStrategy(address strategy) public view returns (bool) {
    return _whitelistedStrategies.contains(strategy);
  }

  function strategyOfKind(uint8 kind) public view returns (address) {
    return _addonsKind[kind];
  }
}