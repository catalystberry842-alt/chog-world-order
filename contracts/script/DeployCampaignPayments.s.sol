// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {CampaignPayments} from "../src/CampaignPayments.sol";

/// @notice Deployment script. NOT run in this phase: no contract has been deployed.
/// @dev Usage (after review and audit):
///      CAMPAIGN_PAYMENTS_ADMIN=0x... forge script script/DeployCampaignPayments.s.sol \
///        --rpc-url $MONAD_RPC_URL --account <keystore-account> --broadcast
///      Use an encrypted keystore or hardware wallet. Never pass raw private keys on the command line.
contract DeployCampaignPayments is Script {
    function run() external returns (CampaignPayments payments) {
        address admin = vm.envAddress("CAMPAIGN_PAYMENTS_ADMIN");
        require(block.chainid == 143, "Expected Monad mainnet (chain 143)");
        vm.startBroadcast();
        payments = new CampaignPayments(admin);
        vm.stopBroadcast();
    }
}
