// Thẻ ví ở đầu trang (giống Project 04): avatar, địa chỉ + nút Copy, nhãn vai trò & mạng,
// địa chỉ contract, nút Kết nối / Ngắt kết nối, cảnh báo sai mạng.
import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { LC_ADDRESS, ETHERSCAN } from '../config'
import { shortAddr, avatarColor, formatAmount } from '../utils'

export default function WalletCard({ roles, rolesLoading, balance }) {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [copied, setCopied] = useState(false)

  const wrongNetwork = isConnected && chainId !== sepolia.id

  async function onCopy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="card wallet">
      <div className="row">
        <div className="who">
          {isConnected
            ? <span className="avatar" style={{ background: avatarColor(address) }} />
            : <span className="dot" />}
          <div>
            {isConnected ? (
              <div className="addr">
                <strong title={address}>{shortAddr(address)}</strong>
                <button className="copy" onClick={onCopy}>{copied ? 'Đã chép' : 'Copy'}</button>
              </div>
            ) : (
              <strong>Chưa kết nối ví</strong>
            )}
            <div className="chips">
              {/* Nhãn vai trò: đọc từ hasRole (xem hooks/useRoles.js) */}
              {isConnected && !wrongNetwork && !rolesLoading && roles.length === 0 && (
                <span className="chip red">Không có vai trò</span>
              )}
              {isConnected && !wrongNetwork && roles.map((r) => <span key={r.key} className="chip">{r.label}</span>)}
              {isConnected && !wrongNetwork && <span className="chip blue">Mạng: Sepolia</span>}
            </div>
          </div>
        </div>
        {/* Số dư mUSD: đọc từ MockUSD.balanceOf (xem hooks/useRoles.js) */}
        {isConnected && !wrongNetwork && (
          <div className="bal"><span>Số dư</span><strong>{formatAmount(balance)}</strong></div>
        )}
        {isConnected ? (
          <button className="secondary" onClick={() => disconnect()}>Ngắt kết nối</button>
        ) : (
          // connectors[0] là MetaMask (khai báo trong wagmi.js)
          <button disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
            {isPending ? 'Đang mở MetaMask…' : 'Kết nối MetaMask'}
          </button>
        )}
      </div>

      <div className="muted">
        Contract: {LC_ADDRESS}{' '}
        <a href={`${ETHERSCAN}/address/${LC_ADDRESS}`} target="_blank" rel="noreferrer">Xem trên Etherscan</a>
      </div>

      {error && <p className="error">{error.shortMessage || error.message}</p>}

      {wrongNetwork && (
        <div className="error">
          <p>Sai mạng (chainId {chainId}). Ứng dụng chỉ chạy trên Ethereum Sepolia.</p>
          <button disabled={switching} onClick={() => switchChain({ chainId: sepolia.id })}>Chuyển sang Sepolia</button>
        </div>
      )}
    </section>
  )
}
