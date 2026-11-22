// Trang Importer: tạo yêu cầu L/C, ký quỹ (2 bước), hủy, hết hạn/hoàn tiền
import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { isAddress, keccak256, toBytes, parseUnits } from 'viem'
import { lcContract, tokenContract, LC_ADDRESS, TOKEN_DECIMALS, TOKEN_SYMBOL, S } from '../config'
import { useLcs } from '../hooks/useLcs'
import { useTx } from '../hooks/useTx'
import LcTable from '../components/LcTable'
import TxStatus from '../components/TxStatus'

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
    <>
      <section className="card">
        <h2>Tạo yêu cầu L/C</h2>
        <form onSubmit={onRequest}>
          <label>Exporter (ví nhà xuất khẩu)</label>
          <input value={form.exporter} onChange={set('exporter')} placeholder="0x…" />
          <div className="two">
            <div><label>Issuing Bank</label><input value={form.issuingBank} onChange={set('issuingBank')} placeholder="0x…" /></div>
            <div><label>Advising Bank</label><input value={form.advisingBank} onChange={set('advisingBank')} placeholder="0x…" /></div>
          </div>
          <div className="two">
            <div><label>Số tiền ({TOKEN_SYMBOL})</label><input value={form.amount} onChange={set('amount')} placeholder="100" inputMode="decimal" /></div>
            <div><label>Hạn L/C</label><input type="datetime-local" value={form.expiry} onChange={set('expiry')} /></div>
          </div>
          <label>Nội dung điều kiện L/C</label>
          <textarea rows={4} value={form.terms} onChange={set('terms')} placeholder="Ví dụ: Giao 500 tấn gạo, cảng Hải Phòng, chậm nhất 30/12…" />
          {termsHash && <div className="muted">termsHash = {termsHash}</div>}
          {formError && <p className="status error">{formError}</p>}
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
    </>
  )
}
