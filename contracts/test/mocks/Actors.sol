// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CampaignPayments} from "../../src/CampaignPayments.sol";
import {MockERC20} from "./Tokens.sol";

/// @dev Test-only contracts. Never deploy.

/// Has no receive or fallback, so native transfers to it fail.
contract RejectingReceiver {}

/// A campaign owner implemented as a contract, used to attempt reentrancy.
contract ReentrantOwner {
    CampaignPayments public immutable payments;
    bytes32 public campaignId;
    address public token;
    bool public reenter;
    bytes4 public reentryError;
    uint256 public reentryAttempts;

    constructor(CampaignPayments payments_) {
        payments = payments_;
    }

    receive() external payable {}

    function register(bytes32 salt) external {
        campaignId = payments.registerCampaign(salt);
    }

    function setReenter(bool value) external {
        reenter = value;
    }

    function payNative(address payable creator, uint256 amount) external {
        payments.payNative{value: amount}(campaignId, creator, keccak256("deliverable"));
    }

    function payToken(address token_, address creator, uint256 amount) external {
        token = token_;
        MockERC20(token_).approve(address(payments), type(uint256).max);
        payments.payToken(campaignId, token_, creator, amount, keccak256("deliverable"));
    }

    /// Called by the creator (native) or the token hook (ERC-20) mid-payment.
    function attack() public {
        if (!reenter) return;
        reentryAttempts++;
        try payments.payNative{value: 1}(campaignId, payable(address(0xBEEF)), keccak256("again")) {
            reentryError = bytes4(0);
        } catch (bytes memory reason) {
            reentryError = bytes4(reason);
        }
    }

    function onTokenTransfer() external {
        attack();
    }
}

/// Creator whose receive() calls back into the paying owner contract.
contract ReentrantCreator {
    ReentrantOwner public immutable owner;

    constructor(ReentrantOwner owner_) {
        owner = owner_;
    }

    receive() external payable {
        owner.attack();
    }
}
