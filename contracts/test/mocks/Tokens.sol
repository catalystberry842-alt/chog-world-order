// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only tokens. Never deploy.

/// Standard ERC-20 with open minting.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Takes a 1% fee on every transfer, so the recipient gets less than requested.
contract FeeOnTransferERC20 is MockERC20 {
    constructor() MockERC20("Fee Token", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xFEE), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// USDT-style token: transfer functions return nothing.
contract NoReturnERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// Returns false instead of reverting on failure.
contract FalseReturnERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

interface ITransferHook {
    function onTokenTransfer() external;
}

/// Calls back into the sender during transferFrom, like an ERC-777 hook.
contract HookERC20 is MockERC20 {
    constructor() MockERC20("Hook Token", "HOOK", 18) {}

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (from.code.length > 0) ITransferHook(from).onTokenTransfer();
        return super.transferFrom(from, to, value);
    }
}

/// Hostile token: after delivering, it claws twice the amount back from the recipient,
/// so the recipient's balance goes down during the transfer.
contract ClawbackERC20 is MockERC20 {
    constructor() MockERC20("Clawback", "CLAW", 18) {}

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        super.transferFrom(from, to, value);
        _update(to, address(0xdead), value * 2);
        return true;
    }
}
