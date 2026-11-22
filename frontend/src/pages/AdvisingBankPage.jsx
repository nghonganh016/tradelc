// Trang Advising Bank: xem chứng từ, kiểm tra toàn vẹn, Accept / Reject, Release payment
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { keccak256 } from 'viem'
import { lcContract, STATES, S } from '../config'
import { useLcs } from '../hooks/useLcs'
import { useTx } from '../hooks/useTx'
import { getDoc } from '../api'
import { formatAmount, formatDate, shortAddr } from '../utils'
import LcTable from '../components/LcTable'
import TxStatus from '../components/TxStatus'

// Thẻ xử lý một L/C (đang DocsPresented hoặc DocsAccepted)
function LcCard({ lc, run, busy }) {
  const [reason, setReason] = useState('')
  const [check, setCheck] = useState(null) // kết quả kiểm tra: { ok, hash } hoặc { error }
  const [checking, setChecking] = useState(false)

  // Hỏi backend: chứng từ của L/C này (kèm lịch sử các lần nộp)
  const { data: doc, error: docError, isLoading } = useQuery({
    queryKey: ['doc', lc.id], queryFn: () => getDoc(lc.id), retry: false,
  })
  // Lấy đúng bản có hash trùng docHash on-chain; không có thì lấy bản mới nhất và cảnh báo
  const entry = doc?.history?.find((d) => d.docHash.toLowerCase() === lc.docHash.toLowerCase())
  const shown = entry || doc

  // Tính lại keccak256 của dữ liệu file rồi so với docHash on-chain
  const compare = (bytes) => {
    const hash = keccak256(new Uint8Array(bytes))
    setCheck({ ok: hash.toLowerCase() === lc.docHash.toLowerCase(), hash })
  }

  // ---- Kiểm tra toàn vẹn cách 1: tải file từ gateway IPFS rồi băm (chỉ đọc, không gọi contract)
  async function onCheckDownload() {
    setChecking(true); setCheck(null)
    try {
      const res = await fetch(shown.url)
      if (!res.ok) throw new Error(`Gateway trả về ${res.status}`)
      compare(await res.arrayBuffer())
    } catch (err) {
      setCheck({ error: `Không tải được file (${err.message}). Hãy tải file thủ công rồi chọn ở ô bên dưới.` })
    }
    setChecking(false)
  }
  // ---- Cách 2: chọn file đã tải về máy để băm
  async function onCheckLocal(e) {
    const f = e.target.files[0]
    if (f) { setCheck(null); compare(await f.arrayBuffer()) }
  }

  // ---- Hàm 1: chấp nhận chứng từ -> LetterOfCredit.acceptDocuments(id)  (DocsPresented -> DocsAccepted)
  const onAccept = () => run(`Chấp nhận chứng từ L/C #${lc.id}`, { ...lcContract, functionName: 'acceptDocuments', args: [BigInt(lc.id)] })
  // ---- Hàm 2: từ chối chứng từ -> LetterOfCredit.rejectDocuments(id, reason)  (DocsPresented -> DocsRejected)
  const onReject = () => run(`Từ chối chứng từ L/C #${lc.id}`, { ...lcContract, functionName: 'rejectDocuments', args: [BigInt(lc.id), reason.trim()] })
  // ---- Hàm 3: giải ngân -> LetterOfCredit.releasePayment(id)  (DocsAccepted -> Paid, chuyển mUSD cho exporter)
  const onRelease = () => run(`Thanh toán L/C #${lc.id}`, { ...lcContract, functionName: 'releasePayment', args: [BigInt(lc.id)] })

  const st = STATES[lc.state]
  return (
    <div className="lc-card">
      <div className="row">
        <strong><a href={`#/lc/${lc.id}`}>L/C #{lc.id}</a> · {formatAmount(lc.amount)}</strong>
        <span className={`badge ${st.color}`}>{st.label}</span>
      </div>
      <div className="muted">
        Importer {shortAddr(lc.importer)} → Exporter {shortAddr(lc.exporter)} · hạn {formatDate(lc.expiryDate)}
      </div>
      <div className="muted">docHash on-chain: {lc.docHash}</div>

      {/* Link tải chứng từ */}
      {isLoading && <p className="muted">Đang lấy thông tin chứng từ…</p>}
      {docError && <p className="status error">Không lấy được chứng từ từ backend: {docError.message}</p>}
      {doc === null && <p className="status error">Backend chưa có chứng từ cho L/C này.</p>}
      {shown && (
        <p>
          📎 <a href={shown.url} target="_blank" rel="noreferrer">{shown.fileName}</a>{' '}
          <span className="muted">(CID {shown.cid})</span>
          {!entry && <span className="error"> ⚠ File backend lưu không khớp hash on-chain, hãy kiểm tra kỹ.</span>}
        </p>
      )}

      {/* Kiểm tra toàn vẹn */}
      <div className="inline">
        <button className="sm secondary" disabled={!shown || checking} onClick={onCheckDownload}>
          {checking ? 'Đang kiểm tra…' : 'Kiểm tra toàn vẹn (tải từ IPFS)'}
        </button>
        <label className="file-pick">hoặc chọn file đã tải: <input type="file" onChange={onCheckLocal} /></label>
      </div>
      {check?.error && <p className="status error">{check.error}</p>}
      {check && !check.error && (
        <p className={`status ${check.ok ? 'ok' : 'error'}`}>
          {check.ok ? '✅ Toàn vẹn: hash của file khớp docHash on-chain.' : '❌ KHÔNG khớp: file đã bị thay đổi hoặc là file khác.'}
          <br /><span className="mono">hash file: {check.hash}</span>
        </p>
      )}

      {/* Thao tác: chỉ hiện đúng trạng thái */}
      {lc.state === S.DocsPresented && (
        <>
          <label>Lý do từ chối (bắt buộc nếu Reject, tối đa 500 ký tự)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ví dụ: thiếu vận đơn…" />
          <div className="actions inline">
            <button disabled={busy} onClick={onAccept}>Accept</button>
            <button className="danger" disabled={busy || !reason.trim()} onClick={onReject}>Reject</button>
          </div>
        </>
      )}
      {lc.state === S.DocsAccepted && (
        <div className="actions"><button disabled={busy} onClick={onRelease}>Release payment</button></div>
      )}
    </div>
  )
}

export default function AdvisingBankPage() {
  const { address } = useAccount()
  const { lcs, isLoading } = useLcs()
  const { tx, run, busy } = useTx()

  const mine = lcs.filter((lc) => lc.advisingBank.toLowerCase() === address.toLowerCase())
  const todo = mine.filter((lc) => [S.DocsPresented, S.DocsAccepted].includes(lc.state))

  return (
    <>
      <section className="card">
        <h2>L/C cần xử lý</h2>
        <TxStatus tx={tx} />
        {isLoading ? <p className="muted">Đang tải…</p> : todo.length === 0 ? (
          <p className="muted">Không có L/C nào đang chờ kiểm tra chứng từ hoặc chờ thanh toán.</p>
        ) : todo.map((lc) => <LcCard key={lc.id} lc={lc} run={run} busy={busy} />)}
      </section>

      <section className="card">
        <h2>Tất cả L/C của ngân hàng</h2>
        <LcTable rows={mine} parties={[['importer', 'Importer'], ['exporter', 'Exporter']]} />
      </section>
    </>
  )
}
