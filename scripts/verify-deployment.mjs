#!/usr/bin/env node
/**
 * Read-only verification of a CampaignPayments deployment. Sends no
 * transactions and needs no keys. Exits non-zero if any check fails.
 *
 *   npm run contracts:build
 *   MONAD_RPC_URL=https://rpc.monad.xyz \
 *   NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS=0x... \
 *   CAMPAIGN_PAYMENTS_ADMIN=0x... \
 *   CAMPAIGN_PAYMENTS_DEPLOY_BLOCK=... \
 *   DEPLOY_TX_HASH=0x... \            # optional, strongly recommended
 *   NEXT_PUBLIC_USDC_ADDRESS=0x... \  # optional
 *   npm run release:verify-contract
 */
import { readFileSync } from "node:fs";
import { createPublicClient, encodeAbiParameters, getAddress, http, isAddress, keccak256, zeroAddress } from "viem";

const MONAD_MAINNET = 143;
const env = (key) => process.env[key]?.trim() || null;
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const info = (name, detail) => console.log(`INFO  ${name}  (${detail})`);

const rpc = env("MONAD_RPC_URL");
const address = env("NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS");
const admin = env("CAMPAIGN_PAYMENTS_ADMIN");
const deployBlock = env("CAMPAIGN_PAYMENTS_DEPLOY_BLOCK");
const deployTx = env("DEPLOY_TX_HASH");
const usdc = env("NEXT_PUBLIC_USDC_ADDRESS");

if (!rpc || !address || !isAddress(address) || !admin || !isAddress(admin)) {
  console.error("Set MONAD_RPC_URL, NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS and CAMPAIGN_PAYMENTS_ADMIN (see docs/release/DEPLOYMENT.md).");
  process.exit(2);
}

const artifact = JSON.parse(readFileSync(new URL("../contracts/out/CampaignPayments.sol/CampaignPayments.json", import.meta.url), "utf8"));
const abi = artifact.abi;
const client = createPublicClient({ transport: http(rpc), cacheTime: 0 });
const contract = getAddress(address);
const read = (functionName, args = []) => client.readContract({ address: contract, abi, functionName, args });

const chainId = await client.getChainId();
check("RPC is Monad mainnet", chainId === MONAD_MAINNET, `chain ${chainId}`);

const code = (await client.getCode({ address: contract })) ?? "0x";
check("Contract code exists", code !== "0x", `${(code.length - 2) / 2} bytes`);
const expected = artifact.deployedBytecode.object.toLowerCase();
check(
  "Runtime bytecode matches the local build",
  code.toLowerCase() === expected,
  code.toLowerCase() === expected ? `keccak ${keccak256(code)}` : `on-chain keccak ${keccak256(code)} vs local ${keccak256(expected)}; rebuild at the release commit`,
);

const owner = await read("owner");
check("owner() is the expected admin", getAddress(owner) === getAddress(admin), owner);
check("No pending ownership transfer", (await read("pendingOwner")) === zeroAddress);
check("NATIVE_TOKEN() is address(0)", (await read("NATIVE_TOKEN")) === zeroAddress);

const probeOwner = "0x000000000000000000000000000000000000c0de";
const probeSalt = `0x${"11".repeat(32)}`;
const local = keccak256(
  encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "bytes32" }], [BigInt(MONAD_MAINNET), contract, probeOwner, probeSalt]),
);
check("computeCampaignId matches the app's calculation", (await read("computeCampaignId", [probeOwner, probeSalt])) === local);

if (deployTx) {
  const receipt = await client.getTransactionReceipt({ hash: deployTx });
  check("Deployment transaction succeeded", receipt.status === "success");
  check("Deployment transaction created this contract", receipt.contractAddress && getAddress(receipt.contractAddress) === contract, receipt.contractAddress ?? "none");
  if (deployBlock) {
    check("CAMPAIGN_PAYMENTS_DEPLOY_BLOCK equals the deployment block", BigInt(deployBlock) === receipt.blockNumber, `receipt block ${receipt.blockNumber}`);
  }
} else {
  info("Deployment transaction", "DEPLOY_TX_HASH not set; deploy block not cross-checked");
}
if (deployBlock && !deployTx) {
  info("CAMPAIGN_PAYMENTS_DEPLOY_BLOCK", `${deployBlock} (set DEPLOY_TX_HASH to verify it)`);
}

if (usdc && isAddress(usdc)) {
  const tokenCode = (await client.getCode({ address: getAddress(usdc) })) ?? "0x";
  check("USDC address has contract code", tokenCode !== "0x");
  info("isSupportedToken(USDC)", String(await read("isSupportedToken", [getAddress(usdc)])));
} else {
  info("USDC", "NEXT_PUBLIC_USDC_ADDRESS not set; MON-only");
}

const failed = results.filter((ok) => !ok).length;
console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} checks FAILED. Do not configure the application with this address.`);
process.exit(failed === 0 ? 0 : 1);
