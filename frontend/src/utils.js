// Các hàm định dạng hiển thị dùng chung
import { formatUnits, BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from './config'

// 0x1234...abcd
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

// Màu avatar suy ra từ địa chỉ ví (mỗi ví một màu cố định)
export const avatarColor = (a) => `hsl(${parseInt(a.slice(2, 8), 16) % 360}, 65%, 60%)`

// bigint (wei của token) -> "1,234.5 mUSD"
export function formatAmount(value) {
  if (value === undefined || value === null) return '…'
  const num = Number(formatUnits(value, TOKEN_DECIMALS))
  return `${num.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${TOKEN_SYMBOL}`
}

// timestamp giây (bigint) -> ngày giờ địa phương
export const formatDate = (ts) => new Date(Number(ts) * 1000).toLocaleString('vi-VN')

// Lý do revert trong contract -> thông báo dễ hiểu
const REVERTS = {
  'Wrong state': 'Sai trạng thái: L/C đang không ở trạng thái cho phép thao tác này.',
  'Not the issuing bank of this LC': 'Bạn không phải ngân hàng phát hành của L/C này.',
  'Not the advising bank of this LC': 'Bạn không phải ngân hàng thông báo của L/C này.',
  'Not the importer of this LC': 'Bạn không phải importer của L/C này.',
  'Not the exporter of this LC': 'Bạn không phải exporter của L/C này.',
  'LC expired': 'L/C đã quá hạn.',
  'Not expire yet': 'L/C chưa đến hạn nên chưa thể gọi hết hạn/hoàn tiền.',
  'Amount must be > 0': 'Số tiền phải lớn hơn 0.',
  'Expiry date must be in the future': 'Hạn L/C phải ở tương lai.',
  'Exporter not registered': 'Địa chỉ exporter chưa được cấp vai trò EXPORTER.',
  'Issuing bank not registered': 'Địa chỉ Issuing Bank chưa được cấp vai trò ISSUINGBANK.',
  'Advising bank not registered': 'Địa chỉ Advising Bank chưa được cấp vai trò ADVISINGBANK.',
  'Empty terms hash': 'Nội dung điều kiện không được để trống.',
  'Importer cannot be exporter': 'Importer và exporter không được là cùng một ví.',
  'Empty hash': 'Hash chứng từ đang trống.',
  'Reason cannot be empty': 'Phải nhập lý do từ chối.',
  'Reason too long': 'Lý do quá dài (tối đa 500 ký tự).',
  ERC20InsufficientBalance: 'Số dư mUSD không đủ.',
  ERC20InsufficientAllowance: 'Chưa approve đủ mUSD cho contract (làm bước 1 trước).',
  AccessControlUnauthorizedAccount: 'Ví của bạn không có vai trò phù hợp để thực hiện thao tác này.',
}

// Đổi lỗi bất kỳ (từ viem/MetaMask) thành câu tiếng Việt
export function translateError(err) {
  if (err?.walk?.((e) => e instanceof UserRejectedRequestError) || err?.code === 4001) {
    return 'Bạn đã từ chối giao dịch trong MetaMask.'
  }
  if (err instanceof BaseError) {
    const rev = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (rev instanceof ContractFunctionRevertedError) {
      const key = rev.reason || rev.data?.errorName
      return REVERTS[key] || `Contract từ chối giao dịch: ${key || 'không rõ lý do'}`
    }
    return err.shortMessage || err.message
  }
  return err?.message || 'Có lỗi không xác định.'
}
