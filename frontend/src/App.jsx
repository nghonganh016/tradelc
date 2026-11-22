// Khung chính: thẻ ví -> số dư -> trang theo vai trò
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import WalletCard from './components/WalletCard'
import { useRoles } from './hooks/useRoles'
import ImporterPage from './pages/ImporterPage'
import IssuingBankPage from './pages/IssuingBankPage'
import ExporterPage from './pages/ExporterPage'
import LcDetailPage from './pages/LcDetailPage'
import { useRoute } from './hooks/useRoute'
import AdvisingBankPage from './pages/AdvisingBankPage'

// Mỗi vai trò ứng với 1 trang. Các bước sau sẽ thay placeholder bằng trang thật.
const Placeholder = ({ name }) => (
  <section className="card"><h2>{name}</h2><p className="muted">Trang này sẽ được làm ở bước tiếp theo.</p></section>
)
const PAGES = {
  importer: ImporterPage,
  exporter: ExporterPage,
  issuing: IssuingBankPage,
  advising: AdvisingBankPage,
}

export default function App() {
  const { address, isConnected, chainId } = useAccount()
  const { roles, balance, isLoading } = useRoles(address)
  const lcId = useRoute() // khác null khi đang xem chi tiết một L/C (#/lc/<id>)
  const [tab, setTab] = useState(null) // vai trò đang xem (nếu ví có nhiều vai trò)

  // ready = đã kết nối ví và đang ở đúng mạng Sepolia
  const ready = isConnected && chainId === sepolia.id
  const activeKey = roles.find((r) => r.key === tab)?.key || roles[0]?.key
  const Page = activeKey && PAGES[activeKey]

  return (
    <>
      {/* Thanh tiêu đề tên website, nền tối kéo hết chiều ngang (giống Etherscan / Pinata) */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <div>
              <div className="topbar-name">TradeLC</div>
              <div className="topbar-sub">Thư tín dụng trên blockchain</div>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-pill">Ethereum Sepolia</span>
            <span className="topbar-pill">Thanh toán bằng mUSD</span>
          </div>
        </div>
      </div>

      <div className="container">
        <WalletCard roles={roles} rolesLoading={isLoading} balance={balance} />

        {ready && (
          <>
            {!isLoading && roles.length === 0 && (
              <p className="status error">
                Ví này chưa được cấp vai trò nào trong contract LetterOfCredit.
                Hãy nhờ admin gọi <code>grantRole</code> cho địa chỉ của bạn.
              </p>
            )}

            {lcId !== null && <LcDetailPage id={lcId} />}

            {/* Chỉ hiện tab khi ví có từ 2 vai trò trở lên */}
            {lcId === null && roles.length > 1 && (
              <nav className="tabs">
                {roles.map((r) => (
                  <button key={r.key} className={r.key === activeKey ? 'active' : ''} onClick={() => setTab(r.key)}>
                    {r.label}
                  </button>
                ))}
              </nav>
            )}

            {lcId === null && Page && <Page />}
          </>
        )}

        <p className="note">Chỉ dùng cho mạng thử nghiệm Sepolia. Không dùng ví chứa tiền thật.</p>
      </div>
    </>
  )
}
