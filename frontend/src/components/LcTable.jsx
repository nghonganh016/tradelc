// Bảng L/C dùng chung cho mọi trang.
//  rows: danh sách L/C | parties: cột địa chỉ muốn hiện, vd [['exporter','Exporter']]
//  renderActions(lc): trả về các nút (chỉ hiện đúng vai trò + đúng trạng thái do trang quyết định)
import { STATES } from '../config'
import { formatAmount, formatDate, shortAddr } from '../utils'

export default function LcTable({ rows, parties = [], renderActions, empty = 'Chưa có L/C nào.' }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            {parties.map(([, label]) => <th key={label}>{label}</th>)}
            <th>Số tiền</th><th>Hạn</th><th>Trạng thái</th>
            {renderActions && <th>Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((lc) => (
            <tr key={lc.id}>
              <td><a href={`#/lc/${lc.id}`}>#{lc.id}</a></td>
              {parties.map(([field, label]) => <td key={label} className="mono" title={lc[field]}>{shortAddr(lc[field])}</td>)}
              <td>{formatAmount(lc.amount)}</td>
              <td>{formatDate(lc.expiryDate)}</td>
              <td><span className={`badge ${STATES[lc.state].color}`}>{STATES[lc.state].label}</span></td>
              {renderActions && <td><div className="inline">{renderActions(lc)}</div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
