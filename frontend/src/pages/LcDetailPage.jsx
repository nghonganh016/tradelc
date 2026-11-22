// Trang chi tiết L/C: thông tin + lịch sử trạng thái dựng từ event
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useReadContract } from 'wagmi'
import { lcContract, STATES, ETHERSCAN } from '../config'
import { fetchHistory } from '../history'
import { getDoc } from '../api'
import { formatAmount, formatDate } from '../utils'

const ZERO_HASH = '0x' + '0'.repeat(64)

export default function LcDetailPage({ id }) {
  const client = usePublicClient()

  // Đọc LetterOfCredit.lcs(id) – thông tin hiện tại của L/C
  const { data, isLoading } = useReadContract({ ...lcContract, functionName: 'lcs', args: [BigInt(id)] })
  // Lịch sử: đọc event log (xem history.js)
  const { data: history, isLoading: loadingHistory, error: historyError } = useQuery({
    queryKey: ['history', id], queryFn: () => fetchHistory(client, id), refetchInterval: 15000,
  })
  const hasDoc = data && data[7] !== ZERO_HASH // data[7] = docHash
  const { data: doc } = useQuery({ queryKey: ['doc', id], queryFn: () => getDoc(id), enabled: !!hasDoc, retry: false })

  if (isLoading) return <section className="card"><p className="muted">Đang tải…</p></section>
  const [importer, exporter, issuingBank, advisingBank, amount, expiryDate, state, docHash, termsHash] = data || []
  if (!importer || state === 0) {
    return <section className="card"><a href="#/">← Quay lại</a><h2>L/C #{id}</h2><p className="muted">Không tìm thấy L/C này.</p></section>
  }
  const st = STATES[Number(state)]
  const rows = [
    ['Importer', importer], ['Exporter', exporter], ['Issuing Bank', issuingBank], ['Advising Bank', advisingBank],
    ['Số tiền', formatAmount(amount)], ['Hạn', formatDate(expiryDate)], ['termsHash', termsHash],
    ['docHash', hasDoc ? docHash : '(chưa nộp)'],
  ]

  return (
    <>
      <section className="card">
        <a href="#/">← Quay lại danh sách</a>
        <div className="row" style={{ marginTop: 10 }}>
          <h2 style={{ margin: 0 }}>L/C #{id}</h2>
          <span className={`badge ${st.color}`}>{st.label}</span>
        </div>
        <table><tbody>
          {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td className="mono">{v}</td></tr>)}
          {doc && <tr><th>Chứng từ</th><td><a href={doc.url} target="_blank" rel="noreferrer">{doc.fileName}</a></td></tr>}
        </tbody></table>
      </section>

      <section className="card">
        <h2>Lịch sử trạng thái</h2>
        {loadingHistory && <p className="muted">Đang đọc event từ blockchain…</p>}
        {historyError && <p className="status error">Không đọc được lịch sử: {historyError.message}. Nếu RPC công khai bị giới hạn, hãy đặt VITE_SEPOLIA_RPC.</p>}
        {history && history.length === 0 && <p className="muted">Chưa có event nào.</p>}
        {history && history.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Thời gian</th><th>Sự kiện</th><th>Chi tiết</th><th>Giao dịch</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.key}>
                  <td>{new Date(h.time * 1000).toLocaleString('vi-VN')}</td>
                  <td><b>{h.title}</b></td>
                  <td className="mono">{h.detail}</td>
                  <td><a href={`${ETHERSCAN}/tx/${h.txHash}`} target="_blank" rel="noreferrer">{h.txHash.slice(0, 10)}…</a></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  )
}
