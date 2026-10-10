# CampaignPayments

Minimal Solidity contract that records Chog World Order campaign registrations and direct payments from campaign owners to creators on Monad.

**Status: not deployed.** No contract address exists yet, and no real funds have moved. It has not been audited.

## Payment model

- Campaign management and deliverable review happen off-chain in the app.
- After accepting a deliverable, the campaign owner sends a payment from their own wallet through `payNative` or `payToken`. Funds go directly from the owner to the creator in the same transaction.
- **There is no escrow.** The contract never holds funds. `receive`/`fallback` are not implemented, so plain transfers revert.
- A `CreatorPaid` event proves that a transfer happened. It says nothing about the quality of the off-chain work.

## Interface

```solidity
function computeCampaignId(address owner, bytes32 salt) external view returns (bytes32);
function registerCampaign(bytes32 salt) external returns (bytes32 campaignId);
function payNative(bytes32 campaignId, address payable creator, bytes32 deliverableRef) external payable;
function payToken(bytes32 campaignId, address token, address creator, uint256 amount, bytes32 deliverableRef) external;
function setSupportedToken(address token, bool supported) external;           // admin only
function deliverablePaid(bytes32 campaignId, bytes32 deliverableRef) external view returns (bool);
function campaignOwner(bytes32 campaignId) external view returns (address);
function isSupportedToken(address token) external view returns (bool);
address public constant NATIVE_TOKEN = address(0);
// Ownable2Step: owner(), pendingOwner(), transferOwnership(), acceptOwnership(); renounceOwnership() reverts.
```

### Events

```solidity
event CampaignRegistered(bytes32 indexed campaignId, address indexed owner, bytes32 salt);
event CreatorPaid(
    bytes32 indexed campaignId,
    address indexed creator,
    address indexed token,   // address(0) for native MON
    uint256 amount,
    address payer,
    bytes32 deliverableRef
);
event SupportedTokenUpdated(address indexed token, bool supported);
```

### Custom errors

`ZeroSalt`, `CampaignAlreadyRegistered(bytes32)`, `CampaignNotRegistered(bytes32)`, `NotCampaignOwner(bytes32, address)`, `ZeroAddress`, `InvalidRecipient(address)`, `ZeroAmount`, `ZeroDeliverableRef`, `UnsupportedToken(address)`, `NotAContract(address)`, `DeliverableAlreadyPaid(bytes32, bytes32)`, `NativeTransferFailed(address, uint256)`, `TransferAmountMismatch(uint256, uint256)`, `RenounceDisabled`.

## Security decisions

| Decision | Why |
| --- | --- |
| Campaign ID = `keccak256(chainId, contract, owner, salt)` | IDs are unique and bound to the registrant, so nobody can front-run or squat another owner's campaign ID. Cross-chain and cross-deployment replay produce different IDs. |
| Only the registering owner can pay for a campaign | Payments for a campaign can only come from the wallet that registered it. The admin has no payment power. |
| Native MON always allowed; ERC-20 only if approved by the admin | Unknown tokens cannot be used. `setSupportedToken` rejects the zero address and addresses without code. |
| `SafeERC20.safeTransferFrom` from owner to creator | Handles tokens that return nothing (USDT-style) and reverts on tokens that return `false`. |
| Balance-delta check on ERC-20 payments | Fee-on-transfer and other non-standard tokens that deliver a different amount are rejected (`TransferAmountMismatch`), so the event amount always equals what the creator received. |
| `nonReentrant` on both payment functions | Creator callbacks (native `receive`) and token hooks cannot re-enter. Tested with malicious receivers and hook tokens. |
| Checks-effects-interactions | Payment functions validate everything first, change no state, then make a single external transfer, then emit. |
| Recipient cannot be zero, the contract, or the payer | Prevents burns, stuck funds, and self-payments that would produce misleading events. |
| `Ownable2Step`, `renounceOwnership` disabled | Admin transfer needs acceptance by the new admin; token administration cannot be lost by accident. |
| No upgradeability, no pause, no fees, no escrow | Minimal surface. A new version would be a new deployment with a new address. |

### Known limitations

- Each `(campaignId, deliverableRef)` can be paid once (`DeliverableAlreadyPaid`). The flag is set before the transfer, and a failed transfer reverts it, so a resubmitted or duplicated wallet transaction cannot pay a creator twice.
- The contract does not verify off-chain work, deliverable state, or that `deliverableRef` matches a real deliverable. The app verifies these before showing a payment as confirmed.
- A campaign owner can pay any amount to any address under their campaign. The app compares events against the expected recipient and amount before marking a payment confirmed.
- Tokens that can be paused or blocklisted can still make a payment revert; that is handled as a failed payment.

## Toolchain

| Component | Version |
| --- | --- |
| Solidity compiler | 0.8.28 (`solc-static-linux`, commit 7893614a) |
| EVM version | cancun (runtime bytecode is identical for shanghai, cancun and prague) |
| Foundry (forge) | 1.5.1-stable (b0a9dd9c) |
| OpenZeppelin Contracts | v5.6.1 (5fd1781b), git submodule |
| forge-std | v1.16.2 (bf647bd6), git submodule |

Dependency revisions are pinned in `foundry.lock` and `.gitmodules`.

## Commands

```bash
git submodule update --init --recursive   # fetch pinned dependencies
cd contracts
forge build
forge test -vv
forge fmt --check
```

Run `forge` from the `contracts/` directory. In a network-restricted environment, install `solc` 0.8.28 in `~/.svm/0.8.28/solc-0.8.28` and run with `FOUNDRY_OFFLINE=true`.

## Deployment assumptions (not executed)

- Target: Monad mainnet, chain ID 143. The deploy script refuses other chains.
- `CAMPAIGN_PAYMENTS_ADMIN` should be a multisig. The admin can only approve or remove ERC-20 tokens.
- After deployment, approve each payment token (for example USDC on Monad, from the issuer's official address) with `setSupportedToken`. Native MON needs no approval.
- Deploy with an encrypted keystore or hardware wallet (`--account`), never a raw private key.
- After deployment, set `NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS` and `CAMPAIGN_PAYMENTS_DEPLOY_BLOCK` in the app and verify the source on Monadscan.
- Get an independent audit before mainnet use.
