# TradeLC – Quản lý thư tín dụng (L/C) bằng smart contract

DApp mô phỏng quy trình thư tín dụng nhập khẩu trên **Ethereum Sepolia**: importer tạo yêu cầu L/C, ngân hàng phát hành duyệt, importer ký quỹ mUSD vào contract (escrow), exporter nộp chứng từ, ngân hàng thông báo kiểm tra chứng từ rồi giải ngân.

## Contract đã deploy (Sepolia, chainId 11155111)

| Contract | Địa chỉ |
|---|---|
| LetterOfCredit | [`0x1dF8Ff832c93891E9D56eAbcec8B5ac2BF0d5B34`](https://sepolia.etherscan.io/address/0x1dF8Ff832c93891E9D56eAbcec8B5ac2BF0d5B34) |
| MockUSD (mUSD, 18 decimals) | [`0x7FfF623b4E8F19eeaEC2c46fdb6d1f60B32030c6`](https://sepolia.etherscan.io/address/0x7FfF623b4E8F19eeaEC2c46fdb6d1f60B32030c6) |

Cả hai đã được xác minh source trên Etherscan. Log deploy: `broadcast/Deploy.s.sol/11155111/run-latest.json`.

## Quy trình L/C

```
Requested ─approve─▶ Approved ─depositEscrow─▶ Deposited ─presentDocuments─▶ DocsPresented
    │ reject/cancel      │                          │ expireLC                  │ accept        │ reject
    ▼                    ▼                          ▼                           ▼               ▼
Rejected/Cancelled    Expired                   Expired (hoàn tiền)       DocsAccepted     DocsRejected ─(nộp lại)─▶ DocsPresented
                                                                              │ releasePayment
                                                                              ▼
                                                                            Paid
```

| Vai trò | Việc làm |
|---|---|
| Importer | `requestLC`, `depositEscrow` (sau khi `approve` mUSD), `cancelLC`, `expireLC` |
| Issuing Bank | `approveLC`, `rejectLC` |
| Exporter | `presentDocuments` (kèm hash `keccak256` của file chứng từ) |
| Advising Bank | `acceptDocuments`, `rejectDocuments`, `releasePayment` |

Chứng từ nằm ngoài chuỗi (IPFS qua Pinata); on-chain chỉ lưu hash `docHash`, nên ngân hàng có thể tải file về, tính lại hash và so sánh để kiểm tra toàn vẹn.

## Cấu trúc thư mục

| Thư mục | Nội dung |
|---|---|
| `src/` | Smart contract `LetterOfCredit.sol`, `MockUSD.sol` (Solidity, Foundry) |
| `test/` | Test bằng Forge |
| `script/` | Script deploy `Deploy.s.sol` |
| `frontend/` | Giao diện React + Vite + wagmi + viem ([hướng dẫn riêng](frontend/README.md)) |
| `backend/` | Express: upload chứng từ lên IPFS (Pinata) |
| `lib/` | Thư viện (git submodule): forge-std, OpenZeppelin |

## Cách chạy

### 1. Clone (có submodule)
```bash
git clone --recurse-submodules https://github.com/nghonganh016/tradelc.git
cd tradelc
```
Nếu lỡ clone thiếu `lib/`: `git submodule update --init --recursive`.

### 2. Contract: build và test
Cần cài [Foundry](https://book.getfoundry.sh/getting-started/installation).
```bash
forge build
forge test
```

### 3. Deploy (tùy chọn, đã có bản deploy sẵn ở trên)
Cần các biến môi trường `IMPORTER`, `EXPORTER`, `ISSUING_BANK`, `ADVISING_BANK` (địa chỉ ví) và RPC Sepolia. Nên dùng keystore của Foundry, không để khóa riêng trong file.
```bash
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --account <tên_keystore> --broadcast
```
Sau khi deploy lại, cập nhật `LC_ADDRESS`, `TOKEN_ADDRESS`, `DEPLOY_BLOCK` trong `frontend/src/config.js`.

### 4. Backend (cổng 4000)
Cần Node.js 18+ và JWT của [Pinata](https://app.pinata.cloud).
```bash
cd backend
npm install
cp .env.example .env    # mở .env và điền PINATA_JWT
npm start
```

### 5. Frontend (cổng 5173)
```bash
cd frontend
npm install
cp .env.example .env    # tùy chọn
npm run dev
```
Mở http://localhost:5173, kết nối MetaMask trên mạng Sepolia. Ví cần được admin cấp vai trò bằng `grantRole`.

Chi tiết biến môi trường và API backend: [frontend/README.md](frontend/README.md).

## Lưu ý bảo mật
Dự án dùng cho mục đích học tập trên testnet. `MockUSD.mint` ai cũng gọi được. Không dùng ví chứa tiền thật. `.env` và keystore không được commit.
