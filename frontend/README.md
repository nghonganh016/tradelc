# TradeLC – Frontend

Giao diện React + Vite + wagmi + viem cho contract **LetterOfCredit** trên Ethereum Sepolia.

| Contract | Địa chỉ |
|---|---|
| LetterOfCredit | `0x1dF8Ff832c93891E9D56eAbcec8B5ac2BF0d5B34` |
| MockUSD (mUSD, 18 decimals) | `0x7FfF623b4E8F19eeaEC2c46fdb6d1f60B32030c6` |

## Yêu cầu
- Node.js 18 trở lên **cài bên trong WSL** (nếu dự án nằm trong WSL, ví dụ `~/tradelc`).
  Đừng dùng `npm` của Windows cho thư mục WSL: nó báo lỗi `UNC paths are not supported` / `EPERM`.
  Kiểm tra bằng `which node`: phải ra đường dẫn Linux (ví dụ `~/.nvm/...`), không phải `/mnt/c/...`.
  Cài Node trong WSL bằng nvm:
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  source ~/.bashrc
  nvm install 22
  ```
- Trình duyệt có MetaMask, ví đã chuyển sang mạng Sepolia và có ít Sepolia ETH để trả phí gas
- Ví đã được admin cấp vai trò (`grantRole`) trong contract

## Chạy frontend
```bash
cd frontend
npm install
cp .env.example .env   # (tùy chọn) sửa giá trị nếu cần
npm run dev
```
Mở http://localhost:5173.

### Biến môi trường (`frontend/.env`)
| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `VITE_SEPOLIA_RPC` | Không | URL RPC Sepolia riêng (Alchemy/Infura). Bỏ trống = RPC công khai |
| `VITE_BACKEND_URL` | Từ bước 4 | Địa chỉ backend upload chứng từ, mặc định `http://localhost:4000` |

> Mọi biến `VITE_*` đều lộ ra trình duyệt, vì vậy **không** đặt khóa bí mật (như Pinata JWT) ở đây.

## Chạy backend (upload chứng từ lên IPFS)
Cần một tài khoản [Pinata](https://app.pinata.cloud) (miễn phí) và một API Key để lấy **JWT**.
```bash
cd backend
npm install
cp .env.example .env   # rồi mở .env và dán PINATA_JWT
npm start              # chạy ở http://localhost:4000
```
| Biến (`backend/.env`) | Bắt buộc | Ý nghĩa |
|---|---|---|
| `PINATA_JWT` | Có | JWT của Pinata. Chỉ nằm ở server, không đưa ra trình duyệt, không commit |
| `PINATA_GATEWAY` | Không | Gateway tải file, mặc định `https://gateway.pinata.cloud`. Tài khoản mới thường cần gateway riêng dạng `https://<tên>.mypinata.cloud` |
| `FRONTEND_ORIGIN` | Không | Địa chỉ frontend được phép gọi (CORS), mặc định `http://localhost:5173` |
| `PORT` | Không | Cổng backend, mặc định `4000` |

API:
- `POST /upload` (multipart: `file`, `lcId`, `docHash`): kiểm tra `keccak256(file) == docHash`, đẩy lên IPFS, lưu ánh xạ vào `backend/data/docs.json`, trả về `{docHash, cid, fileName, url}`.
- `GET /docs/:lcId`: trả về chứng từ mới nhất của L/C (kèm `history` nếu nộp lại) và link tải.

Chạy **cả hai** (hai terminal): backend ở `backend/` và frontend ở `frontend/`.

## Cấu trúc thư mục
```
src/
  abi/            ABI copy từ ../out (LetterOfCredit.json, MockUSD.json)
  config.js       địa chỉ contract, mã vai trò, nhãn trạng thái
  wagmi.js        cấu hình mạng Sepolia + connector MetaMask
  api.js          gọi backend: upload chứng từ, lấy thông tin chứng từ
  utils.js        định dạng địa chỉ, số tiền, ngày
  hooks/useRoles.js   đọc hasRole x4 + balanceOf của ví
  components/     WalletCard (kết nối ví, địa chỉ, vai trò, mạng)
  hooks/useLcs.js đọc nextId + lcs(id) | hooks/useTx.js gửi giao dịch (mô phỏng, ký, chờ)
  components/     thêm TxStatus (trạng thái giao dịch), LcTable (bảng L/C dùng chung)
  history.js      đọc event on-chain (getLogs lọc theo id) dựng lịch sử L/C
  hooks/useRoute.js  định tuyến bằng hash (#/lc/3)
  pages/          LcDetailPage, ImporterPage, IssuingBankPage, ExporterPage, AdvisingBankPage (các trang vai trò khác thêm ở bước sau)
```

## Cập nhật ABI khi contract đổi
```bash
forge build
python3 -c "import json;[json.dump(json.load(open(f'out/{n}.sol/{n}.json'))['abi'],open(f'frontend/src/abi/{n}.json','w'),indent=1) for n in ['LetterOfCredit','MockUSD']]"
```
(chạy ở thư mục gốc dự án)
