// ===== Cấu hình wagmi: mạng Sepolia + ví MetaMask =====
import { createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [sepolia], // chỉ hỗ trợ đúng 1 mạng
  // injected = ví cài trong trình duyệt; target 'metaMask' để ưu tiên MetaMask
  connectors: [injected({ target: 'metaMask' })],
  transports: {
    // RPC dùng để ĐỌC dữ liệu; để trống thì viem dùng RPC công khai của Sepolia
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC || undefined),
  },
})
