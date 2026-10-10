// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CampaignPayments} from "../src/CampaignPayments.sol";

/// @notice Deploys CampaignPayments to Monad mainnet. Run only after audit sign-off and explicit approval.
/// @dev See docs/release/DEPLOYMENT.md. Simulate first (no --broadcast), then broadcast with a keystore or
///      hardware wallet. Never pass a raw private key on the command line.
///
///      CAMPAIGN_PAYMENTS_ADMIN=0x<multisig> forge script script/DeployCampaignPayments.s.sol:DeployCampaignPayments \
///        --rpc-url $MONAD_RPC_URL --account <keystore-name> --sender 0x<deployer>          # simulation
///      ... same command ... --broadcast                                                     # real deployment
contract DeployCampaignPayments is Script {
    uint256 internal constant MONAD_MAINNET = 143;

    function run() external returns (CampaignPayments payments) {
        address admin = vm.envAddress("CAMPAIGN_PAYMENTS_ADMIN");
        require(block.chainid == MONAD_MAINNET, "Expected Monad mainnet (chain 143)");
        require(admin != address(0), "CAMPAIGN_PAYMENTS_ADMIN is not set");
        require(admin.code.length > 0 || vm.envOr("ALLOW_EOA_ADMIN", false), "Admin is not a contract: use a multisig or set ALLOW_EOA_ADMIN=true");

        console2.log("chain id:", block.chainid);
        console2.log("deployer:", msg.sender);
        console2.log("admin:   ", admin);

        vm.startBroadcast();
        payments = new CampaignPayments(admin);
        vm.stopBroadcast();

        // Sanity checks on the deployed instance (read-only).
        require(payments.owner() == admin, "owner mismatch");
        require(payments.pendingOwner() == address(0), "unexpected pending owner");
        console2.log("CampaignPayments:", address(payments));
        console2.log("Record the deployment block from broadcast/DeployCampaignPayments.s.sol/143/run-latest.json");
    }
}
