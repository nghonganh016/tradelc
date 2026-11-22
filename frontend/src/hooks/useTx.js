// Hook gửi giao dịch ghi: mô phỏng -> ký -> chờ xác nhận, và báo trạng thái ra giao diện
import { useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { translateError } from '../utils'

export function useTx() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  // tx.state: idle | pending | success | error
  const [tx, setTx] = useState({ state: 'idle' })

  // req = { address, abi, functionName, args }; label = tên hành động để hiện thông báo
  async function run(label, req) {
    let hash
    setTx({ state: 'pending', label, text: 'Đang chờ bạn xác nhận trong MetaMask…' })
    try {
      // Mô phỏng trước: nếu contract sẽ revert thì lỗi được ném ra ngay, kèm lý do, chưa tốn gas
      await publicClient.simulateContract({ ...req, account: address })
      hash = await writeContractAsync(req) // MetaMask hiện cửa sổ ký
      setTx({ state: 'pending', label, hash, text: 'Đang chờ giao dịch được xác nhận trên Sepolia…' })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Giao dịch bị revert trên chuỗi')
      setTx({ state: 'success', label, hash })
      queryClient.invalidateQueries() // đọc lại mọi dữ liệu (L/C, số dư, allowance)
      return true
    } catch (err) {
      setTx({ state: 'error', label, hash, text: translateError(err) })
      return false
    }
  }

  return { tx, run, busy: tx.state === 'pending' }
}
