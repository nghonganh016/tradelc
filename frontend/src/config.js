// ===== Cấu hình chung của ứng dụng =====
import { keccak256, toBytes } from 'viem'
import lcAbi from './abi/LetterOfCredit.json'
import tokenAbi from './abi/MockUSD.json'

// Địa chỉ contract đã deploy trên Sepolia
export const LC_ADDRESS = '0x1dF8Ff832c93891E9D56eAbcec8B5ac2BF0d5B34'
export const TOKEN_ADDRESS = '0x7FfF623b4E8F19eeaEC2c46fdb6d1f60B32030c6'
// Block deploy contract: đọc log từ đây (không đọc từ block 0, vì RPC công khai giới hạn khoảng block)
export const DEPLOY_BLOCK = 12189410n
export const TOKEN_SYMBOL = 'mUSD'
export const TOKEN_DECIMALS = 18

// Gói sẵn {address, abi} để truyền vào useReadContract / writeContract cho gọn
export const lcContract = { address: LC_ADDRESS, abi: lcAbi }
export const tokenContract = { address: TOKEN_ADDRESS, abi: tokenAbi }

export const ETHERSCAN = 'https://sepolia.etherscan.io'
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

// Mã vai trò trong contract = keccak256("TÊN_VAI_TRÒ") (giống hệt cách Solidity tính hằng số)
export const ROLES = [
  { key: 'importer', label: 'Importer (Nhà nhập khẩu)', hash: keccak256(toBytes('IMPORTER_ROLE')) },
  { key: 'exporter', label: 'Exporter (Nhà xuất khẩu)', hash: keccak256(toBytes('EXPORTER_ROLE')) },
  { key: 'issuing', label: 'Issuing Bank (NH phát hành)', hash: keccak256(toBytes('ISSUINGBANK_ROLE')) },
  { key: 'advising', label: 'Advising Bank (NH thông báo)', hash: keccak256(toBytes('ADVISINGBANK_ROLE')) },
]

// Enum State trong contract -> nhãn tiếng Việt + màu badge
export const STATES = [
  { label: 'None', color: 'gray' },
  { label: 'Đã yêu cầu', color: 'blue' },          // 1 Requested
  { label: 'Đã duyệt', color: 'green' },           // 2 Approved
  { label: 'Bị từ chối', color: 'red' },           // 3 Rejected
  { label: 'Đã ký quỹ', color: 'green' },          // 4 Deposited
  { label: 'Đã nộp chứng từ', color: 'orange' },   // 5 DocsPresented
  { label: 'Chứng từ hợp lệ', color: 'green' },    // 6 DocsAccepted
  { label: 'Chứng từ bị từ chối', color: 'red' },  // 7 DocsRejected
  { label: 'Đã thanh toán', color: 'purple' },     // 8 Paid
  { label: 'Hết hạn', color: 'gray' },             // 9 Expired
  { label: 'Đã hủy', color: 'gray' },              // 10 Cancelled
]

// Tên state dạng số để code dễ đọc, ví dụ S.Requested === 1
export const S = {
  None: 0, Requested: 1, Approved: 2, Rejected: 3, Deposited: 4, DocsPresented: 5,
  DocsAccepted: 6, DocsRejected: 7, Paid: 8, Expired: 9, Cancelled: 10,
}
