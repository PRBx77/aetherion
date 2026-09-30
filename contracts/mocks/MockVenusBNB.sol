// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockVenusBNB {
    mapping(address => uint256) private _vBalance;
    mapping(address => uint256) private _underlying;
    uint256 public exchangeRate = 200000000000000000000000000; // 0.2 (arbitrary)
    uint256 public supplyRate = 100000000000; // ~5% APY approx per block

    function mint() external payable returns (uint256) {
        uint256 vAmount = (msg.value * 1e18) / exchangeRate;
        _vBalance[msg.sender] += vAmount;
        _underlying[msg.sender] += msg.value;
        return 0;
    }

    function redeem(uint256 vTokens) external returns (uint256) {
        require(_vBalance[msg.sender] >= vTokens, "insufficient");
        _vBalance[msg.sender] -= vTokens;
        uint256 bnbOut = (vTokens * exchangeRate) / 1e18;
        (bool s,) = msg.sender.call{value: bnbOut}("");
        require(s);
        return 0;
    }

    function balanceOf(address o) external view returns (uint256) {
        return _vBalance[o];
    }

    function balanceOfUnderlying(address o) external view returns (uint256) {
        return _underlying[o];
    }

    function exchangeRateStored() external view returns (uint256) {
        return exchangeRate;
    }

    function supplyRatePerBlock() external view returns (uint256) {
        return supplyRate;
    }

    // Simulate yield by increasing underlying balance
    function simulateYield(address vault, uint256 extra) external {
        _underlying[vault] += extra;
    }

    receive() external payable {}
}
