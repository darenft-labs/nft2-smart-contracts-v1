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

  uint256 private _nextTokenId;
  mapping (uint256 tokenId => string) private _tokenUris;
  mapping (uint256 tokenId => RoyaltySettings rSettings) private _royaltySettings;
  mapping (uint256 tokenId => bool) private _locks;
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

  function safeMint(address to) external onlyRole(MINTER_ROLE) returns (uint256) {
    uint256 tokenId = _nextTokenId++;
    _safeMint(to, tokenId);
    return tokenId;
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
      uint256 j;
      while (j < batchSize) {
        assert(!_locks[firstTokenId + j]);
        j++;
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

    _locks[tokenId] = true;

    emit Lock(_msgSender(), tokenId);
  }

  function unlock(uint256 tokenId) external onSemiTransferable {
    require(ownerOf(tokenId) == _msgSender(), "Sender MUST be owner of token");

    _locks[tokenId] = false;

    emit Unlock(_msgSender(), tokenId);
  }

  function isLocked(uint256 tokenId) external view returns (bool) {
    assert(isSemiTransferable);
    return _locks[tokenId];
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