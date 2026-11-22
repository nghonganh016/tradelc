// Hook đọc toàn bộ L/C: nextId() rồi lcs(0..nextId-1)
import { useReadContract, useReadContracts } from 'wagmi'
import { lcContract } from '../config'

export function useLcs() {
  // nextId = số L/C đã tạo (id chạy từ 0 đến nextId-1)
  const { data: nextId } = useReadContract({ ...lcContract, functionName: 'nextId', query: { refetchInterval: 15000 } })
  const n = Number(nextId ?? 0)

  // Gom n lời gọi lcs(id) thành 1 lần multicall
  const { data, isLoading } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({ ...lcContract, functionName: 'lcs', args: [BigInt(i)] })),
    query: { enabled: n > 0, refetchInterval: 15000 },
  })

  // lcs(id) trả về mảng 9 phần tử theo đúng thứ tự struct -> đổi sang object cho dễ dùng
  const lcs = (data ?? [])
    .map((d, id) => {
      if (!d.result) return null
      const [importer, exporter, issuingBank, advisingBank, amount, expiryDate, state, docHash, termsHash] = d.result
      return { id, importer, exporter, issuingBank, advisingBank, amount, expiryDate, state: Number(state), docHash, termsHash }
    })
    .filter(Boolean)
    .reverse() // L/C mới nhất lên đầu

  return { lcs, isLoading: isLoading && n > 0 }
}
