// Trang Importer: tạo yêu cầu L/C, ký quỹ (2 bước), hủy, hết hạn/hoàn tiền
import { useState } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { isAddress, keccak256, toBytes, parseUnits, zeroAddress } from 'viem'
import { lcContract, tokenContract, LC_ADDRESS, TOKEN_DECIMALS, TOKEN_SYMBOL, S, ROLES } from '../config'
import { useLcs } from '../hooks/useLcs'
import { useTx } from '../hooks/useTx'
import LcTable from '../components/LcTable'
import TxStatus from '../components/TxStatus'

// Văn bản điều kiện mẫu cho nút "Điền mẫu"
const SAMPLE_TERMS =
  'Giao 2 tấn gạo thơm ST25, đóng bao 25 kg, điều kiện CIF Hải Phòng, giao hàng chậm nhất 30/11/2026. ' +
  'Chứng từ yêu cầu: hóa đơn thương mại, phiếu đóng gói, vận đơn đường biển. Thanh toán khi chứng từ phù hợp.'

// 3 ô địa chỉ cần kiểm tra role: [khóa role trong config.js, tên hiển thị, tên trường trong form]
const ROLE_CHECKS = [
  ['exporter', 'Exporter', 'exporter'],
  ['issuing', 'Issuing Bank', 'issuingBank'],
  ['advising', 'Advising Bank', 'advisingBank'],
]
const roleHash = (key) => ROLES.find((r) => r.key === key).hash

