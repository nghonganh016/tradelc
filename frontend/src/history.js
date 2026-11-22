// Dựng lịch sử trạng thái của một L/C từ event on-chain (getLogs lọc theo id)
import { decodeEventLog, formatUnits, pad, toEventSelector, toHex } from 'viem'
import { LC_ADDRESS, DEPLOY_BLOCK, TOKEN_DECIMALS, TOKEN_SYMBOL } from './config'
import lcAbi from './abi/LetterOfCredit.json'


const money = (v) => `${Number(formatUnits(v, TOKEN_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${TOKEN_SYMBOL}`

// Tên hiển thị + chi tiết cho từng event
const DESCRIBE = {
  LCRequested: (a) => ['Importer tạo yêu cầu L/C', `Số tiền ${money(a.amount)}`],
  LCApproved: () => ['Issuing Bank duyệt L/C', ''],
  LCRejected: () => ['Issuing Bank từ chối L/C', ''],
  EscrowDeposited: (a) => ['Importer ký quỹ', money(a.amount)],
  DocsPresented: (a) => ['Exporter nộp chứng từ', `docHash ${a.docHash}`],
  DocsAccepted: () => ['Advising Bank chấp nhận chứng từ', ''],
  DocsRejected: (a) => ['Advising Bank từ chối chứng từ', `Lý do: ${a.reason}`],
  PaymentReleased: (a) => ['Đã thanh toán cho Exporter', money(a.amount)],
  LCCancelled: () => ['Importer hủy L/C', ''],
  LCExpired: (a) => ['L/C hết hạn', a.refundAmount > 0n ? `Hoàn ${money(a.refundAmount)} cho Importer` : 'Không có tiền ký quỹ để hoàn'],
}

// Chỉ lấy 10 event nghiệp vụ (id là tham số indexed đầu tiên). Phải loại RoleGranted/RoleRevoked của
// AccessControl: tham số đầu của chúng là mã vai trò, trùng số 0 với L/C #0 nên sẽ lẫn vào kết quả.
const EVENTS = lcAbi.filter((x) => x.type === 'event' && x.name in DESCRIBE)

// Gọi eth_getLogs. RPC công khai thường giới hạn khoảng block mỗi lần (vd thirdweb: 1000 block).
// Thử đọc một lần cả khoảng DEPLOY_BLOCK -> mới nhất; nếu RPC từ chối vì quá rộng thì
// chia thành các cửa sổ nhỏ theo giới hạn mà RPC báo, mỗi lượt gọi song song 5 cửa sổ.
async function getLogsInRange(client, filter) {
  const ask = (from, to) =>
    client.request({ method: 'eth_getLogs', params: [{ ...filter, fromBlock: toHex(from), toBlock: toHex(to) }] })
  const latest = await client.getBlockNumber()
  try {
    return await ask(DEPLOY_BLOCK, latest)
  } catch (err) {
    const text = `${err.details || ''} ${err.message || ''}`
    if (!/limit|range|exceed|blocks/i.test(text)) throw err // lỗi khác (mất mạng...) thì báo lỗi luôn
    const size = BigInt(text.match(/blocks? (?:is|of|:)\s*(\d+)/i)?.[1] || 1000) // giới hạn RPC báo, mặc định 1000
    const windows = []
    for (let from = DEPLOY_BLOCK; from <= latest; from += size) windows.push([from, from + size - 1n < latest ? from + size - 1n : latest])
    const logs = []
    for (let i = 0; i < windows.length; i += 5) {
      const part = await Promise.all(windows.slice(i, i + 5).map(([f, t]) => ask(f, t)))
      logs.push(...part.flat())
    }
    return logs
  }
}

export async function fetchHistory(client, id) {
  // Bộ lọc topic:
  //   topics[0] = danh sách chữ ký của 10 event (khớp BẤT KỲ event nào)
  //   topics[1] = id của L/C (tham số indexed đầu tiên), đệm đủ 32 byte
  const logs = await getLogsInRange(client, {
    address: LC_ADDRESS,
    topics: [EVENTS.map((e) => toEventSelector(e)), pad(toHex(BigInt(id)), { size: 32 })],
  })

  // Lấy thời gian của từng block (mỗi block chỉ hỏi 1 lần)
  const blocks = [...new Set(logs.map((l) => l.blockNumber))]
  const times = Object.fromEntries(await Promise.all(
    blocks.map(async (bn) => [bn, Number((await client.getBlock({ blockNumber: BigInt(bn) })).timestamp)]),
  ))

  return logs
    .map((log) => {
      const { eventName, args } = decodeEventLog({ abi: lcAbi, data: log.data, topics: log.topics })
      const [title, detail] = DESCRIBE[eventName](args)
      return {
        key: `${log.transactionHash}-${log.logIndex}`, eventName, title, detail,
        txHash: log.transactionHash, time: times[log.blockNumber],
        order: Number(BigInt(log.blockNumber)) * 100000 + Number(BigInt(log.logIndex)),
      }
    })
    .sort((a, b) => a.order - b.order)
}
