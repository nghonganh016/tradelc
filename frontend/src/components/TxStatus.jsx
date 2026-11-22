// Hiện trạng thái giao dịch: đang chờ / thành công / thất bại, kèm link Etherscan
import { ETHERSCAN } from '../config'

export default function TxStatus({ tx }) {
  if (tx.state === 'idle') return null
  const link = tx.hash && (
    <> <a href={`${ETHERSCAN}/tx/${tx.hash}`} target="_blank" rel="noreferrer">Xem trên Etherscan</a></>
  )
  if (tx.state === 'pending') return <p className="status info"><span className="ico wait">…</span>{tx.label}: {tx.text}{link}</p>
  if (tx.state === 'success') return <p className="status ok"><span className="ico ok">✓</span>{tx.label} thành công.{link}</p>
  return <p className="status error"><span className="ico bad">✕</span>{tx.label} thất bại: {tx.text}{link}</p>
}
