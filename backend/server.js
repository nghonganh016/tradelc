// Backend demo: nhận file chứng từ, đẩy lên IPFS qua Pinata, lưu ánh xạ lcId -> {docHash, cid, tên file}
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'node:fs'
import { keccak256 } from 'viem'

const PORT = process.env.PORT || 4000
const PINATA_JWT = process.env.PINATA_JWT // chỉ nằm ở server, không bao giờ gửi ra trình duyệt
const PINATA_API = process.env.PINATA_API_URL || 'https://api.pinata.cloud'
const GATEWAY = (process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud').replace(/\/$/, '')
const DB_FILE = './data/docs.json'

if (!PINATA_JWT) console.warn('⚠️  Thiếu PINATA_JWT trong backend/.env, /upload sẽ báo lỗi.')

// ---- "Cơ sở dữ liệu" là 1 file JSON (đủ cho demo): { "<lcId>": [ {docHash, cid, fileName, uploadedAt}, ... ] }
function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) } catch { return {} }
}
function writeDb(db) {
  fs.mkdirSync('./data', { recursive: true })
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}
const withUrl = (d) => ({ ...d, url: `${GATEWAY}/ipfs/${d.cid}` })

const app = express()
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
// multer giữ file trong RAM, giới hạn 10MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// POST /upload  (multipart: file, lcId, docHash)
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { lcId, docHash } = req.body
    if (!req.file) return res.status(400).json({ error: 'Thiếu file.' })
    if (!/^\d+$/.test(lcId || '')) return res.status(400).json({ error: 'lcId không hợp lệ.' })
    if (!PINATA_JWT) return res.status(500).json({ error: 'Server chưa cấu hình PINATA_JWT.' })

    // Tự tính lại keccak256 của file và so với hash trình duyệt gửi lên, tránh lưu nhầm
    const realHash = keccak256(new Uint8Array(req.file.buffer))
    if (realHash.toLowerCase() !== String(docHash).toLowerCase()) {
      return res.status(400).json({ error: 'docHash không khớp với nội dung file.' })
    }

    // multer đọc tên file theo latin1, đổi lại utf8 để giữ tiếng Việt
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')

    // Đẩy lên Pinata (API pinFileToIPFS)
    const form = new FormData()
    form.append('file', new Blob([req.file.buffer]), fileName)
    form.append('pinataMetadata', JSON.stringify({ name: `LC-${lcId}-${fileName}` }))
    const r = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      body: form,
    })
    if (!r.ok) return res.status(502).json({ error: `Pinata từ chối (${r.status}): ${(await r.text()).slice(0, 200)}` })
    const { IpfsHash: cid } = await r.json()

    // Lưu ánh xạ; nộp lại sau khi bị từ chối thì thêm bản mới, giữ bản cũ
    const db = readDb()
    const entry = { docHash: realHash, cid, fileName, uploadedAt: new Date().toISOString() }
    db[lcId] = [...(db[lcId] || []), entry]
    writeDb(db)

    res.json(withUrl(entry))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Lỗi server: ' + err.message })
  }
})

// GET /docs/:lcId -> chứng từ mới nhất + link tải từ gateway IPFS
app.get('/docs/:lcId', (req, res) => {
  const list = readDb()[req.params.lcId] || []
  if (list.length === 0) return res.status(404).json({ error: 'Chưa có chứng từ cho L/C này.' })
  res.json({ ...withUrl(list[list.length - 1]), history: list.map(withUrl) })
})

// Lỗi của multer (vd file quá lớn)
app.use((err, _req, res, _next) => res.status(400).json({ error: err.message }))

app.listen(PORT, () => console.log(`Backend chạy tại http://localhost:${PORT}`))
