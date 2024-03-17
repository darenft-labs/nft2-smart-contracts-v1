// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/IDynamicV2.sol";
import "../../contracts/Collection.sol";
import "../../contracts/DataRegistryV2.sol";

contract Voucher is Ownable, IERC721Receiver {
  event VoucherCreated(address collection, uint256 tokenId);
  event BatchCreated(address collection, uint256 startId, uint256 endId);

  using Math for uint256;

  // constants definition
  uint8 private constant LINEAR_VESTING_TYPE = 1;
  uint8 private constant STAGED_VESTING_TYPE = 2;

  uint8 private constant DAILY_LINEAR_VESTING_TYPE = 1;
  uint8 private constant WEEKLY_LINEAR_VESTING_TYPE = 2;
  uint8 private constant MONTHLY_LINEAR_VESTING_TYPE = 3;
  uint8 private constant QUARTERLY_LINEAR_VESTING_TYPE = 4;

  bytes private constant BALANCE_KEY = "BALANCE";
  bytes private constant SCHEDULE_KEY = "SCHEDULE";

  uint8 private constant REDEEM_BATCH_SIZE = 10; // maximum number of schedules to be redeemed onetime

  uint8 private constant UNVESTED_STATUS = 0;
  uint8 private constant VESTED_STATUS = 1;
  uint8 private constant VESTING_STATUS = 2; // this status is specific for linear vesting type

  address private _erc20Token;
  address private _nftCollection;
  address private _dataRegistry;

  // data schemas
  mapping (uint256 => Vesting) private _tokensVesting;

  struct VestingSchedule {
    uint256 amount;
    uint8 vestingType; // linear: 1 | staged: 2
    uint8 linearType; // day: 1 | week: 2 | month: 3 | quarter: 4
    uint256 startTimestamp;
    uint256 endTimestamp;
    uint8 isVested; // unvested: 0 | vested : 1 | vesting : 2
    uint256 remainingAmount;
  }

  struct Vesting {
    uint256 balance;
    VestingSchedule[] schedules;
  }

  constructor(address erc20Token, address nftCollection, address dataRegistry) Ownable() {
    _erc20Token = erc20Token;
    _nftCollection = nftCollection;
    _dataRegistry = dataRegistry;
  }

  function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) public override returns (bytes4){
      return IERC721Receiver.onERC721Received.selector;
    }

  function isQualifiedCreator(address creator, uint256 amount) internal view returns (bool){
    if (IERC20(_erc20Token).allowance(creator, address(this)) < amount) return false;
    return true;
  }

  function isQualifiedRedeemer(address redeemer, uint256 tokenId) internal view returns (bool) {
    if (IERC721(_nftCollection).ownerOf(tokenId) != redeemer) return false;
    return true;
  }

  function create(Vesting calldata vesting) public payable returns (uint256) {
    require(isQualifiedCreator(_msgSender(), vesting.balance), "Requester must approve sufficient amount to create voucher");

    // stake amount of token to own pool
    require(IERC20(_erc20Token).transferFrom(_msgSender(), address(this), vesting.balance), "Stake voucher balance failed");

    // mint new voucher
    uint256 tokenId = Collection(_nftCollection).safeMint(address(this));

    // write data voucher
    _saveVestingData(_nftCollection, tokenId, vesting);

    // emit events
    emit VoucherCreated(_nftCollection, tokenId);
    return tokenId;
  }

  function createBatch(uint256 quantity, string[] calldata uris, Vesting calldata vesting) public returns (uint256 startId, uint256 endId) {
    require(uris.length == quantity, "Input length MUST be matched");

    uint256 total = vesting.balance * quantity;
    require(isQualifiedCreator(_msgSender(), total), "Requester must approve sufficient amount to create voucher");

    // stake amount of token to own pool
    require(IERC20(_erc20Token).transferFrom(_msgSender(), address(this), total), "Stake voucher balance failed");

    // mint new voucher
    (startId, endId) = Collection(_nftCollection).safeMintBatchWithTokenUris(address(this), uris);

    // write data voucher
    for (uint i=0; i<quantity; i++) {
      _saveVestingData(_nftCollection, startId+i,vesting);
    }

    // emit events
    emit BatchCreated(_nftCollection, startId, endId);

    return (startId, endId);
  }

  function createBatchWithRoyalty(uint256 quantity, string[] calldata uris, address receiver, uint96 rate, Vesting calldata vesting) public returns (uint256 startId, uint256 endId) {
    require(uris.length == quantity, "Input length MUST be matched");

    uint256 total = vesting.balance * quantity;
    require(isQualifiedCreator(_msgSender(), total), "Requester must approve sufficient amount to create voucher");

    // stake amount of token to own pool
    require(IERC20(_erc20Token).transferFrom(_msgSender(), address(this), total), "Stake voucher balance failed");

    // mint new voucher
    (startId, endId) = Collection(_nftCollection).safeMintBatchWithTokenUris(address(this), uris);

    // write data voucher
    for (uint i=0; i<quantity; i++) {
      _saveVestingData(_nftCollection, startId+i,vesting);
    }

    // emit events
    emit BatchCreated(_nftCollection, startId, endId);

    return (startId, endId);
  }

  function _saveVestingData(address collection, uint256 tokenId, Vesting memory vesting) internal {
    bytes32 balanceKey = keccak256(BALANCE_KEY);
    bytes memory balanceValue = abi.encode(vesting.balance);

    bytes32 scheduleKey = keccak256(SCHEDULE_KEY);
    bytes memory scheduleValue = abi.encode(vesting.schedules);

    IDynamicV2(_dataRegistry).write(collection, tokenId, balanceKey, balanceValue);
    IDynamicV2(_dataRegistry).write(collection, tokenId, scheduleKey, scheduleValue);

    // transfer voucher to requester
    IERC721(collection).transferFrom(address(this), _msgSender(), tokenId);
  }

  function calculateLinearClaimableAmount(uint256 timestamp, VestingSchedule memory linearSchedule) internal pure returns (uint256) {
    require(linearSchedule.vestingType == LINEAR_VESTING_TYPE, "The vesting type must be LINEAR");
    require(timestamp >= linearSchedule.startTimestamp && timestamp < linearSchedule.endTimestamp, "Calculating block timestamp must reside in start-end time range of schedule");

    uint256 dailyTimeLapse = 24 * 60 * 60; // in seconds
    uint256 weeklyTimeLapse = 7 * dailyTimeLapse;
    uint256 monthlyTimeLapse = 30 * dailyTimeLapse; // for simplicity we would take 30 days for a month
    uint256 quarterlyTimeLapse = 3 * monthlyTimeLapse;

    // TODO: seeking for a more effective algorithm
    uint256 timeLapse;
    if (linearSchedule.linearType == DAILY_LINEAR_VESTING_TYPE) {
      timeLapse = dailyTimeLapse;
    } else if (linearSchedule.linearType == WEEKLY_LINEAR_VESTING_TYPE) {
      timeLapse = weeklyTimeLapse;
    } else if (linearSchedule.linearType == MONTHLY_LINEAR_VESTING_TYPE) {
      timeLapse = monthlyTimeLapse;
    } else if (linearSchedule.linearType == QUARTERLY_LINEAR_VESTING_TYPE) {
      timeLapse = quarterlyTimeLapse;
    } else {
      revert("unsupported linear vesting type");
    }

    uint256 scheduleTimeRange = linearSchedule.endTimestamp - linearSchedule.startTimestamp;
    uint256 claimableAmountPerSecond = linearSchedule.amount / scheduleTimeRange;
    uint256 numberLeap = ((timestamp - linearSchedule.startTimestamp) / timeLapse);
    uint256 claimableAmount = numberLeap * timeLapse * claimableAmountPerSecond;

    return claimableAmount + linearSchedule.remainingAmount - linearSchedule.amount; // actual claimable amount must exclude already vested amount
  }

  function redeem(uint256 tokenId) public returns (bool) {
    require(isQualifiedRedeemer(_msgSender(), tokenId), "Redeemer must be true owner of voucher");

    // read voucher data from registry
    bytes32 balanceKey = keccak256(BALANCE_KEY);
    bytes memory balanceValue = IDynamicV2(_dataRegistry).read(_nftCollection, tokenId, balanceKey);
    uint256 balance;
    (balance) = abi.decode(balanceValue, (uint256));

    bytes32 scheduleKey = keccak256(SCHEDULE_KEY);
    bytes memory scheduleValue = IDynamicV2(_dataRegistry).read(_nftCollection, tokenId, scheduleKey);
    VestingSchedule[] memory schedules;
    (schedules) = abi.decode(scheduleValue, (VestingSchedule[]));

    // we process only first REDEEM_BATCH_SIZE schedules, in order to avoid hitting the gas limit
    // presumming that all the schedules is chronologically ordered
    uint256 claimableAmount;
    uint8 j;
    uint8 batchSize;
    while (batchSize<REDEEM_BATCH_SIZE && j+1 <= schedules.length) {
      if (schedules[j].isVested == VESTED_STATUS) {
        // schedule is already vested, thus ignore
      } else if (schedules[j].vestingType == STAGED_VESTING_TYPE) {
        if (block.timestamp >= schedules[j].startTimestamp) {
          claimableAmount += schedules[j].amount;

          schedules[j].isVested = VESTED_STATUS; // update vesting status
          batchSize ++;
        } else {
          // still not reach the start time of vesting
          break;
        }        
      } else if (schedules[j].vestingType == LINEAR_VESTING_TYPE) {
        if (block.timestamp >= schedules[j].endTimestamp) {
          claimableAmount += schedules[j].remainingAmount;

          schedules[j].isVested = VESTED_STATUS; // update vesting status
          schedules[j].remainingAmount = 0;
          batchSize ++;
        } else if (block.timestamp >= schedules[j].startTimestamp) {
          uint256 linearClaimableAmount = calculateLinearClaimableAmount(block.timestamp, schedules[j]);
          // claimable amount can not exceed remaining amount
          linearClaimableAmount = (schedules[j].remainingAmount > linearClaimableAmount ? linearClaimableAmount : schedules[j].remainingAmount);

          claimableAmount += linearClaimableAmount;

          schedules[j].isVested = VESTING_STATUS; // update vesting status
          schedules[j].remainingAmount -= linearClaimableAmount;
          batchSize ++;
        } else {
          // still not reach the start time of vesting
          break;
        }          
      }
      j++;
    }

    require(balance > 0, "Voucher balancer must be greater than zero");
    require(claimableAmount <= IERC20(_erc20Token).balanceOf(address(this)), "Balance of pool is insufficient for redeem");

    require(batchSize > 0, "Not any schedule is available for vesting");
    require(claimableAmount <= balance, "Claimable amount must be less than or equal remaining balance of voucher");

    // update voucher data: balance, schedules
    balanceValue = abi.encode(balance - claimableAmount);
    IDynamicV2(_dataRegistry).write(_nftCollection, tokenId, balanceKey, balanceValue);

    scheduleValue = abi.encode(schedules);
    IDynamicV2(_dataRegistry).write(_nftCollection, tokenId, scheduleKey, scheduleValue);

    // transfer erc20 token
    require(IERC20(_erc20Token).transfer(_msgSender(), claimableAmount), "Transfer ERC20 token claimable amount failed");

    return true;
  }
}