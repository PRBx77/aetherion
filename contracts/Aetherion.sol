// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract Aetherion is ERC721, Ownable {
    using Strings for uint256;

    uint256 public constant TOKEN_ID = 1;
    uint8 public constant MAX_EVOLUTION_LEVEL = 4;

    address public immutable TREASURY_GENESIS;
    uint256 public immutable GENESIS_TIMESTAMP;

    struct AetherionState {
        uint256 currentTVL;
        uint8   evolutionLevel;
        uint256 totalYieldGenerated;
        uint256 daysSinceGenesis;
        uint256 lastVisualUpdate;
        string  currentProphecy;
        uint32  publicationsCount;
        uint32  interactionsCount;
    }

    AetherionState public state;
    address public oracle;
    string private _baseTokenURI;

    event AetherionAwakened(address indexed treasuryGenesis, uint256 timestamp);
    event EvolutionLevelChanged(uint8 oldLevel, uint8 newLevel);
    event ProphecyRevealed(string prophecy, uint256 timestamp);
    event StateUpdated(uint256 tvl, uint256 yield, uint256 interactions);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event BaseURIUpdated(string newBaseURI);

    error AetherionIsSoulbound();
    error AetherionNonApprovable();
    error OnlyOracle();
    error InvalidAddress();
    error InvalidLevel();

    modifier onlyOracle() {
        if (msg.sender != oracle) revert OnlyOracle();
        _;
    }

    constructor(address _treasuryGenesis, string memory _baseURI)
        ERC721("Aetherion", "AETH")
        Ownable(msg.sender)
    {
        if (_treasuryGenesis == address(0)) revert InvalidAddress();

        TREASURY_GENESIS = _treasuryGenesis;
        GENESIS_TIMESTAMP = block.timestamp;
        _baseTokenURI = _baseURI;

        state = AetherionState({
            currentTVL: 0,
            evolutionLevel: 1,
            totalYieldGenerated: 0,
            daysSinceGenesis: 0,
            lastVisualUpdate: block.timestamp,
            currentProphecy: "The Aether awakens.",
            publicationsCount: 0,
            interactionsCount: 0
        });

        _safeMint(_treasuryGenesis, TOKEN_ID);
        emit AetherionAwakened(_treasuryGenesis, block.timestamp);
    }

    function transferFrom(address, address, uint256) public pure override {
        revert AetherionIsSoulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert AetherionIsSoulbound();
    }

    function approve(address, uint256) public pure override {
        revert AetherionNonApprovable();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert AetherionNonApprovable();
    }

    function updateState(uint256 _tvl, uint256 _yield, uint32 _newInteractions) external onlyOracle {
        state.currentTVL = _tvl;
        state.totalYieldGenerated = _yield;
        state.interactionsCount += _newInteractions;
        state.daysSinceGenesis = (block.timestamp - GENESIS_TIMESTAMP) / 1 days;
        state.lastVisualUpdate = block.timestamp;

        emit StateUpdated(_tvl, _yield, state.interactionsCount);
        _checkEvolution();
    }

    function revealProphecy(string calldata _prophecy) external onlyOracle {
        state.currentProphecy = _prophecy;
        state.publicationsCount += 1;
        emit ProphecyRevealed(_prophecy, block.timestamp);
    }

    function forceEvolutionLevel(uint8 _newLevel) external onlyOwner {
        if (_newLevel < 1 || _newLevel > MAX_EVOLUTION_LEVEL) revert InvalidLevel();
        uint8 old = state.evolutionLevel;
        state.evolutionLevel = _newLevel;
        emit EvolutionLevelChanged(old, _newLevel);
    }

    function _checkEvolution() internal {
        uint8 old = state.evolutionLevel;
        uint8 newLevel = old;

        if (old == 1 && (state.daysSinceGenesis > 30 || state.currentTVL > 100 ether)) {
            newLevel = 2;
        } else if (old == 2 && (state.daysSinceGenesis > 180 || state.currentTVL > 500 ether)) {
            newLevel = 3;
        } else if (old == 3 && (state.daysSinceGenesis > 365 || state.currentTVL > 2000 ether)) {
            newLevel = 4;
        }

        if (newLevel != old) {
            state.evolutionLevel = newLevel;
            emit EvolutionLevelChanged(old, newLevel);
        }
    }

    function setOracle(address _newOracle) external onlyOwner {
        if (_newOracle == address(0)) revert InvalidAddress();
        address old = oracle;
        oracle = _newOracle;
        emit OracleUpdated(old, _newOracle);
    }

    function setBaseURI(string calldata _newBaseURI) external onlyOwner {
        _baseTokenURI = _newBaseURI;
        emit BaseURIUpdated(_newBaseURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(abi.encodePacked(
            _baseTokenURI,
            "state_",
            uint256(state.evolutionLevel).toString(),
            ".json"
        ));
    }

    function getState() external view returns (AetherionState memory) {
        return state;
    }

    function baseURI() external view returns (string memory) {
        return _baseTokenURI;
    }
}
