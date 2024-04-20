// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

import "./abstracts/AbstractCollection.sol";

import "./interfaces/IFactory.sol";
import "./interfaces/ISemiTransferable.sol";

contract Collection is AccessControlUpgradeable, AbstractCollection, ERC721Upgradeable, ISemiTransferable {
  uint8 private constant MAX_BATCH_SIZE = 100;

  uint256 public _nextTokenId;
  mapping (uint256 tokenId => string) private _tokenUris;
  mapping (uint256 tokenId => RoyaltySettings rSettings) private _royaltySettings;  
  mapping (uint256 tokenId => LockingSettings lSettings) public locks;

  bytes32 public uriMerkleRoot;

  function initialize(address owner, string calldata name, string calldata symbol, bytes calldata settings) external override initializer {
    factory = _msgSender();
    _owner = owner;    

    ERC721Upgradeable.__ERC721_init(name,symbol);

    CollectionSettings memory cSettings = abi.decode(settings, (CollectionSettings));

    _setRoyaltyRate(cSettings.royaltyRate);

    _setSoulBound(cSettings.isSoulBound);
    _setFreeMintable(cSettings.isFreeMintable);
    _setSemiTransferable(cSettings.isSemiTransferable);

    _setAdminRoles(owner);
  }

  function _setAdminRoles(address owner) private {
    _grantRole(DEFAULT_ADMIN_ROLE, owner);
    _grantRole(MINTER_ROLE, owner);
  }

  function safeMint(address to) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
    tokenId = _nextTokenId++;
    _safeMint(to, tokenId);
  }

  function safeMintBatch(address to, uint256 quantity) external onlyRole(MINTER_ROLE) {
    uint256 j = 0;
    while (j < quantity) {
      uint256 tokenId = _nextTokenId++;
      _safeMint(to, tokenId);
      j++;
    }
  }

  function safeMintWithTokenUri(address to, string calldata tokenUri) external onlyRole(MINTER_ROLE) returns (uint256) {
    return _mintWithTokenUri(to, tokenUri);
  }

  function _mintWithTokenUri(address to, string memory tokenUri) private returns (uint256) {
    uint256 tokenId = _nextTokenId++;
    _safeMint(to, tokenId);
    _tokenUris[tokenId] = tokenUri;
    return tokenId;
  }

  function safeMintBatchWithTokenUris(address to, string[] calldata tokenUris) external onlyRole(MINTER_ROLE) returns (uint256 startId, uint256 endId) {
    return _mintBatchWithTokenUrisAndRoyalty(to, tokenUris, _msgSender(), 0);
  }

  function safeMintBatchWithTokenUrisAndRoyalty(address to, string[] calldata tokenUris, address receiver, uint96 royaltyRate) external onlyRole(MINTER_ROLE) returns (uint256 startId, uint256 endId) {
    return _mintBatchWithTokenUrisAndRoyalty(to, tokenUris, receiver, royaltyRate);
  }  

  function _mintBatchWithTokenUrisAndRoyalty(address to, string[] calldata tokenUris, address receiver, uint96 royaltyRate) private returns (uint256 startId, uint256 endId) {
    require(tokenUris.length <= MAX_BATCH_SIZE, "Batch size MUST not exceed limit");
    uint8 j;
    uint256 tokenId;
    startId = _nextTokenId;

    while (j < tokenUris.length &&  j < MAX_BATCH_SIZE) {
      tokenId = _nextTokenId++;
      _safeMint(to, tokenId);
      _tokenUris[tokenId] = tokenUris[j];
      if (royaltyRate>0) {
        _royaltySettings[tokenId] = RoyaltySettings(receiver, royaltyRate);
      }
      j++;
    }
    
    return (startId, _nextTokenId-1);
  }

  function tokenURI(uint256 tokenId) public view override returns (string memory) {
    return _tokenUris[tokenId];
  }

  function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
  ) public view override returns (address receiver, uint256 royaltyAmount) {
    if (_royaltySettings[tokenId].rate>0) {
      royaltyAmount = (salePrice * _royaltySettings[tokenId].rate) / _feeDenominator();
      return (_royaltySettings[tokenId].receiver, royaltyAmount);
    }    
    return super.royaltyInfo(tokenId, salePrice);
  }

  function burn(uint256 tokenId) public {
    require(_msgSender() == ownerOf(tokenId), "Sender MUST be owner of token");
    _burn(tokenId);
  }

  // ====================================================
  //                    ADD-ONS
  // ====================================================
  function _beforeTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize) internal view override {
    if (from != address(0) && to != address(0)) {
      assert(!isSoulBound);

      if(isSemiTransferable){
        uint256 j;
        while (j < batchSize) {        
          assert(!this.isLocked(firstTokenId + j));
          j++;
        }
      }
    }    
  }

  // ====================================================
  //                    FREE-MINTABLE
  // ====================================================
  function updateUriMerkleRoot(bytes32 _merkleRoot) public onFreemint onlyRole(DEFAULT_ADMIN_ROLE) {
    uriMerkleRoot = _merkleRoot;
  }

  function claimTokenUri(uint256 tokenId, string calldata _tokenUri, bytes32[] calldata proof) public onFreemint {
    require(_msgSender() == ownerOf(tokenId), "Sender MUST be owner of token");
    
    bytes32 leaf = keccak256(abi.encode(tokenId,_tokenUri));

    require(MerkleProof.verify(proof, uriMerkleRoot, leaf), "Invalid proof");

    _tokenUris[tokenId] = _tokenUri;
  }

  // ====================================================
  //                    SEMI-TRANSFERABLE
  // ====================================================
  function lock(uint256 tokenId) external onSemiTransferable {
    require(ownerOf(tokenId) == _msgSender(), "Sender MUST be owner of token");
    require(locks[tokenId].kind != LockingKind.PERPETUAL, "Token is locked perpetually already");

    locks[tokenId] = LockingSettings(LockingKind.PERPETUAL, block.timestamp, 0);

    emit Lock(_msgSender(), tokenId);
  }

  function lockWithTime(uint256 tokenId, uint256 endTime) external onSemiTransferable {
    require(ownerOf(tokenId) == _msgSender(), "Sender MUST be owner of token");
    require(block.timestamp < endTime, "End time MUST be valid");
    require(locks[tokenId].kind != LockingKind.PERPETUAL, "Token is locking perpetually");

    if (locks[tokenId].kind == LockingKind.FIXED_TIME) {
      require(block.timestamp > locks[tokenId].endTime, "Token locking fixed time not yet ended");
    }

    locks[tokenId] = LockingSettings(LockingKind.FIXED_TIME, block.timestamp, endTime);

    emit LockWithTime(_msgSender(), tokenId, block.timestamp, endTime);
  }

  function unlock(uint256 tokenId) external onSemiTransferable {
    require(ownerOf(tokenId) == _msgSender(), "Sender MUST be owner of token");
    require(locks[tokenId].kind == LockingKind.PERPETUAL, "Token MUST be locking perpetually");

    delete locks[tokenId];

    emit Unlock(_msgSender(), tokenId);
  }

  function isLocked(uint256 tokenId) external view onSemiTransferable returns (bool) {
    if (locks[tokenId].kind == LockingKind.PERPETUAL) {
      return block.timestamp >= locks[tokenId].startTime;
    } else if (locks[tokenId].kind == LockingKind.FIXED_TIME) {
      return block.timestamp >= locks[tokenId].startTime && block.timestamp <= locks[tokenId].endTime;
    }

    return false;
  }

  // ====================================================
  //                    IERC165
  // ====================================================
  function supportsInterface(bytes4 interfaceId)
    public
    view
    override (ERC721Upgradeable, AccessControlUpgradeable, IERC165)
    returns (bool)
  {
      return 
        super.supportsInterface(interfaceId) ||
        interfaceId == type(IERC2981).interfaceId ||
        interfaceId == type(ISemiTransferable).interfaceId;
  }
}