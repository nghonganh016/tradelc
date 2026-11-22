// Trang Exporter: chọn file chứng từ -> tính hash -> upload IPFS -> presentDocuments
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { keccak256 } from 'viem'
import { lcContract, S } from '../config'
import { useLcs } from '../hooks/useLcs'
import { useTx } from '../hooks/useTx'
import { uploadDoc } from '../api'
import { formatAmount, formatDate } from '../utils'
import LcTable from '../components/LcTable'
import TxStatus from '../components/TxStatus'

export default function ExporterPage() {
  const { address } = useAccount()
  const { lcs, isLoading } = useLcs()
  const { tx, run, busy } = useTx()

  const [lcId, setLcId] = useState('')
  const [file, setFile] = useState(null)
  const [docHash, setDocHash] = useState('')
  const [up, setUp] = useState({ state: 'idle' }) // trạng thái upload: idle | pending | done | error

  const mine = lcs.filter((lc) => lc.exporter.toLowerCase() === address.toLowerCase())
  // Chỉ nộp được khi đã ký quỹ (Deposited) hoặc bị từ chối (DocsRejected, nộp lại) và chưa quá hạn
  const open = mine.filter(
    (lc) => [S.Deposited, S.DocsRejected].includes(lc.state) && Date.now() / 1000 < Number(lc.expiryDate),
  )
  const selected = open.find((lc) => String(lc.id) === lcId)

  // ---- Chọn file: tính keccak256 của file NGAY TRÊN TRÌNH DUYỆT (file không rời máy ở bước này)
  async function onPickFile(e) {
    const f = e.target.files[0]
    setFile(f || null)
    setUp({ state: 'idle' })
    setDocHash(f ? keccak256(new Uint8Array(await f.arrayBuffer())) : '')
  }

  // ---- Bước 1: upload file lên kho ngoài chuỗi (backend -> IPFS), không gọi contract
  async function onUpload() {
    setUp({ state: 'pending' })
    try {
      setUp({ state: 'done', ...(await uploadDoc(file, lcId, docHash)) })
    } catch (err) {
      setUp({ state: 'error', error: err.message })
    }
  }

  // ---- Bước 2: ghi hash lên chuỗi -> gọi LetterOfCredit.presentDocuments(id, docHash)
  async function onPresent() {
    const ok = await run(`Nộp chứng từ L/C #${lcId}`, {
      ...lcContract, functionName: 'presentDocuments', args: [BigInt(lcId), docHash],
    })
    if (ok) { setFile(null); setDocHash(''); setLcId(''); setUp({ state: 'idle' }) }
  }

  const step1Ready = selected && file && docHash
  return (
    <div className="split">
      <section className="card">
        <h2>Nộp chứng từ</h2>
        <label>Chọn L/C (đã ký quỹ hoặc cần nộp lại)</label>
        <select value={lcId} onChange={(e) => { setLcId(e.target.value); setUp({ state: 'idle' }) }}>
          <option value="">— chọn —</option>
          {open.map((lc) => (
            <option key={lc.id} value={lc.id}>
              #{lc.id} · {formatAmount(lc.amount)} · hạn {formatDate(lc.expiryDate)}{lc.state === S.DocsRejected ? ' · nộp lại' : ''}
            </option>
          ))}
        </select>
        {open.length === 0 && <p className="muted">Chưa có L/C nào cần bạn nộp chứng từ.</p>}

        <label>File chứng từ</label>
        <input type="file" onChange={onPickFile} />
        {docHash && <div className="muted">docHash (keccak256 của file) = {docHash}</div>}

        <div className="actions inline">
          <button className="secondary" disabled={!step1Ready || up.state === 'pending' || up.state === 'done'} onClick={onUpload}>
            {up.state === 'done' ? '✓ Bước 1: đã upload' : up.state === 'pending' ? 'Đang upload…' : 'Bước 1: Upload lên IPFS'}
          </button>
          <button disabled={busy || up.state !== 'done'} onClick={onPresent}>Bước 2: Nộp chứng từ on-chain</button>
        </div>

        {up.state === 'done' && (
          <p className="status ok">
            Đã upload <b>{up.fileName}</b> (CID <span className="mono">{up.cid}</span>).{' '}
            <a href={up.url} target="_blank" rel="noreferrer">Mở file</a>
          </p>
        )}
        {up.state === 'error' && <p className="status error"><span className="ico bad">✕</span>Upload thất bại: {up.error}</p>}
        <TxStatus tx={tx} />
      </section>

      <section className="card">
        <h2>L/C của tôi (với vai trò Exporter)</h2>
        {isLoading ? <p className="muted">Đang tải…</p> : (
          <LcTable rows={mine} parties={[['importer', 'Importer']]} empty="Chưa có L/C nào gửi cho bạn." />
        )}
      </section>
    </div>
  )
}
