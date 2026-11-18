// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentIdGuestbook.sol";
import "../src/MockAgentIdRegistry.sol";

contract AgentIdGuestbookTest is Test {
    MockAgentIdRegistry registry;
    AgentIdGuestbook guestbook;

    address holder = makeAddr("holder");
    address stranger = makeAddr("stranger");

    event MessagePosted(address indexed author, uint256 indexed index, string text, uint256 timestamp);

    function setUp() public {
        registry = new MockAgentIdRegistry();
        guestbook = new AgentIdGuestbook(address(registry));
        registry.mint(holder);
    }

    function testHolderCanPost() public {
        vm.prank(holder);
        vm.expectEmit(true, true, false, true);
        emit MessagePosted(holder, 0, "hello agent world", block.timestamp);
        guestbook.postMessage("hello agent world");

        assertEq(guestbook.messageCount(), 1);
        (address author, string memory text, uint256 ts) = guestbook.getMessage(0);
        assertEq(author, holder);
        assertEq(text, "hello agent world");
        assertEq(ts, block.timestamp);
    }

    function testNonHolderCannotPost() public {
        vm.prank(stranger);
        vm.expectRevert("AgentIdGuestbook: caller holds no Agent ID");
        guestbook.postMessage("i should not get in");
        assertEq(guestbook.messageCount(), 0);
    }

    function testEmptyMessageReverts() public {
        vm.prank(holder);
        vm.expectRevert("AgentIdGuestbook: empty message");
        guestbook.postMessage("");
    }

    function testTooLongMessageReverts() public {
        string memory longText = new string(281);
        // fill with 'a' (new string() is zero bytes; write over it via bytes)
        bytes memory b = bytes(longText);
        for (uint256 i = 0; i < 281; i++) {
            b[i] = bytes1("a");
        }
        vm.prank(holder);
        vm.expectRevert("AgentIdGuestbook: message too long");
        guestbook.postMessage(string(b));
    }

    function testMaxLengthMessagePasses() public {
        bytes memory b = new bytes(280);
        for (uint256 i = 0; i < 280; i++) {
            b[i] = bytes1("a");
        }
        vm.prank(holder);
        guestbook.postMessage(string(b));
        assertEq(guestbook.messageCount(), 1);
    }

    function testPagination() public {
        vm.startPrank(holder);
        guestbook.postMessage("one");
        guestbook.postMessage("two");
        guestbook.postMessage("three");
        vm.stopPrank();

        AgentIdGuestbook.Message[] memory page = guestbook.getMessages(1, 10);
        assertEq(page.length, 2);
        assertEq(page[0].text, "two");
        assertEq(page[1].text, "three");

        AgentIdGuestbook.Message[] memory empty = guestbook.getMessages(5, 10);
        assertEq(empty.length, 0);

        AgentIdGuestbook.Message[] memory zero = guestbook.getMessages(0, 0);
        assertEq(zero.length, 0);
    }

    function testZeroRegistryReverts() public {
        vm.expectRevert("AgentIdGuestbook: zero registry");
        new AgentIdGuestbook(address(0));
    }

    function testRegistryIsImmutableAndCorrect() public view {
        assertEq(address(guestbook.agentId()), address(registry));
        assertEq(guestbook.MAX_MESSAGE_LENGTH(), 280);
    }
}
