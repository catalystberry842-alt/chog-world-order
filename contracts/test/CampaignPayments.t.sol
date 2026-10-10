// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CampaignPayments} from "../src/CampaignPayments.sol";
import {ClawbackERC20, FalseReturnERC20, FeeOnTransferERC20, HookERC20, MockERC20, NoReturnERC20} from "./mocks/Tokens.sol";
import {ReentrantCreator, ReentrantOwner, RejectingReceiver} from "./mocks/Actors.sol";

contract CampaignPaymentsTest is Test {
    CampaignPayments internal payments;
    MockERC20 internal usdc;

    address internal admin = makeAddr("admin");
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");
    address payable internal creator = payable(makeAddr("creator"));

    bytes32 internal constant SALT = keccak256("campaign:cmv0000001");
    bytes32 internal constant REF = keccak256("chog:deliverable:dlv0001");

    event CampaignRegistered(bytes32 indexed campaignId, address indexed owner, bytes32 salt);
    event CreatorPaid(
        bytes32 indexed campaignId,
        address indexed creator,
        address indexed token,
        uint256 amount,
        address payer,
        bytes32 deliverableRef
    );
    event SupportedTokenUpdated(address indexed token, bool supported);

    function setUp() public {
        payments = new CampaignPayments(admin);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        vm.prank(admin);
        payments.setSupportedToken(address(usdc), true);
        vm.deal(owner, 1_000 ether);
        usdc.mint(owner, 1_000_000e6);
    }

    function _register() internal returns (bytes32 id) {
        vm.prank(owner);
        id = payments.registerCampaign(SALT);
    }

    // ------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------

    function test_register_storesOwnerAndEmits() public {
        bytes32 expected = payments.computeCampaignId(owner, SALT);
        vm.expectEmit(true, true, false, true, address(payments));
        emit CampaignRegistered(expected, owner, SALT);
        bytes32 id = _register();
        assertEq(id, expected);
        assertEq(payments.campaignOwner(id), owner);
    }

    function test_register_idBindsChainContractOwnerAndSalt() public view {
        bytes32 id = payments.computeCampaignId(owner, SALT);
        assertEq(id, keccak256(abi.encode(block.chainid, address(payments), owner, SALT)));
        assertTrue(id != payments.computeCampaignId(stranger, SALT));
        assertTrue(id != payments.computeCampaignId(owner, keccak256("other")));
    }

    function test_register_rejectsDuplicate() public {
        bytes32 id = _register();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.CampaignAlreadyRegistered.selector, id));
        payments.registerCampaign(SALT);
    }

    function test_register_rejectsZeroSalt() public {
        vm.prank(owner);
        vm.expectRevert(CampaignPayments.ZeroSalt.selector);
        payments.registerCampaign(bytes32(0));
    }

    function test_register_cannotBeSquattedByAnotherAccount() public {
        // A stranger using the same salt gets a different ID and cannot take the owner's.
        vm.prank(stranger);
        bytes32 strangerId = payments.registerCampaign(SALT);
        bytes32 ownerId = _register();
        assertTrue(strangerId != ownerId);
        assertEq(payments.campaignOwner(ownerId), owner);
        assertEq(payments.campaignOwner(strangerId), stranger);
    }

    // ------------------------------------------------------------------
    // Native MON payments
    // ------------------------------------------------------------------

    function test_payNative_transfersToCreatorAndEmits() public {
        bytes32 id = _register();
        vm.expectEmit(true, true, true, true, address(payments));
        emit CreatorPaid(id, creator, address(0), 2 ether, owner, REF);
        vm.prank(owner);
        payments.payNative{value: 2 ether}(id, creator, REF);
        assertEq(creator.balance, 2 ether);
        assertEq(address(payments).balance, 0, "contract never holds funds");
    }

    function test_payNative_rejectsNonOwner() public {
        bytes32 id = _register();
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.NotCampaignOwner.selector, id, stranger));
        payments.payNative{value: 1 ether}(id, creator, REF);
    }

    function test_payNative_rejectsUnregisteredCampaign() public {
        bytes32 id = payments.computeCampaignId(owner, SALT);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.CampaignNotRegistered.selector, id));
        payments.payNative{value: 1 ether}(id, creator, REF);
    }

    function test_payNative_rejectsInvalidInputs() public {
        bytes32 id = _register();
        vm.startPrank(owner);
        vm.expectRevert(CampaignPayments.ZeroAddress.selector);
        payments.payNative{value: 1 ether}(id, payable(address(0)), REF);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.InvalidRecipient.selector, address(payments)));
        payments.payNative{value: 1 ether}(id, payable(address(payments)), REF);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.InvalidRecipient.selector, owner));
        payments.payNative{value: 1 ether}(id, payable(owner), REF);
        vm.expectRevert(CampaignPayments.ZeroAmount.selector);
        payments.payNative{value: 0}(id, creator, REF);
        vm.expectRevert(CampaignPayments.ZeroDeliverableRef.selector);
        payments.payNative{value: 1 ether}(id, creator, bytes32(0));
        vm.stopPrank();
        assertEq(owner.balance, 1_000 ether, "failed calls move nothing");
    }

    function test_payNative_revertsWhenCreatorRejectsFunds() public {
        bytes32 id = _register();
        address rejecting = address(new RejectingReceiver());
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(CampaignPayments.NativeTransferFailed.selector, rejecting, 1 ether)
        );
        payments.payNative{value: 1 ether}(id, payable(rejecting), REF);
        assertEq(owner.balance, 1_000 ether);
    }

    function testFuzz_payNative_deliversExactAmount(uint96 amount) public {
        vm.assume(amount > 0);
        bytes32 id = _register();
        vm.deal(owner, amount);
        vm.prank(owner);
        payments.payNative{value: amount}(id, creator, REF);
        assertEq(creator.balance, amount);
        assertEq(address(payments).balance, 0);
    }

    // ------------------------------------------------------------------
    // ERC-20 payments
    // ------------------------------------------------------------------

    function test_payToken_transfersDirectlyAndEmits() public {
        bytes32 id = _register();
        vm.startPrank(owner);
        usdc.approve(address(payments), 400e6);
        vm.expectEmit(true, true, true, true, address(payments));
        emit CreatorPaid(id, creator, address(usdc), 400e6, owner, REF);
        payments.payToken(id, address(usdc), creator, 400e6, REF);
        vm.stopPrank();
        assertEq(usdc.balanceOf(creator), 400e6);
        assertEq(usdc.balanceOf(owner), 1_000_000e6 - 400e6);
        assertEq(usdc.balanceOf(address(payments)), 0, "contract never holds funds");
    }

    function test_payToken_rejectsUnsupportedToken() public {
        bytes32 id = _register();
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.UnsupportedToken.selector, address(other)));
        payments.payToken(id, address(other), creator, 1, REF);
    }

    function test_payToken_rejectsNativeSentinelAsToken() public {
        bytes32 id = _register();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.UnsupportedToken.selector, address(0)));
        payments.payToken(id, address(0), creator, 1, REF);
    }

    function test_payToken_rejectsNonOwnerAndInvalidInputs() public {
        bytes32 id = _register();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.NotCampaignOwner.selector, id, stranger));
        payments.payToken(id, address(usdc), creator, 1e6, REF);

        vm.startPrank(owner);
        vm.expectRevert(CampaignPayments.ZeroAddress.selector);
        payments.payToken(id, address(usdc), address(0), 1e6, REF);
        vm.expectRevert(CampaignPayments.ZeroAmount.selector);
        payments.payToken(id, address(usdc), creator, 0, REF);
        vm.expectRevert(CampaignPayments.ZeroDeliverableRef.selector);
        payments.payToken(id, address(usdc), creator, 1e6, bytes32(0));
        vm.stopPrank();
    }

    function test_payToken_revertsWithoutAllowance() public {
        bytes32 id = _register();
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(payments), 0, 1e6
            )
        );
        payments.payToken(id, address(usdc), creator, 1e6, REF);
    }

    function test_payToken_rejectsNativeValue() public {
        bytes32 id = _register();
        vm.prank(owner);
        (bool ok,) = address(payments).call{value: 1 ether}(
            abi.encodeCall(CampaignPayments.payToken, (id, address(usdc), creator, 1e6, REF))
        );
        assertFalse(ok, "payToken is not payable");
    }

    // ------------------------------------------------------------------
    // Unexpected token behaviour
    // ------------------------------------------------------------------

    function test_payToken_supportsTokensWithoutReturnValue() public {
        NoReturnERC20 usdt = new NoReturnERC20();
        vm.prank(admin);
        payments.setSupportedToken(address(usdt), true);
        usdt.mint(owner, 100);
        bytes32 id = _register();
        vm.startPrank(owner);
        usdt.approve(address(payments), 100);
        payments.payToken(id, address(usdt), creator, 100, REF);
        vm.stopPrank();
        assertEq(usdt.balanceOf(creator), 100);
    }

    function test_payToken_revertsWhenTokenReturnsFalse() public {
        FalseReturnERC20 bad = new FalseReturnERC20();
        vm.prank(admin);
        payments.setSupportedToken(address(bad), true);
        bytes32 id = _register();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(bad)));
        payments.payToken(id, address(bad), creator, 100, REF);
    }

    function test_payToken_rejectsFeeOnTransferTokens() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20();
        vm.prank(admin);
        payments.setSupportedToken(address(fee), true);
        fee.mint(owner, 1_000);
        bytes32 id = _register();
        vm.startPrank(owner);
        fee.approve(address(payments), 1_000);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.TransferAmountMismatch.selector, 1_000, 990));
        payments.payToken(id, address(fee), creator, 1_000, REF);
        vm.stopPrank();
        assertEq(fee.balanceOf(creator), 0, "whole payment reverted");
    }

