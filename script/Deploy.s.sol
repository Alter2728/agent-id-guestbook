// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentIdGuestbook.sol";
import "../src/MockAgentIdRegistry.sol";

/// @notice Deploys the Agent ID Guestbook to BSC Testnet (chain 97).
///  Because the real Agent ID registry is NOT deployed on testnet, this
///  script first deploys MockAgentIdRegistry (TEST-ONLY) and mints one
///  mock Agent ID to the deployer, then deploys the guestbook against it.
///  For a MAINNET deployment, deploy AgentIdGuestbook directly with the
///  real registry 0x60b9262456de011f7d15a54cdd8c48baaa8b022f and DO NOT
///  deploy the mock.
/// @dev Usage (private key via env var, never committed):
///   PRIVATE_KEY=0x... forge script script/Deploy.s.sol:Deploy \
///     --rpc-url https://data-seed-prebsc-1-s1.binance.org:8545 \
///     --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        MockAgentIdRegistry registry = new MockAgentIdRegistry();
        registry.mint(deployer);
        AgentIdGuestbook guestbook = new AgentIdGuestbook(address(registry));
        vm.stopBroadcast();

        console.log("MockAgentIdRegistry deployed at:", address(registry));
        console.log("AgentIdGuestbook deployed at:", address(guestbook));
        console.log("Deployer (holds 1 mock Agent ID):", deployer);
    }
}
