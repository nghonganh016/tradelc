// Gọi backend (Express) để upload / lấy thông tin chứng từ
import { BACKEND_URL } from './config'

// Upload file + lcId + docHash lên backend. Backend đẩy lên IPFS (Pinata) và trả về cid, url.
export async function uploadDoc(file, lcId, docHash) {
  const form = new FormData()
  form.append('file', file)
  form.append('lcId', String(lcId))
  form.append('docHash', docHash)
  let res
  try {
    res = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: form })
  } catch {
    throw new Error(`Không kết nối được backend (${BACKEND_URL}). Backend đã chạy chưa?`)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Backend lỗi ${res.status}`)
  return data // { docHash, cid, fileName, url, ... }
}

// Lấy chứng từ mới nhất của một L/C (dùng ở bước sau). Trả về null nếu chưa có.
export async function getDoc(lcId) {
  const res = await fetch(`${BACKEND_URL}/docs/${lcId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Backend lỗi ${res.status}`)
  return res.json()
}
