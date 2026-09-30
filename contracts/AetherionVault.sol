// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Venus vBNB interface (mismo que usa DiamondWall Treasury V5)
 */
interface IVenusBNB {
    function mint() external payable returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function balanceOfUnderlying(address owner) external returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function supplyRatePerBlock() external view returns (uint256);
}

/**
 * @title AetherionVault
 * @notice Sacred self-feeding vault of Aetherion.
 * @dev Receives 50% of every interaction from AetherionOracle.
 *      All BNB auto-deposited into Venus Protocol.
 *      DWALL received is also held sacred (never withdrawn).
 *      No withdrawal function exists — funds are ETERNAL.
 *
 *      "The Aether feeds itself. The yield is its breath."
 */
contract AetherionVault is Ownable2Step, ReentrancyGuard {

    // ============ IMMUTABLE ============
    IVenusBNB public immutable venus;
    IERC20    public immutable dwallToken;
    address   public immutable aetherionOracle;

    // ============ STATE ============
    uint256 public totalBnbReceived;
    uint256 public totalBnbInVenus;
    uint256 public totalDwallReceived;
    uint256 public depositsCount;
    bool    public depositsEnabled;

    // ============ EVENTS ============
    event BnbReceived(address indexed from, uint256 amount);
    event DepositedToVenus(uint256 bnbAmount, uint256 timestamp);
    event DwallReceived(address indexed from, uint256 amount);
    event DepositsToggled(bool enabled);

    // ============ ERRORS ============
    error VenusDepositFailed();
    error InvalidAddress();
    error NotOracle();

    // ============ MODIFIERS ============
    modifier onlyOracleOrOwner() {
        if (msg.sender != aetherionOracle && msg.sender != owner()) revert NotOracle();
        _;
    }

    // ============ CONSTRUCTOR ============
    constructor(address _venus, address _dwallToken, address _oracle) Ownable(msg.sender) {
        if (_venus == address(0) || _dwallToken == address(0) || _oracle == address(0)) {
            revert InvalidAddress();
        }
        venus           = IVenusBNB(_venus);
        dwallToken      = IERC20(_dwallToken);
        aetherionOracle = _oracle;
        depositsEnabled = true;
    }

    // ============ MAIN — Auto-feeding logic ============

    /**
     * @notice Receives BNB from Oracle and auto-deposits to Venus.
     * @dev Called automatically when Oracle distributes 50% BNB share.
     */
    receive() external payable {
        totalBnbReceived += msg.value;
        emit BnbReceived(msg.sender, msg.value);

        // Auto-deposit to Venus if enabled
        if (depositsEnabled && msg.value > 0) {
            _depositToVenus(msg.value);
        }
    }

    /**
     * @notice Manual deposit of idle BNB to Venus (in case receive didn't auto-deposit)
     */
    function depositIdleToVenus() external onlyOracleOrOwner nonReentrant {
        uint256 idle = address(this).balance;
        if (idle == 0) return;
        _depositToVenus(idle);
    }

    /**
     * @dev Internal deposit to Venus Protocol
     */
    function _depositToVenus(uint256 amount) internal {
        uint256 result = venus.mint{value: amount}();
        if (result != 0) revert VenusDepositFailed();
        totalBnbInVenus += amount;
        depositsCount += 1;
        emit DepositedToVenus(amount, block.timestamp);
    }

    /**
     * @notice Receives DWALL tokens (via ERC20 transfer from Oracle).
     * @dev Anyone can call this to notify the vault when DWALL arrives.
     */
    function notifyDwallDeposit(uint256 amount) external {
        totalDwallReceived += amount;
        emit DwallReceived(msg.sender, amount);
    }

    // ============ ADMIN (limited scope) ============

    /**
     * @notice Toggle auto-deposits (owner only, safety mechanism if Venus fails)
     * @dev Doesn't allow withdrawals — only pauses auto-deposit
     */
    function setDepositsEnabled(bool _enabled) external onlyOwner {
        depositsEnabled = _enabled;
        emit DepositsToggled(_enabled);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Current yield accumulated (calculated on-the-fly)
     */
    function currentYield() external returns (uint256) {
        uint256 underlying = venus.balanceOfUnderlying(address(this));
        if (underlying > totalBnbInVenus) {
            return underlying - totalBnbInVenus;
        }
        return 0;
    }

    /**
     * @notice Venus supply rate per block (APY reference)
     */
    function venusSupplyRate() external view returns (uint256) {
        return venus.supplyRatePerBlock();
    }

    /**
     * @notice vBNB balance held by the vault
     */
    function vBnbBalance() external view returns (uint256) {
        return venus.balanceOf(address(this));
    }

    /**
     * @notice Idle BNB in vault (not yet deposited to Venus)
     */
    function idleBnb() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice DWALL balance held by vault (sacred, never moved)
     */
    function dwallBalance() external view returns (uint256) {
        return dwallToken.balanceOf(address(this));
    }

    /**
     * @notice Full stats snapshot
     */
    function getStats() external view returns (
        uint256 totalBnb_,
        uint256 inVenus_,
        uint256 idle_,
        uint256 dwall_,
        uint256 deposits_,
        bool depositsOn_
    ) {
        return (
            totalBnbReceived,
            totalBnbInVenus,
            address(this).balance,
            dwallToken.balanceOf(address(this)),
            depositsCount,
            depositsEnabled
        );
    }

    // ============ NO WITHDRAW FUNCTION ============
    // Funds are SACRED. There is no withdraw. Ever.
    // The Aether does not surrender what it consumes.
}
