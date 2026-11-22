// Trang Issuing Bank: duyệt hoặc từ chối các L/C đang ở trạng thái Requested
import { useAccount } from 'wagmi'
import { lcContract, S } from '../config'
import { useLcs } from '../hooks/useLcs'
import { useTx } from '../hooks/useTx'
import LcTable from '../components/LcTable'
import TxStatus from '../components/TxStatus'

export default function IssuingBankPage() {
  const { address } = useAccount()
  const { lcs, isLoading } = useLcs()
  const { tx, run, busy } = useTx()

  // Chỉ lấy L/C mà ví này là issuing bank (contract cũng kiểm tra lại điều này)
  const mine = lcs.filter((lc) => lc.issuingBank.toLowerCase() === address.toLowerCase())
  const pending = mine.filter((lc) => lc.state === S.Requested)
  const others = mine.filter((lc) => lc.state !== S.Requested)

  // ---- Hàm 1: duyệt L/C -> gọi LetterOfCredit.approveLC(id)  (Requested -> Approved)
  const onApprove = (lc) => run(`Duyệt L/C #${lc.id}`, { ...lcContract, functionName: 'approveLC', args: [BigInt(lc.id)] })
  // ---- Hàm 2: từ chối L/C -> gọi LetterOfCredit.rejectLC(id)  (Requested -> Rejected)
  const onReject = (lc) => run(`Từ chối L/C #${lc.id}`, { ...lcContract, functionName: 'rejectLC', args: [BigInt(lc.id)] })

  function renderActions(lc) {
    // Contract chặn duyệt/từ chối L/C đã quá hạn nên không hiện nút
    if (Date.now() / 1000 >= Number(lc.expiryDate)) return <span className="muted">Đã quá hạn</span>
    return (
      <>
        <button className="sm" disabled={busy} onClick={() => onApprove(lc)}>Approve</button>
        <button className="sm danger" disabled={busy} onClick={() => onReject(lc)}>Reject</button>
      </>
    )
  }

  const parties = [['importer', 'Importer'], ['exporter', 'Exporter']]

  return (
    <div className="split even">
      <section className="card">
        <h2>L/C chờ duyệt</h2>
        <TxStatus tx={tx} />
        {isLoading ? <p className="muted">Đang tải…</p> : (
          <LcTable rows={pending} parties={parties} renderActions={renderActions} empty="Không có L/C nào đang chờ bạn duyệt." />
        )}
      </section>

      <section className="card">
        <h2>L/C khác của ngân hàng</h2>
        <LcTable rows={others} parties={parties} empty="Chưa có L/C nào." />
      </section>
    </div>
  )
}
