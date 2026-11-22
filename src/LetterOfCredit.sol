// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LetterOfCredit is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant IMPORTER_ROLE = keccak256("IMPORTER_ROLE");
    bytes32 public constant EXPORTER_ROLE = keccak256("EXPORTER_ROLE");
    bytes32 public constant ISSUINGBANK_ROLE = keccak256("ISSUINGBANK_ROLE");
    bytes32 public constant ADVISINGBANK_ROLE = keccak256("ADVISINGBANK_ROLE");

    IERC20 public immutable paymentToken;

    enum State { None, Requested, Approved, Rejected, Deposited, DocsPresented, DocsAccepted, DocsRejected, Paid, Expired, Cancelled }

    struct LC {
        address importer;
        address exporter;
        address issuingBank;
        address advisingBank;
        uint256 amount;
        uint256 expiryDate;
        State state;
        bytes32 docHash;
        bytes32 termsHash;
    }

    mapping(uint256 => LC) public lcs;
    uint256 public nextId;

    event LCRequested(uint256 indexed id, address indexed importer, address indexed exporter, uint256 amount);
    event LCApproved(uint256 indexed id, address indexed issuingBank);
    event LCRejected(uint256 indexed id, address indexed issuingBank);
    event EscrowDeposited(uint256 indexed id, address indexed importer, uint256 amount);
    event DocsPresented(uint256 indexed id, address indexed exporter, bytes32 docHash);
    event DocsAccepted(uint256 indexed id, address indexed advisingBank);
    event DocsRejected(uint256 indexed id, address indexed advisingBank, string reason);
    event PaymentReleased(uint256 indexed id, address indexed exporter, uint256 amount);
    event LCCancelled(uint256 indexed id, address indexed importer);
    event LCExpired(uint256 indexed id, address indexed importer, uint256 refundAmount);

    constructor(address _tokenAddress) {
        require(_tokenAddress != address(0), "Token address is zero");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        paymentToken = IERC20(_tokenAddress);
    }

    function requestLC(
        address exporter, 
        address issuingBank, 
        address advisingBank,
        uint256 amount, 
        uint256 expiryDate, 
        bytes32 termsHash
    ) external onlyRole(IMPORTER_ROLE) returns (uint256 id) {
        require(amount > 0, "Amount must be > 0");
        require(expiryDate > block.timestamp, "Expiry date must be in the future");
        require(hasRole(EXPORTER_ROLE, exporter), "Exporter not registered");
        require(hasRole(ISSUINGBANK_ROLE, issuingBank), "Issuing bank not registered");
        require(hasRole(ADVISINGBANK_ROLE, advisingBank), "Advising bank not registered");
        require(termsHash != bytes32(0), "Empty terms hash");
        require(exporter != msg.sender, "Importer cannot be exporter");

        id = nextId++;

        lcs[id] = LC({
            importer: msg.sender,
            exporter: exporter,
            issuingBank: issuingBank,
            advisingBank: advisingBank,
            amount: amount,
            expiryDate: expiryDate,
            state: State.Requested,
            docHash: bytes32(0),
            termsHash: termsHash
        });

        emit LCRequested(id, msg.sender, exporter, amount);
    }

    function approveLC(uint256 id) external onlyRole(ISSUINGBANK_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.issuingBank, "Not the issuing bank of this LC");
        require(lc.state == State.Requested, "Wrong state");
        require(block.timestamp < lc.expiryDate, "LC expired");
        
        lc.state = State.Approved;
        emit LCApproved(id, msg.sender);
    }

    function rejectLC(uint256 id) external onlyRole(ISSUINGBANK_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.issuingBank, "Not the issuing bank of this LC");
        require(lc.state == State.Requested, "Wrong state");
        require(block.timestamp < lc.expiryDate, "LC expired");

        lc.state = State.Rejected;
        emit LCRejected(id, msg.sender);
    }

    function depositEscrow(uint256 id) external onlyRole(IMPORTER_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.importer, "Not the importer of this LC");
        require(lc.state == State.Approved, "Wrong state");
        require(block.timestamp < lc.expiryDate, "LC expired");

        lc.state = State.Deposited;
        emit EscrowDeposited(id, msg.sender, lc.amount);
        paymentToken.safeTransferFrom(msg.sender, address(this), lc.amount);
    }

    function presentDocuments(uint256 id, bytes32 docHash) external onlyRole(EXPORTER_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.exporter, "Not the exporter of this LC");
        require(lc.state == State.Deposited || lc.state == State.DocsRejected, "Wrong state");
        require(block.timestamp < lc.expiryDate, "LC expired");
        require(docHash != bytes32(0), "Empty hash");

        lc.docHash = docHash;
        lc.state = State.DocsPresented;
        emit DocsPresented(id, msg.sender, docHash);
    }

    function acceptDocuments(uint256 id) external onlyRole(ADVISINGBANK_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.advisingBank, "Not the advising bank of this LC");
        require(lc.state == State.DocsPresented, "Wrong state");

        lc.state = State.DocsAccepted;
        emit DocsAccepted(id, msg.sender);
    }

    function rejectDocuments(uint256 id, string calldata reason) external onlyRole(ADVISINGBANK_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.advisingBank, "Not the advising bank of this LC");
        require(lc.state == State.DocsPresented, "Wrong state");
        require(bytes(reason).length > 0, "Reason cannot be empty");
        require(bytes(reason).length <= 500, "Reason too long");

        lc.state = State.DocsRejected;
        emit DocsRejected(id, msg.sender, reason);
    }

    function releasePayment(uint256 id) external onlyRole(ADVISINGBANK_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.advisingBank, "Not the advising bank of this LC");
        require(lc.state == State.DocsAccepted, "Wrong state");

        lc.state = State.Paid;
        emit PaymentReleased(id, lc.exporter, lc.amount);
        paymentToken.safeTransfer(lc.exporter, lc.amount);
    }

    function cancelLC(uint256 id) external onlyRole(IMPORTER_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.importer, "Not the importer of this LC");
        require(lc.state == State.Requested, "Wrong state");

        lc.state = State.Cancelled;
        emit LCCancelled(id, msg.sender);
    }

    function expireLC(uint256 id) external onlyRole(IMPORTER_ROLE) {
        LC storage lc = lcs[id];
        require(msg.sender == lc.importer, "Not the importer of this LC");
        require(lc.state == State.Requested || lc.state == State.Approved || lc.state == State.Deposited || lc.state == State.DocsRejected, "Wrong state");
        require(block.timestamp >= lc.expiryDate, "Not expire yet");

        uint256 refundAmount = 0;

        if (lc.state == State.Deposited || lc.state == State.DocsRejected) {
            refundAmount = lc.amount;
        }

        lc.state = State.Expired;
        emit LCExpired(id, msg.sender, refundAmount);

        if (refundAmount > 0) {
            paymentToken.safeTransfer(lc.importer, refundAmount);
        }
    }
}
