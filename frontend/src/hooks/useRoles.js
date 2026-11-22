// Hook đọc vai trò + số dư mUSD của ví đang kết nối
import { useReadContracts } from 'wagmi'
import { lcContract, tokenContract, ROLES } from '../config'

export function useRoles(address) {
  // Gom 5 lời gọi đọc vào 1 lần (multicall): 4 x hasRole + 1 x balanceOf
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      ...ROLES.map((r) => ({ ...lcContract, functionName: 'hasRole', args: [r.hash, address] })),
      { ...tokenContract, functionName: 'balanceOf', args: [address] },
    ],
    query: { enabled: !!address }, // chưa có ví thì không gọi
  })

  // roles = danh sách vai trò mà ví này có, ví dụ [{key:'importer',...}]
  const roles = data ? ROLES.filter((_, i) => data[i]?.result === true) : []
  const balance = data?.[ROLES.length]?.result // kiểu bigint (đơn vị nhỏ nhất, 18 số lẻ)

  return { roles, balance, isLoading, refetch }
}