function test_payToken_rejectsTokenThatLowersCreatorBalance() public {
        ClawbackERC20 claw = new ClawbackERC20();
        vm.prank(admin);
        payments.setSupportedToken(address(claw), true);
        claw.mint(owner, 1_000);
        claw.mint(creator, 5_000);
        bytes32 id = _register();
        vm.startPrank(owner);
        claw.approve(address(payments), 1_000);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.TransferAmountMismatch.selector, 1_000, 0));
        payments.payToken(id, address(claw), creator, 1_000, REF);
        vm.stopPrank();
    }

    function test_payToken_rejectsSelfAndContractAsRecipient() public {
        bytes32 id = _register();
        vm.startPrank(owner);
        usdc.approve(address(payments), 10e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.InvalidRecipient.selector, owner));
        payments.payToken(id, address(usdc), owner, 1e6, REF);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.InvalidRecipient.selector, address(payments)));
        payments.payToken(id, address(usdc), address(payments), 1e6, REF);
        vm.stopPrank();
    }

    function test_payToken_rejectsUnregisteredCampaign() public {
        bytes32 unknown = keccak256("never registered");
        vm.startPrank(owner);
        usdc.approve(address(payments), 1e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.CampaignNotRegistered.selector, unknown));
        payments.payToken(unknown, address(usdc), creator, 1e6, REF);
        vm.stopPrank();
    }

    function test_delistedToken_blocksTokenPaymentsButNotNative() public {
        bytes32 id = _register();
        vm.prank(admin);
        payments.setSupportedToken(address(usdc), false);
        vm.startPrank(owner);
        usdc.approve(address(payments), 1e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.UnsupportedToken.selector, address(usdc)));
        payments.payToken(id, address(usdc), creator, 1e6, REF);
        payments.payNative{value: 1 ether}(id, creator, REF);
        vm.stopPrank();
        assertEq(creator.balance, 1 ether);
    }

    function test_deliverable_canBePaidOnlyOnce() public {
        bytes32 id = _register();
        vm.startPrank(owner);
        payments.payNative{value: 1 ether}(id, creator, REF);
        assertTrue(payments.deliverablePaid(id, REF));
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.DeliverableAlreadyPaid.selector, id, REF));
        payments.payNative{value: 1 ether}(id, creator, REF);
        usdc.approve(address(payments), 1e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.DeliverableAlreadyPaid.selector, id, REF));
        payments.payToken(id, address(usdc), creator, 1e6, REF);
        // Another deliverable of the same campaign is unaffected.
        payments.payNative{value: 1 ether}(id, creator, keccak256("chog:deliverable:dlv0002"));
        vm.stopPrank();
        assertEq(creator.balance, 2 ether);
    }

    function test_deliverable_failedTransferDoesNotMarkPaid() public {
        bytes32 id = _register();
        vm.startPrank(owner);
        vm.expectRevert(); // no allowance
        payments.payToken(id, address(usdc), creator, 1e6, REF);
        assertFalse(payments.deliverablePaid(id, REF));
        payments.payNative{value: 1 ether}(id, creator, REF);
        vm.stopPrank();
    }

    function test_register_idDiffersPerChain() public {
        bytes32 here = payments.computeCampaignId(owner, SALT);
        vm.chainId(10143);
        assertTrue(payments.computeCampaignId(owner, SALT) != here);
    }

    function test_admin_pendingOwnerHasNoPowerUntilAccepted() public {
        vm.prank(admin);
        payments.transferOwnership(stranger);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        payments.setSupportedToken(address(usdc), false);
        assertTrue(payments.isSupportedToken(address(usdc)));
    }

        // ------------------------------------------------------------------
    // Reentrancy
    // ------------------------------------------------------------------

    function test_reentrancy_nativeCallbackIsBlocked() public {
        ReentrantOwner attacker = new ReentrantOwner(payments);
        ReentrantCreator reentrantCreator = new ReentrantCreator(attacker);
        vm.deal(address(attacker), 10 ether);
        attacker.register(SALT);
        attacker.setReenter(true);

        vm.recordLogs();
        attacker.payNative(payable(address(reentrantCreator)), 1 ether);

        assertEq(attacker.reentryAttempts(), 1);
        assertEq(attacker.reentryError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(address(reentrantCreator).balance, 1 ether);
        assertEq(address(0xBEEF).balance, 0, "re-entered payment never happened");
        assertEq(vm.getRecordedLogs().length, 1, "exactly one CreatorPaid event");
    }

    function test_reentrancy_tokenHookIsBlocked() public {
        HookERC20 hook = new HookERC20();
        vm.prank(admin);
        payments.setSupportedToken(address(hook), true);
        ReentrantOwner attacker = new ReentrantOwner(payments);
        vm.deal(address(attacker), 10 ether);
        hook.mint(address(attacker), 1_000);
        attacker.register(SALT);
        attacker.setReenter(true);

        attacker.payToken(address(hook), creator, 1_000);

        assertEq(attacker.reentryAttempts(), 1);
        assertEq(attacker.reentryError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(hook.balanceOf(creator), 1_000);
        assertEq(address(0xBEEF).balance, 0);
    }

    // ------------------------------------------------------------------
    // Token administration and access control
    // ------------------------------------------------------------------

    function test_admin_setsAndRemovesSupportedTokens() public {
        MockERC20 dai = new MockERC20("Dai", "DAI", 18);
        vm.expectEmit(true, false, false, true, address(payments));
        emit SupportedTokenUpdated(address(dai), true);
        vm.prank(admin);
        payments.setSupportedToken(address(dai), true);
        assertTrue(payments.isSupportedToken(address(dai)));

        vm.prank(admin);
        payments.setSupportedToken(address(dai), false);
        assertFalse(payments.isSupportedToken(address(dai)));
    }

    function test_admin_onlyAdminManagesTokens() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        payments.setSupportedToken(address(usdc), false);
    }

    function test_admin_rejectsZeroAddressAndNonContracts() public {
        vm.startPrank(admin);
        vm.expectRevert(CampaignPayments.ZeroAddress.selector);
        payments.setSupportedToken(address(0), true);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.NotAContract.selector, stranger));
        payments.setSupportedToken(stranger, true);
        vm.stopPrank();
    }

    function test_admin_cannotPayFromOthersCampaigns() public {
        bytes32 id = _register();
        vm.deal(admin, 1 ether);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(CampaignPayments.NotCampaignOwner.selector, id, admin));
        payments.payNative{value: 1 ether}(id, creator, REF);
    }

    function test_admin_twoStepTransferAndNoRenounce() public {
        address next = makeAddr("next");
        vm.prank(admin);
        payments.transferOwnership(next);
        assertEq(payments.owner(), admin, "pending until accepted");
        vm.prank(next);
        payments.acceptOwnership();
        assertEq(payments.owner(), next);

        vm.prank(next);
        vm.expectRevert(CampaignPayments.RenounceDisabled.selector);
        payments.renounceOwnership();
    }

    function test_rejectsPlainTransfers() public {
        vm.prank(owner);
        (bool ok,) = address(payments).call{value: 1 ether}("");
        assertFalse(ok);
    }
}
