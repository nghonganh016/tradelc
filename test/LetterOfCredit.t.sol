// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LetterOfCredit.sol";
import "../src/MockUSD.sol";

contract LetterOfCreditTest is Test {
    LetterOfCredit lc;
    MockUSD usd;

    address admin = makeAddr("admin");
    address importer = makeAddr("importer");
    address exporter = makeAddr("exporter");
    address issuingBank = makeAddr("issuingBank");
    address advisingBank = makeAddr("advisingBank");

    uint256 constant AMOUNT = 1000e18;
    bytes32 docHash = keccak256("docs");
    uint256 constant DURATION = 7 days;

    function setUp() public {
        vm.startPrank(admin);
        usd = new MockUSD();
        lc = new LetterOfCredit(address(usd));
        lc.grantRole(lc.IMPORTER_ROLE(), importer);
        lc.grantRole(lc.EXPORTER_ROLE(), exporter);
        lc.grantRole(lc.ISSUINGBANK_ROLE(), issuingBank);
        lc.grantRole(lc.ADVISINGBANK_ROLE(), advisingBank);
        vm.stopPrank();

        usd.mint(importer, AMOUNT);
    }

    // đọc trạng thái của một L/C (getter lcs() trả về 9 giá trị, ta chỉ lấy state)
    function _state(uint256 id) internal view returns (LetterOfCredit.State s) {
        (,,,,,, s,,) = lc.lcs(id);
    }

    function _request() internal returns (uint256 id) {
        vm.prank(importer);
        id = lc.requestLC(
            exporter,
            issuingBank,
            advisingBank,
            AMOUNT,
            block.timestamp + DURATION,
            keccak256("terms")
        );
    }

    function _requestAndApprove() internal returns (uint256 id) {
        id = _request();
        vm.prank(issuingBank);
        lc.approveLC(id);
    }

    function _toDeposited() internal returns (uint256 id) {
        id = _requestAndApprove();
        vm.startPrank(importer);
        usd.approve(address(lc), AMOUNT);
        lc.depositEscrow(id);
        vm.stopPrank();
    }

    function _toDocsPresented() internal returns (uint256 id) {
        id = _toDeposited();
        vm.prank(exporter);
        lc.presentDocuments(id, docHash);
    }

    function test_HappyPath() public {
        uint256 id = _toDocsPresented();

        vm.startPrank(advisingBank);
        lc.acceptDocuments(id);
        lc.releasePayment(id);
        vm.stopPrank();

        assertEq(usd.balanceOf(exporter), AMOUNT);
        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.Paid));
        assertEq(usd.balanceOf(address(lc)), 0);
    }

    function test_RevertWhen_NonBankApproves() public {
        uint256 id = _request();

        vm.prank(importer);         // người KHÔNG có quyền
        vm.expectRevert();          // mong đợi lệnh kế tiếp thất bại
        lc.approveLC(id);

        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.Requested));
    }

    function test_DocsRejected_KeepsEscrowLocked() public {
        uint256 id = _toDocsPresented();

        vm.startPrank(advisingBank);
        lc.rejectDocuments(id, "Documents not match");
        vm.expectRevert("Wrong state");
        lc.releasePayment(id);
        vm.stopPrank();

        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.DocsRejected));
        assertEq(usd.balanceOf(address(lc)), AMOUNT);
    } 

    function test_ExpireLC_RefundsImporter() public {
        uint256 id = _toDeposited();

        vm.warp(block.timestamp + DURATION);
        vm.prank(importer);
        lc.expireLC(id);

        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.Expired));
        assertEq(usd.balanceOf(importer), AMOUNT);
        assertEq(usd.balanceOf(address(lc)), 0);
    }

    function test_RevertWhen_ExpireBeforeDeadline() public {
        uint256 id = _toDeposited();

        vm.warp(block.timestamp + 6 days);
        vm.prank(importer);
        vm.expectRevert("Not expire yet");
        lc.expireLC(id);

        assertEq(usd.balanceOf(address(lc)), AMOUNT);
    }

    function test_RevertWhen_DepositWithoutAllowance() public {
        uint256 id = _requestAndApprove();

        vm.prank(importer);
        vm.expectRevert();
        lc.depositEscrow(id);

        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.Approved));
        assertEq(usd.balanceOf(importer), AMOUNT);
        assertEq(usd.balanceOf(address(lc)), 0);
    }

    function test_RevertWhen_DepositWithInsufficientBalance() public {
        uint256 id = _requestAndApprove();

        vm.startPrank(importer);
        usd.approve(address(lc), AMOUNT);           // allowance đủ
        usd.transfer(makeAddr("someone"), 1e18);    // số dư còn AMOUNT - 1e18
        vm.expectRevert();
        lc.depositEscrow(id);
        vm.stopPrank();

        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.Approved));
        assertEq(usd.balanceOf(address(lc)), 0);
    }

    function test_RevertWhen_ReleasePaymentTwice() public {
        uint256 id = _toDocsPresented();

        vm.startPrank(advisingBank);
        lc.acceptDocuments(id);
        lc.releasePayment(id);
        vm.expectRevert("Wrong state");
        lc.releasePayment(id);
        vm.stopPrank();

        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.Paid));
        assertEq(usd.balanceOf(exporter), AMOUNT);
    }

    function test_RevertWhen_WrongBankApproves() public {
        uint256 id = _request();
        address otherBank = makeAddr("otherBank");

        vm.startPrank(admin);
        lc.grantRole(lc.ISSUINGBANK_ROLE(), otherBank);        
        vm.stopPrank();

        vm.prank(otherBank);
        vm.expectRevert("Not the issuing bank of this LC");
        lc.approveLC(id);

        assertEq(uint256(_state(id)), uint256(LetterOfCredit.State.Requested));
    }
}