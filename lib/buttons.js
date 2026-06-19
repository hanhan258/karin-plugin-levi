import { segment } from 'node-karin'

/**
 * QQBot 按钮工具
 *
 * 用法：把返回的 keyboard 段丢进 e.reply([..., keyboard])，适配器(@karinjs/adapter-qqbot v2)
 * 会自动合并成一条 markdown + keyboard 发送，无需手写 markdown。
 *
 * ⚠️ QQ 限制：每行最多 5 个按钮、最多 5 行（单条消息共 ≤25 个），超出会自动截断。
 * ⚠️ 若同条消息只有「视频/语音」等富媒体而无文字/图片，keyboard 所在的 markdown 会因空内容报错(50041)，
 *    这种情况请在数组里补一段 segment.text(...) 垫住。
 *
 * 按钮字段（见 node-karin karinToQQBot）：
 *   text  显示文字
 *   cmd   点击后发送的指令文本（普通指令按钮，默认取 text）
 *   link  链接按钮（设置后走跳转，忽略 cmd）
 *   enter 点击即自动发送，默认 true
 *   style 0 灰 / 1 蓝，默认 1
 */

const toButton = (b) => {
  if (typeof b === 'string') return { text: b, data: b, enter: true, style: 1 }
  if (b.link) return { text: b.text, link: b.link, style: b.style ?? 0 }
  return { text: b.text, data: b.cmd ?? b.text, enter: b.enter ?? true, style: b.style ?? 1 }
}

/**
 * 用二维数组构建键盘，每个子数组是一行
 * @param {Array<Array<string|object>>} rows
 */
export function makeKeyboard(rows) {
  const built = rows.slice(0, 5).map(row => row.slice(0, 5).map(toButton))
  return segment.keyboard(built)
}

/**
 * 用一维列表自动按 perRow 排成多行键盘
 * @param {Array<string|object>} items 指令项（字符串则 text=cmd）
 * @param {number} perRow 每行个数，默认 3
 */
export function gridKeyboard(items, perRow = 3) {
  const rows = []
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow))
  return makeKeyboard(rows)
}
