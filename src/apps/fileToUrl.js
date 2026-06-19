import { karin } from 'node-karin'
import { fileURLToPath } from 'url'
import fs from 'fs'

/**
 * 全局 fileToUrl 处理器
 *
 * 背景：QQBot 适配器 v2 发图一律走 markdown 通道，base64/本地图必须先转成
 * 「带域名的 https 公网 URL」QQ 才肯渲染。node-karin 通过 handler('fileToUrl') 暴露这个转换点，
 * 但默认没有实现。这里接入一个阿里云 OSS 预签名图床：
 *   1. GET /sign?module=xingye&filename=&mimeType=  → { url(PUT地址), resourceUrl(公开地址), header }
 *   2. PUT 文件字节到 url（Content-Type 置空以匹配签名）
 *   3. 返回 resourceUrl 给适配器
 *
 * 注意：必须 export 才会被框架注册；key 固定为 'fileToUrl'。
 */

const IMG_BED = {
  SIGN_API: 'https://bed-sign.vercel.0013107.xyz/sign',
  ORIGIN: 'https://bed.vercel.0013107.xyz',
  MODULE: '58tc',
  TIMEOUT: 20000
}

/** 解析图片类型与宽高（markdown 图片标签需要尺寸），仅靠魔数，无外部依赖 */
function detectImage(buf) {
  // PNG
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  // GIF
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { ext: 'gif', mime: 'image/gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  // JPEG：扫描 SOF 段取宽高
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue }
      const m = buf[off + 1]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { ext: 'jpg', mime: 'image/jpeg', height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) }
      }
      off += 2 + buf.readUInt16BE(off + 2)
    }
    return { ext: 'jpg', mime: 'image/jpeg', width: 0, height: 0 }
  }
  // WEBP（粗略，取不到尺寸时走兜底）
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp', width: 0, height: 0 }
  }
  return { ext: 'jpg', mime: 'image/jpeg', width: 0, height: 0 }
}

/** 把适配器传来的 file（base64:// / data: / http / 本地路径 / Buffer）统一读成 Buffer */
async function toBuffer(file) {
  if (Buffer.isBuffer(file)) return file
  if (file instanceof Uint8Array) return Buffer.from(file)
  if (typeof file !== 'string') throw new Error('不支持的文件类型')
  if (file.startsWith('base64://')) return Buffer.from(file.slice('base64://'.length), 'base64')
  if (file.startsWith('data:')) return Buffer.from(file.slice(file.indexOf(',') + 1), 'base64')
  if (file.startsWith('http://') || file.startsWith('https://')) {
    const res = await fetch(file)
    return Buffer.from(await res.arrayBuffer())
  }
  const p = file.startsWith('file://') ? fileURLToPath(file) : file
  return fs.readFileSync(p)
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMG_BED.TIMEOUT)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export const fileToUrlHandler = karin.handler('fileToUrl', async (args) => {
  const { file, type } = args
  const buf = await toBuffer(file)
  const info = detectImage(buf)
  const filename = `${type || 'file'}_${Date.now()}.${info.ext}`

  // 1. 取预签名地址
  const signUrl = `${IMG_BED.SIGN_API}?module=${IMG_BED.MODULE}` +
    `&filename=${encodeURIComponent(filename)}&mimeType=${encodeURIComponent(info.mime)}`
  const signRes = await fetchWithTimeout(signUrl, { headers: { origin: IMG_BED.ORIGIN } })
  if (!signRes.ok) throw new Error(`[fileToUrl] 签名失败: ${signRes.status}`)
  const sign = await signRes.json()
  if (!sign?.url || !sign?.resourceUrl) throw new Error('[fileToUrl] 签名返回缺少 url/resourceUrl')

  // 2. PUT 上传：只带非空头（签名 Content-Type 为空，则不发该头以匹配签名）
  const headers = {}
  for (const [k, v] of Object.entries(sign.header || {})) {
    if (v) headers[k] = v
  }
  const putRes = await fetchWithTimeout(sign.url, { method: sign.module || 'PUT', body: buf, headers })
  if (!putRes.ok) throw new Error(`[fileToUrl] 上传失败: ${putRes.status}`)

  // 3. 返回公开 URL + 尺寸（尺寸取不到时给个兜底，避免 markdown 出现 0px）
  const width = info.width || 1024
  const height = info.height || 1024
  logger.info(`[fileToUrl] 上传成功 ${width}x${height}: ${sign.resourceUrl}`)
  return { url: sign.resourceUrl, width, height }
})
