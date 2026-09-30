// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IAetherion {
    function updateState(uint256 tvl, uint256 yield, uint32 newInteractions) external;
    function revealProphecy(string calldata prophecy) external;
}

/**
 * @title AetherionOracle
 * @notice Pay-per-interaction contract for consulting Aetherion.
 * @dev Handles BNB + DWALL payments with tiered discounts.
 *      Split: 50% Vault + 40% Treasury + 10% Buyback/Burn.
 */
contract AetherionOracle is Ownable, ReentrancyGuard {

    enum InteractionType { SIMPLE, PROPHECY, REVELATION, BLESSING, RITUAL }

    // ============ FEE STRUCTURE (BNB) ============
    uint256 public constant FEE_SIMPLE     = 0.0002 ether;
    uint256 public constant FEE_PROPHECY   = 0.001 ether;
    uint256 public constant FEE_REVELATION = 0.005 ether;
    uint256 public constant FEE_BLESSING   = 0.01 ether;
    uint256 public constant FEE_RITUAL     = 0.03 ether;

    // ============ DISTRIBUTION ============
    uint16 public constant PCT_VAULT    = 5000; // 50%
    uint16 public constant PCT_TREASURY = 4000; // 40%
    uint16 public constant PCT_BUYBACK  = 1000; // 10%
    uint16 public constant BASIS        = 10000;

    // ============ DWALL PAYMENT DISCOUNT ============
    uint16 public constant DWALL_PAYMENT_DISCOUNT = 2000; // -20%

    // ============ ADDRESSES ============
    IAetherion public immutable aetherion;
    address public immutable aetherionVault;
    address public immutable treasuryVenus;
    address public immutable buybackAddress;
    IERC20  public immutable dwallToken;
    IERC721 public immutable livingGems;

    // Interaction counter for periodic sync with Aetherion
    uint32 public pendingInteractions;
    uint256 public totalBnbCollected;
    uint256 public totalDwallCollected;

    // ============ EVENTS ============
    event InteractionPaid(
        address indexed user,
        InteractionType indexed itype,
        uint256 amountBnb,
        uint256 amountDwall,
        bool paidInDwall
    );
    event Distributed(uint256 toVault, uint256 toTreasury, uint256 toBuyback);
    event AetherionSynced(uint256 tvl, uint256 yield, uint32 interactions);

    // ============ ERRORS ============
    error InsufficientOffering();
    error InvalidAddress();
    error TransferFailed();
    error ZeroValue();

    constructor(
        address _aetherion,
        address _vault,
        address _treasury,
        address _buyback,
        address _dwall,
        address _livingGems
    ) Ownable(msg.sender) {
        if (_aetherion == address(0) || _vault == address(0) || _treasury == address(0) ||
            _buyback == address(0) || _dwall == address(0)) revert InvalidAddress();

        aetherion       = IAetherion(_aetherion);
        aetherionVault  = _vault;
        treasuryVenus   = _treasury;
        buybackAddress  = _buyback;
        dwallToken      = IERC20(_dwall);
        livingGems      = IERC721(_livingGems); // opcional, puede ser address(0) al inicio
    }

    // ============ MAIN INTERACTION FUNCTIONS ============

    /**
     * @notice Pay in BNB to consult Aetherion
     */
    function consultInBnb(InteractionType itype) external payable nonReentrant {
        uint256 required = getRequiredFee(itype, msg.sender, false);
        if (msg.value < required) revert InsufficientOffering();

        if (msg.value > 0) _distributeBnb(msg.value);
        pendingInteractions += 1;
        totalBnbCollected += msg.value;

        emit InteractionPaid(msg.sender, itype, msg.value, 0, false);
    }

    /**
     * @notice Pay in DWALL to consult Aetherion (with -20% discount)
     * @dev User must approve DWALL beforehand
     */
    function consultInDwall(InteractionType itype, uint256 dwallAmount) external nonReentrant {
        uint256 required = getRequiredFee(itype, msg.sender, true);
        // dwallAmount is the DWALL equivalent (frontend calculates using price feed)
        if (dwallAmount < required) revert InsufficientOffering();

        if (dwallAmount > 0) _distributeDwall(dwallAmount);
        pendingInteractions += 1;
        totalDwallCollected += dwallAmount;

        emit InteractionPaid(msg.sender, itype, 0, dwallAmount, true);
    }

    // ============ FEE CALCULATION ============

    function getBaseFee(InteractionType itype) public pure returns (uint256) {
        if (itype == InteractionType.SIMPLE)     return FEE_SIMPLE;
        if (itype == InteractionType.PROPHECY)   return FEE_PROPHECY;
        if (itype == InteractionType.REVELATION) return FEE_REVELATION;
        if (itype == InteractionType.BLESSING)   return FEE_BLESSING;
        return FEE_RITUAL;
    }

    /**
     * @notice Calculates actual fee for a user considering discounts
     * @param itype Interaction type
     * @param user Address that will pay
     * @param paidInDwall true if paying in DWALL (extra -20%)
     */
    function getRequiredFee(InteractionType itype, address user, bool paidInDwall)
        public view returns (uint256)
    {
        // Living Gem holder = FREE (unlimited)
        if (address(livingGems) != address(0) && livingGems.balanceOf(user) > 0) {
            return 0;
        }

        uint256 base = getBaseFee(itype);
        uint16 discount = _getDiscount(user);
        if (paidInDwall) {
            discount += DWALL_PAYMENT_DISCOUNT; // stackable
            if (discount > 8000) discount = 8000; // cap -80%
        }
        return base - (base * discount) / BASIS;
    }

    /**
     * @notice Discount based on DWALL holdings
     */
    function _getDiscount(address user) internal view returns (uint16) {
        uint256 bal = dwallToken.balanceOf(user);
        if (bal >= 1_000_000 ether) return 7500; // -75%
        if (bal >= 200_000 ether)   return 5000; // -50%
        if (bal >= 50_000 ether)    return 2500; // -25%
        if (bal >= 10_000 ether)    return 1000; // -10%
        return 0;
    }

    // ============ DISTRIBUTION ============

    function _distributeBnb(uint256 amount) internal {
        if (amount == 0) revert ZeroValue();

        uint256 toVault    = (amount * PCT_VAULT) / BASIS;
        uint256 toTreasury = (amount * PCT_TREASURY) / BASIS;
        uint256 toBuyback  = amount - toVault - toTreasury;

        (bool a,) = aetherionVault.call{value: toVault}("");
        (bool b,) = treasuryVenus.call{value: toTreasury}("");
        (bool c,) = buybackAddress.call{value: toBuyback}("");
        if (!a || !b || !c) revert TransferFailed();

        emit Distributed(toVault, toTreasury, toBuyback);
    }

    function _distributeDwall(uint256 amount) internal {
        uint256 toVault    = (amount * PCT_VAULT) / BASIS;
        uint256 toTreasury = (amount * PCT_TREASURY) / BASIS;
        uint256 toBurn     = amount - toVault - toTreasury;

        bool a = dwallToken.transferFrom(msg.sender, aetherionVault, toVault);
        bool b = dwallToken.transferFrom(msg.sender, treasuryVenus, toTreasury);
        // Burn = send to 0xdead
        bool c = dwallToken.transferFrom(msg.sender, address(0xdEaD), toBurn);
        if (!a || !b || !c) revert TransferFailed();

        emit Distributed(toVault, toTreasury, toBurn);
    }

    // ============ AETHERION SYNC ============

    /**
     * @notice Syncs pending interactions to Aetherion NFT state
     * @dev Anyone can call — encourages sync when needed
     */
    function syncAetherion(uint256 currentTvl, uint256 currentYield) external {
        uint32 pending = pendingInteractions;
        pendingInteractions = 0;
        aetherion.updateState(currentTvl, currentYield, pending);
        emit AetherionSynced(currentTvl, currentYield, pending);
    }

    /**
     * @notice Oracle owner emits prophecy through Aetherion NFT
     */
    function emitProphecy(string calldata prophecy) external onlyOwner {
        aetherion.revealProphecy(prophecy);
    }

    // ============ EMERGENCY ============
    receive() external payable {}
}
