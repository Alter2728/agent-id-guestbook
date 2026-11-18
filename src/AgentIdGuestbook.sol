// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Agent ID Guestbook
/// @notice An on-chain guestbook that only Agent ID holders can write to.
///  Anyone can read. There is no owner, no admin function, no payable
///  function and no way to move anyone's funds: the contract only stores
///  short text messages and emits an event per message.
/// @dev The Agent ID registry address is set once at deploy time:
///  - BNB Chain mainnet: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
///    (SPACE ID Agent ID, ERC-721, non-transferable)
///  - BNB Smart Chain Testnet: the real registry is NOT deployed there,
///    so the testnet deployment uses MockAgentIdRegistry (test-only).
///  Only balanceOf(address) is ever called on the registry. Agent ID is
///  used here purely as an access gate for posting; this contract never
///  looks up anyone's wallet by name.
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

contract AgentIdGuestbook {
    IAgentIdRegistry public immutable agentId;

    /// @notice Maximum message size in bytes (280, like a classic short post).
    uint256 public constant MAX_MESSAGE_LENGTH = 280;

    struct Message {
        address author;
        string text;
        uint256 timestamp;
    }

    Message[] private _messages;

    event MessagePosted(address indexed author, uint256 indexed index, string text, uint256 timestamp);

    constructor(address agentIdRegistry) {
        require(agentIdRegistry != address(0), "AgentIdGuestbook: zero registry");
        agentId = IAgentIdRegistry(agentIdRegistry);
    }

    /// @notice Post a short message. Only addresses holding >= 1 Agent ID may call.
    /// @dev Posting costs gas; there is no fee charged by this contract.
    function postMessage(string calldata text) external {
        require(agentId.balanceOf(msg.sender) > 0, "AgentIdGuestbook: caller holds no Agent ID");
        bytes memory b = bytes(text);
        require(b.length > 0, "AgentIdGuestbook: empty message");
        require(b.length <= MAX_MESSAGE_LENGTH, "AgentIdGuestbook: message too long");
        _messages.push(Message(msg.sender, text, block.timestamp));
        emit MessagePosted(msg.sender, _messages.length - 1, text, block.timestamp);
    }

    /// @notice Total number of messages posted so far.
    function messageCount() external view returns (uint256) {
        return _messages.length;
    }

    /// @notice Read one message by index.
    function getMessage(uint256 index) external view returns (address author, string memory text, uint256 timestamp) {
        Message storage m = _messages[index];
        return (m.author, m.text, m.timestamp);
    }

    /// @notice Read a page of messages, newest-last order (index order).
    /// @dev `count` is capped by the caller; keep pages small (e.g. <= 50).
    function getMessages(uint256 start, uint256 count) external view returns (Message[] memory) {
        uint256 total = _messages.length;
        if (start >= total || count == 0) {
            return new Message[](0);
        }
        uint256 end = start + count;
        if (end > total) {
            end = total;
        }
        Message[] memory page = new Message[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = _messages[i];
        }
        return page;
    }
}
