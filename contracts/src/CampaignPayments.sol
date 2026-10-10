// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CampaignPayments
/// @notice Records Chog World Order campaign registrations and direct payments from campaign owners
///         to creators on Monad.
/// @dev Payment model:
///      - Campaign management and deliverable review happen off-chain.
///      - After accepting a deliverable, the campaign owner sends a wallet-approved payment through this
///        contract. Funds move directly from the owner to the creator in the same call; this contract
///        never holds a balance and is not an escrow.
///      - A {CreatorPaid} event proves that a transfer happened. It does not prove anything about the
///        quality of the off-chain work, and this contract makes no such claim.
///
///      Campaign IDs are derived from the registrant's address and a salt (see {computeCampaignId}),
///      so an ID cannot be front-run or squatted by another account.
contract CampaignPayments is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Token address used in {CreatorPaid} for native MON payments.
    address public constant NATIVE_TOKEN = address(0);

    /// @notice Owner of each registered campaign. Zero means "not registered".
    mapping(bytes32 campaignId => address owner) public campaignOwner;

    /// @notice ERC-20 tokens approved by the admin for campaign payments.
    mapping(address token => bool supported) public isSupportedToken;

    /// @notice Whether a deliverable of a campaign has been paid. Each deliverable can be paid once,
    /// so a resubmitted or duplicated transaction cannot pay the creator twice.
    mapping(bytes32 campaignId => mapping(bytes32 deliverableRef => bool paid)) public deliverablePaid;

    /// @notice Emitted once when a campaign is registered.
    /// @param campaignId The derived campaign ID.
    /// @param owner The account that registered the campaign and may pay from it.
    /// @param salt The salt the ID was derived from (the app's reference for the campaign).
    event CampaignRegistered(bytes32 indexed campaignId, address indexed owner, bytes32 salt);

    /// @notice Emitted for every successful payment.
    /// @param campaignId The campaign the payment belongs to.
    /// @param creator The account that received the funds.
    /// @param token The ERC-20 token paid, or {NATIVE_TOKEN} for MON.
    /// @param amount The amount the creator received, in the token's base units.
    /// @param payer The campaign owner who sent the payment.
    /// @param deliverableRef The off-chain reference of the accepted deliverable.
    event CreatorPaid(
        bytes32 indexed campaignId,
        address indexed creator,
        address indexed token,
        uint256 amount,
        address payer,
        bytes32 deliverableRef
    );

    /// @notice Emitted when the admin adds or removes a supported ERC-20 token.
    event SupportedTokenUpdated(address indexed token, bool supported);

    /// @notice The salt is zero.
    error ZeroSalt();
    /// @notice The derived campaign ID is already registered.
    error CampaignAlreadyRegistered(bytes32 campaignId);
    /// @notice The campaign ID is not registered.
    error CampaignNotRegistered(bytes32 campaignId);
    /// @notice The caller is not the campaign's owner.
    error NotCampaignOwner(bytes32 campaignId, address caller);
    /// @notice A required address is zero.
    error ZeroAddress();
    /// @notice The recipient is not allowed (this contract or the paying owner).
    error InvalidRecipient(address recipient);
    /// @notice The amount is zero.
    error ZeroAmount();
    /// @notice The deliverable reference is zero.
    error ZeroDeliverableRef();
    /// @notice The token is not approved for payments.
    error UnsupportedToken(address token);
    /// @notice The address has no contract code, so it cannot be an ERC-20 token.
    error NotAContract(address token);
    /// @notice This deliverable of this campaign has already been paid.
    error DeliverableAlreadyPaid(bytes32 campaignId, bytes32 deliverableRef);
    /// @notice The native transfer to the creator failed.
    error NativeTransferFailed(address creator, uint256 amount);
    /// @notice The creator received a different amount than requested (e.g. a fee-on-transfer token).
    error TransferAmountMismatch(uint256 expected, uint256 received);
    /// @notice Renouncing ownership is disabled so token administration cannot be lost by accident.
    error RenounceDisabled();

    /// @param initialAdmin Account allowed to manage supported tokens. Transfer uses two steps.
    constructor(address initialAdmin) Ownable(initialAdmin) {}

    /// @notice The campaign ID that `owner` gets for `salt` on this chain and contract.
    function computeCampaignId(address owner, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), owner, salt));
    }

    /// @notice Registers a campaign owned by the caller.
    /// @param salt Unique, non-zero reference chosen by the caller (the app uses the campaign's database ID).
    /// @return campaignId The derived campaign ID.
    function registerCampaign(bytes32 salt) external returns (bytes32 campaignId) {
        if (salt == bytes32(0)) revert ZeroSalt();
        campaignId = computeCampaignId(msg.sender, salt);
        if (campaignOwner[campaignId] != address(0)) revert CampaignAlreadyRegistered(campaignId);
        campaignOwner[campaignId] = msg.sender;
        emit CampaignRegistered(campaignId, msg.sender, salt);
    }

    /// @notice Pays a creator in native MON. The full `msg.value` goes to `creator`.
    /// @param campaignId A campaign registered by the caller.
    /// @param creator The recipient. Must not be zero, this contract, or the caller.
    /// @param deliverableRef Non-zero off-chain reference of the accepted deliverable.
    function payNative(bytes32 campaignId, address payable creator, bytes32 deliverableRef)
        external
        payable
        nonReentrant
    {
        _checkAndRecordPayment(campaignId, creator, msg.value, deliverableRef);

        // Checks and the paid flag are done; the only interaction is the transfer.
        (bool ok,) = creator.call{value: msg.value}("");
        if (!ok) revert NativeTransferFailed(creator, msg.value);

        emit CreatorPaid(campaignId, creator, NATIVE_TOKEN, msg.value, msg.sender, deliverableRef);
    }

    /// @notice Pays a creator in a supported ERC-20 token, directly from the caller's balance.
    /// @dev The caller must have approved this contract for at least `amount`. Tokens that charge a
    ///      fee or otherwise deliver a different amount are rejected.
    /// @param campaignId A campaign registered by the caller.
    /// @param token A supported ERC-20 token.
    /// @param creator The recipient. Must not be zero, this contract, or the caller.
    /// @param amount Amount in the token's base units. Must be greater than zero.
    /// @param deliverableRef Non-zero off-chain reference of the accepted deliverable.
    function payToken(
        bytes32 campaignId,
        address token,
        address creator,
        uint256 amount,
        bytes32 deliverableRef
    ) external nonReentrant {
        if (!isSupportedToken[token]) revert UnsupportedToken(token);
        _checkAndRecordPayment(campaignId, creator, amount, deliverableRef);

        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(creator);
        erc20.safeTransferFrom(msg.sender, creator, amount);
        uint256 afterBalance = erc20.balanceOf(creator);
        // A token that lowers the creator's balance during the transfer reports 0 received,
        // instead of underflowing into a generic panic.
        uint256 received = afterBalance > before ? afterBalance - before : 0;
        if (received != amount) revert TransferAmountMismatch(amount, received);

        emit CreatorPaid(campaignId, creator, token, amount, msg.sender, deliverableRef);
    }

    /// @notice Adds or removes a supported ERC-20 token. Admin only.
    function setSupportedToken(address token, bool supported) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (supported && token.code.length == 0) revert NotAContract(token);
        isSupportedToken[token] = supported;
        emit SupportedTokenUpdated(token, supported);
    }

    /// @notice Disabled. Use the two-step {transferOwnership} instead.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    /// @dev Validates a payment and marks the deliverable as paid before any transfer
    /// (checks-effects-interactions). A failed transfer reverts the flag with everything else.
    function _checkAndRecordPayment(bytes32 campaignId, address creator, uint256 amount, bytes32 deliverableRef)
        private
    {
        address owner_ = campaignOwner[campaignId];
        if (owner_ == address(0)) revert CampaignNotRegistered(campaignId);
        if (owner_ != msg.sender) revert NotCampaignOwner(campaignId, msg.sender);
        if (creator == address(0)) revert ZeroAddress();
        if (creator == address(this) || creator == msg.sender) revert InvalidRecipient(creator);
        if (amount == 0) revert ZeroAmount();
        if (deliverableRef == bytes32(0)) revert ZeroDeliverableRef();
        if (deliverablePaid[campaignId][deliverableRef]) revert DeliverableAlreadyPaid(campaignId, deliverableRef);
        deliverablePaid[campaignId][deliverableRef] = true;
    }
}
