// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockAgentIdRegistry (TEST-ONLY)
/// @notice A minimal stand-in for the SPACE ID Agent ID registry, used ONLY
///  on BNB Smart Chain Testnet, where the real Agent ID contract
///  (0x60b9262456de011f7d15a54cdd8c48baaa8b022f) is not deployed.
///  It implements just balanceOf(address), the single function the
///  guestbook ever calls. Anyone may mint a mock ID to any address for
///  testing. NEVER use this mock on mainnet: the mainnet deployment must
///  point at the real registry address above.
contract MockAgentIdRegistry {
    mapping(address => uint256) private _balances;

    event MockIdMinted(address indexed to, uint256 balance);

    function mint(address to) external {
        require(to != address(0), "MockAgentIdRegistry: zero address");
        _balances[to] += 1;
        emit MockIdMinted(to, _balances[to]);
    }

    function balanceOf(address owner) external view returns (uint256) {
        return _balances[owner];
    }
}