// Giờ hiện tại + số phút -> chuỗi cho ô datetime-local (YYYY-MM-DDTHH:mm, giờ ĐỊA PHƯƠNG).
// Không dùng toISOString vì nó trả về giờ UTC nên sẽ lệch múi giờ.
function localInput(addMinutes) {
  const d = new Date(Date.now() + addMinutes * 60000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const EMPTY = { exporter: '', issuingBank: '', advisingBank: '', amount: '', expiry: '', terms: '' }

export default function ImporterPage() {
  const { address } = useAccount()
  const { lcs, isLoading } = useLcs()
  const { tx, run, busy } = useTx()
  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState('')

  // Chỉ lấy L/C của chính importer này
  const mine = lcs.filter((lc) => lc.importer.toLowerCase() === address.toLowerCase())

  // allowance = số mUSD mà ví này đã cho phép contract LetterOfCredit rút (dùng cho bước 1 ký quỹ)
  const { data: allowance = 0n } = useReadContract({
    ...tokenContract, functionName: 'allowance', args: [address, LC_ADDRESS], query: { refetchInterval: 15000 },
  })

  // ---- Kiểm tra role: với mỗi ô địa chỉ hợp lệ, gọi LetterOfCredit.hasRole(role, địa chỉ) (chỉ đọc, không tốn gas)
  const valid = (field) => isAddress(form[field].trim())
  const { data: roleData } = useReadContracts({
    contracts: ROLE_CHECKS.map(([key, , field]) => ({
      ...lcContract, functionName: 'hasRole', args: [roleHash(key), valid(field) ? form[field].trim() : zeroAddress],
    })),
    query: { enabled: ROLE_CHECKS.some(([, , field]) => valid(field)) },
  })
  // true / false / undefined (chưa hợp lệ hoặc đang tải)
  const hasRoleOf = (i) => (valid(ROLE_CHECKS[i][2]) ? roleData?.[i]?.result : undefined)
  // Dòng nhỏ dưới mỗi ô địa chỉ
  const roleHint = (i) => {
    const ok = hasRoleOf(i)
    if (ok === undefined) return null
    const label = ROLE_CHECKS[i][1]
    return (
      <div className="muted" style={{ marginTop: 4, color: ok ? 'var(--green)' : 'var(--red)' }}>
        {ok ? `✓ Có role ${label}` : `✗ Địa chỉ này chưa được cấp role ${label}`}
      </div>
    )
  }
  const missingRoles = ROLE_CHECKS.filter((_, i) => hasRoleOf(i) === false).map(([, label]) => label)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  // termsHash = keccak256 của văn bản điều kiện (chỉ băm trên trình duyệt, văn bản không lên chuỗi)
  const termsHash = form.terms.trim() ? keccak256(toBytes(form.terms.trim())) : ''

  // ---- Hàm 1: tạo yêu cầu L/C -> gọi LetterOfCredit.requestLC(...)
  async function onRequest(e) {
    e.preventDefault()
    setFormError('')
    const { exporter, issuingBank, advisingBank } = form
    if (![exporter, issuingBank, advisingBank].every((a) => isAddress(a.trim()))) {
      return setFormError('Địa chỉ exporter / issuing bank / advising bank không hợp lệ.')
    }
    let amount
    try { amount = parseUnits(form.amount.trim(), TOKEN_DECIMALS) } catch { amount = 0n }
    if (amount <= 0n) return setFormError('Số tiền không hợp lệ.')
    const expiry = Math.floor(new Date(form.expiry).getTime() / 1000) // datetime-local -> timestamp giây
    if (!expiry || expiry * 1000 <= Date.now()) return setFormError('Hạn L/C phải ở tương lai.')
    if (!termsHash) return setFormError('Hãy nhập nội dung điều kiện.')

    const ok = await run('Tạo yêu cầu L/C', {
      ...lcContract, functionName: 'requestLC',
      args: [exporter.trim(), issuingBank.trim(), advisingBank.trim(), amount, BigInt(expiry), termsHash],
    })
    if (ok) setForm(EMPTY)
  }

  // ---- Hàm 2: ký quỹ bước 1 -> gọi MockUSD.approve(LC_ADDRESS, amount)
  const onApprove = (lc) => run(`Approve ${TOKEN_SYMBOL} cho L/C #${lc.id}`, {
    ...tokenContract, functionName: 'approve', args: [LC_ADDRESS, lc.amount],
  })
  // ---- Hàm 3: ký quỹ bước 2 -> gọi LetterOfCredit.depositEscrow(id) (contract kéo mUSD về bằng transferFrom)
  const onDeposit = (lc) => run(`Ký quỹ L/C #${lc.id}`, { ...lcContract, functionName: 'depositEscrow', args: [BigInt(lc.id)] })
  // ---- Hàm 4: hủy L/C (chỉ khi Requested) -> gọi LetterOfCredit.cancelLC(id)
  const onCancel = (lc) => run(`Hủy L/C #${lc.id}`, { ...lcContract, functionName: 'cancelLC', args: [BigInt(lc.id)] })
  // ---- Hàm 5: hết hạn / hoàn tiền -> gọi LetterOfCredit.expireLC(id) (hoàn mUSD nếu đã ký quỹ)
  const onExpire = (lc) => run(`Hết hạn / hoàn tiền L/C #${lc.id}`, { ...lcContract, functionName: 'expireLC', args: [BigInt(lc.id)] })

  // Nút chỉ hiện khi đúng trạng thái
  function renderActions(lc) {
    const expired = Date.now() / 1000 >= Number(lc.expiryDate)
    const approved = allowance >= lc.amount // đã xong bước 1 chưa
    const canExpire = [S.Requested, S.Approved, S.Deposited, S.DocsRejected].includes(lc.state) && expired
    return (
      <>
        {lc.state === S.Approved && !expired && (
          <>
            <button className="sm secondary" disabled={busy || approved} onClick={() => onApprove(lc)}>
              {approved ? '✓ Bước 1: đã approve' : `Bước 1: Approve ${TOKEN_SYMBOL}`}
            </button>
            <button className="sm" disabled={busy || !approved} onClick={() => onDeposit(lc)}>Bước 2: Ký quỹ</button>
          </>
        )}
        {lc.state === S.Requested && <button className="sm danger" disabled={busy} onClick={() => onCancel(lc)}>Hủy</button>}
        {canExpire && <button className="sm secondary" disabled={busy} onClick={() => onExpire(lc)}>Hết hạn / hoàn tiền</button>}
      </>
    )
  }

  return (
    <div className="split">
      <section className="card">
        <h2>Tạo yêu cầu L/C</h2>
        <form onSubmit={onRequest}>
          <label>Exporter (ví nhà xuất khẩu)</label>
          <input value={form.exporter} onChange={set('exporter')} placeholder="0x…" />
          {roleHint(0)}
          <div className="two">
            <div><label>Issuing Bank</label><input value={form.issuingBank} onChange={set('issuingBank')} placeholder="0x…" />{roleHint(1)}</div>
            <div><label>Advising Bank</label><input value={form.advisingBank} onChange={set('advisingBank')} placeholder="0x…" />{roleHint(2)}</div>
          </div>
          <label>Số tiền ({TOKEN_SYMBOL})</label>
          <input value={form.amount} onChange={set('amount')} placeholder="Ví dụ: 1000" inputMode="decimal" />

          {/* Hạn L/C nằm riêng một dòng để đủ chỗ cho 2 nút đặt hạn nhanh */}
          <label>Hạn L/C</label>
          <div className="inline">
            <input type="datetime-local" value={form.expiry} onChange={set('expiry')} style={{ flex: 1, minWidth: 150, width: 'auto' }} />
            {/* Nút đặt hạn nhanh: giờ hiện tại + 8 phút (để thử hết hạn) hoặc + 7 ngày */}
            <button type="button" className="sm secondary" onClick={() => setForm({ ...form, expiry: localInput(8) })}>+8 phút</button>
            <button type="button" className="sm secondary" onClick={() => setForm({ ...form, expiry: localInput(7 * 24 * 60) })}>+7 ngày</button>
          </div>

          <div className="inline" style={{ justifyContent: 'space-between', margin: '8px 0 4px' }}>
            <label style={{ margin: 0 }}>Nội dung điều kiện L/C</label>
            <button type="button" className="sm secondary" onClick={() => setForm({ ...form, terms: SAMPLE_TERMS })}>Điền mẫu</button>
          </div>
          <textarea rows={2} value={form.terms} onChange={set('terms')} placeholder="Ví dụ: Giao 500 tấn gạo, cảng Hải Phòng, chậm nhất 30/12…" />
          {termsHash && <div className="muted">termsHash = {termsHash}</div>}
          {formError && <p className="status error">{formError}</p>}
          {missingRoles.length > 0 && (
            <p className="status error">
              ⚠ Chưa có role: {missingRoles.join(', ')}. Vẫn gửi được, nhưng contract sẽ từ chối giao dịch cho đến khi admin cấp role.
            </p>
          )}
          <button type="submit" disabled={busy}>Gửi yêu cầu</button>
        </form>
      </section>

      <section className="card">
        <h2>L/C của tôi</h2>
        <p className="muted">Ký quỹ gồm 2 giao dịch: (1) approve mUSD cho contract, (2) depositEscrow.</p>
        <TxStatus tx={tx} />
        {isLoading ? <p className="muted">Đang tải…</p> : (
          <LcTable rows={mine} parties={[['exporter', 'Exporter']]} renderActions={renderActions} />
        )}
      </section>
    </div>
  )
}
