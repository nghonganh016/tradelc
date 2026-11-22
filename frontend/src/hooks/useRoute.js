// Định tuyến đơn giản bằng hash trên URL: "#/lc/3" = xem chi tiết L/C số 3, còn lại = trang vai trò
import { useEffect, useState } from 'react'

export function useRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const m = hash.match(/^#\/lc\/(\d+)$/)
  return m ? Number(m[1]) : null // id L/C hoặc null
}
