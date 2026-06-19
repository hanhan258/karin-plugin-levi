import { karin, segment } from 'node-karin'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'

// 获取插件目录路径
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const join = (...paths) => path.join(...paths).replace(/\\/g, '/')


const API_CONFIG = {
  BASE_URL: 'https://ai.ycxom.top:3002',
  LIST_API: 'https://ai.ycxom.top:3002/api/list',
  // 直连最终随机接口（旧的 /picture /video 是 301 跳转，会丢掉查询参数导致缓存绕不过）
  PICTURE_API: 'https://ai.ycxom.top:3002/api/v1/media/picture/by-dir',
  VIDEO_API: 'https://ai.ycxom.top:3002/api/v1/media/video/by-dir',
  TIMEOUT: 15000
}

// 给媒体URL加唯一参数：接口每次随机返回不同图，但URL相同会被QQ按URL缓存，
// 看起来就"一直同一张"。加随机参数让每次URL唯一，绕过缓存。
function bustUrl(url) {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_t=${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

const FILE_CONFIG = {
  DATA_DIR: './data/hanhan-pics',
  API_DATA_FILE: './data/hanhan-pics/api-data.json',
  UPDATE_INTERVAL: 5 * 24 * 60 * 60 * 1000
}

let apiData = null

function ensureDataDir() {
  if (!fs.existsSync(FILE_CONFIG.DATA_DIR)) {
    fs.mkdirSync(FILE_CONFIG.DATA_DIR, { recursive: true })
    logger.info('[憨憨富媒体] 创建数据目录')
  }
}

function isApiDataValid() {
  if (!fs.existsSync(FILE_CONFIG.API_DATA_FILE)) {
    return false
  }
  const stats = fs.statSync(FILE_CONFIG.API_DATA_FILE)
  const fileAge = Date.now() - stats.mtime.getTime()
  return fileAge < FILE_CONFIG.UPDATE_INTERVAL
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': '@karin-plugin-levi',
        ...options.headers
      }
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error('请求超时')
    }
    throw error
  }
}

async function fetchAndSaveApiData() {
  try {
    logger.info('[憨憨富媒体] 开始获取API数据...')
    const response = await fetchWithTimeout(API_CONFIG.LIST_API)
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }
    const data = await response.json()
    data.lastUpdate = Date.now()
    fs.writeFileSync(FILE_CONFIG.API_DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
    apiData = data
    logger.info('[憨憨富媒体] API数据获取并保存成功')
    return data
  } catch (error) {
    logger.error('[憨憨富媒体] 获取API数据失败:', error)
    throw error
  }
}

async function loadApiData() {
  try {
    if (isApiDataValid()) {
      const data = fs.readFileSync(FILE_CONFIG.API_DATA_FILE, 'utf8')
      apiData = JSON.parse(data)
      logger.info('[憨憨富媒体] 从缓存加载API数据')
      return
    }
    await fetchAndSaveApiData()
  } catch (error) {
    logger.error('[憨憨富媒体] 加载API数据失败:', error)
    if (fs.existsSync(FILE_CONFIG.API_DATA_FILE)) {
      try {
        const data = fs.readFileSync(FILE_CONFIG.API_DATA_FILE, 'utf8')
        apiData = JSON.parse(data)
        logger.warn('[憨憨富媒体] 使用过期缓存数据')
      } catch (cacheError) {
        logger.error('[憨憨富媒体] 缓存数据也无法使用:', cacheError)
      }
    }
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatList(items, prefix = '• ') {
  const result = []
  for (let i = 0; i < items.length; i += 3) {
    const row = items.slice(i, i + 3).map(item => `${prefix}${item}`).join('  ')
    result.push(row)
  }
  return result
}

function getUpdateTime() {
  if (!apiData?.lastUpdate) {
    return '未知'
  }
  return new Date(apiData.lastUpdate).toLocaleString()
}

async function initPlugin() {
  try {
    ensureDataDir()
    await loadApiData()
    const picCount = apiData?.pictureDirs?.length || 0
    const videoCount = apiData?.videoDirs?.length || 0
    logger.info(`[憨憨富媒体] 插件初始化成功，加载 ${picCount} 个图片目录，${videoCount} 个视频目录`)
  } catch (error) {
    logger.error('[憨憨富媒体] 插件初始化失败:', error)
  }
}
initPlugin()

/**
 * 富媒体目录兜底命令
 * 说明：karin.command() 仅是工厂函数，框架只在“加载时扫描模块导出”来注册命令，
 * 运行时 push 到局部数组的命令不会被注册。因此这里用一个【导出的】静态命令，
 * 在处理函数里实时读取 apiData 做匹配；不匹配则 return false 放行其它插件。
 * priority 设大一点，让具体命令（菜单/随机/更新）先匹配，这个兜底最后走。
 */
export const dynamicMedia = karin.command(/^#?.+$/s, async (e) => {
  if (!apiData) return false

  // 点按钮(enter:true)触发时，QQ 会在指令前自动加 @机器人 提及，
  // 形如 "<@xxxx> #小黑猫" 或解析残留的 "@xxxx> #小黑猫"，需先清掉再匹配
  const name = (e.msg || '')
    .replace(/<@!?[^>]+>/g, '')   // <@openid> 形式
    .replace(/@[0-9A-Za-z]+>/g, '') // 残留的 @openid> 形式
    .trim()
    .replace(/^#/, '')
    .trim()
  if (!name) return false

  // 视频：目录名 + “视频”
  if (name.endsWith('视频')) {
    const dir = name.slice(0, -2)
    if ((apiData.videoDirs || []).includes(dir)) {
      logger.info(`[憨憨富媒体] 匹配视频目录: ${dir}`)
      const videoUrl = `${API_CONFIG.VIDEO_API}/${encodeURIComponent(dir)}`
      const keyboard = segment.keyboard([[
        { text: '🔄 再来一个', data: `#${dir}视频`, enter: true, style: 1 },
        { text: '🎬 视频菜单', data: '#视频菜单', enter: true, style: 0 }
      ]])
      // 视频走富媒体单独发，keyboard 要挂在 markdown 上，故补一句文字避免空内容报错
      await e.reply([segment.text(`🎬 ${dir}`), segment.video(videoUrl), keyboard])
      return true
    }
  }

  // 图片：直接发送目录名
  if ((apiData.pictureDirs || []).includes(name)) {
    logger.info(`[憨憨富媒体] 匹配图片目录: ${name}`)
    const imageUrl = bustUrl(`${API_CONFIG.PICTURE_API}/${encodeURIComponent(name)}`)
    const keyboard = segment.keyboard([[
      { text: '🔄 再来一张', data: `#${name}`, enter: true, style: 1 },
      { text: '📦 表情包菜单', data: '#表情包菜单', enter: true, style: 0 }
    ]])
    await e.reply([segment.image(imageUrl), keyboard])
    return true
  }

  // 未命中任何目录，放行给其它插件
  return false
}, { name: 'dynamicMedia', priority: 100000 })

export const updateApiList = karin.command(/^#?憨憨?更新(表情包|图片|视频)?API列表$/, async (e) => {
  try {
    await e.reply('正在更新API列表，请稍候...')
    await fetchAndSaveApiData()
    const updateTime = new Date().toLocaleString()
    const totalPicDirs = apiData?.pictureDirs?.length || 0
    const totalVideoDirs = apiData?.videoDirs?.length || 0
    const successMsg = [
      '✅ API列表更新成功！',
      `📅 更新时间: ${updateTime}`,
      `📁 可用图片目录: ${totalPicDirs} 个`,
      `🎬 可用视频目录: ${totalVideoDirs} 个`,
      `🔄 下次自动更新: ${Math.ceil(FILE_CONFIG.UPDATE_INTERVAL / (24 * 60 * 60 * 1000))} 天后`
    ].join('\n')

    return await e.reply(successMsg)
  } catch (error) {
    logger.error('[更新API列表] 失败:', error)
    return await e.reply('❌ API列表更新失败，请稍后重试')
  }
}, { name: 'updateApiList' })

export const getRandomByCategory = karin.command(/^#?憨憨?随机(表情包|图片|壁纸|二次元|三次元|基础分类|叼图)$/, async (e) => {
  try {
    const categoryName = e.msg.replace(/^#?憨憨?随机/, '')

    const categoryMap = {
      '表情包': 'pictureCategories.表情包',
      '图片': 'pictureDirs',
      '壁纸': ['wallpaper'],
      '二次元': 'pictureCategories.二次元',
      '三次元': 'pictureCategories.三次元',
      '基础分类': 'pictureCategories.基础分类',
      '叼图': 'pictureCategories.叼图'
    }

    const categoryPath = categoryMap[categoryName]
    if (!categoryPath) {
      return await e.reply('❌ 不支持的分类类型')
    }

    let targetDirs = []
    if (Array.isArray(categoryPath)) {
      targetDirs = categoryPath
    } else if (categoryPath === 'pictureDirs') {
      targetDirs = apiData?.pictureDirs || []
    } else if (categoryPath.startsWith('pictureCategories.')) {
      const catName = categoryPath.split('.')[1]
      targetDirs = apiData?.pictureCategories?.[catName] || []
    }

    if (targetDirs.length === 0) {
      return await e.reply(`❌ ${categoryName} 分类暂无可用图片`)
    }

    const randomDir = targetDirs[Math.floor(Math.random() * targetDirs.length)]
    logger.info(`[随机图片] 分类: ${categoryName}, 目录: ${randomDir}`)

    const imageUrl = bustUrl(`${API_CONFIG.PICTURE_API}/${encodeURIComponent(randomDir)}`)
    await e.reply(segment.image(imageUrl))
    return true
  } catch (error) {
    logger.error('[随机图片] 获取失败:', error)
    return await e.reply('❌ 随机图片获取失败，请稍后重试')
  }
}, { name: 'getRandomByCategory' })

export const getRandomVideoByCategory = karin.command(/^#?憨憨?随机(美女视频|舞蹈视频|其他视频|视频)$/, async (e) => {
  try {
    const categoryName = e.msg.replace(/^#?憨憨?随机/, '')

    const categoryMap = {
      '美女视频': 'videoCategories.美女视频',
      '舞蹈视频': 'videoCategories.舞蹈视频',
      '其他视频': 'videoCategories.其他分类',
      '视频': 'videoDirs'
    }

    const categoryPath = categoryMap[categoryName]
    if (!categoryPath) {
      return await e.reply('❌ 不支持的视频分类类型')
    }

    let targetDirs = []
    if (categoryPath === 'videoDirs') {
      targetDirs = apiData?.videoDirs || []
    } else if (categoryPath.startsWith('videoCategories.')) {
      const catName = categoryPath.split('.')[1]
      targetDirs = apiData?.videoCategories?.[catName] || []
    }

    if (targetDirs.length === 0) {
      return await e.reply(`❌ ${categoryName} 分类暂无可用视频`)
    }

    const randomDir = targetDirs[Math.floor(Math.random() * targetDirs.length)]
    logger.info(`[随机视频] 分类: ${categoryName}, 目录: ${randomDir}`)

    const videoUrl = `${API_CONFIG.VIDEO_API}/${encodeURIComponent(randomDir)}`
    await e.reply(segment.video(videoUrl))
    return true
  } catch (error) {
    logger.error('[随机视频] 获取失败:', error)
    return await e.reply('❌ 随机视频获取失败，请稍后重试')
  }
}, { name: 'getRandomVideoByCategory' })

/**
 * 构建目录点击按钮（QQBot keyboard）
 *
 * QQBot 适配器(@karinjs/adapter-qqbot v2)发送时一律走 markdown 通道，
 * 会自动把 segment.keyboard / segment.button 合并进 keyboard 字段，
 * 所以这里只需返回一个 keyboard 段，丢进 e.reply 的数组里即可，无需手写 markdown。
 *
 * ⚠️ QQ 限制：单行最多 5 个按钮、最多 5 行 → 单条消息最多 25 个按钮。
 *
 * 按钮对象常用字段（见 node-karin karinToQQBot）：
 *   text   按钮显示文字
 *   data   点击后“发送”的指令文本（普通指令按钮 type=2，默认取 link||text）
 *   enter  true=点击即自动发送（省去用户手动点发送）
 *   link   链接跳转按钮（type=0），data 改放 url
 *   callback true=回调按钮（type=1，走 click_inline_keyboard_button 事件）
 *   style  0 灰色 / 1 蓝色
 *   show   点击后显示的文字
 *   admin  true=仅管理员可点 / list=[userId] 指定用户 / role=[roleId] 指定身份组
 *
 * @param {string[]} dirs 目录名数组
 * @param {(name:string)=>string} toCmd 目录名 -> 点击后发送的指令文本
 * @param {{perRow?:number, maxRows?:number, style?:number}} [opt]
 */
function buildDirButtons(dirs, toCmd, opt = {}) {
  const { perRow = 5, maxRows = 5, style = 1 } = opt
  const list = dirs.slice(0, perRow * maxRows)
  const rows = []
  for (let i = 0; i < list.length; i += perRow) {
    rows.push(list.slice(i, i + perRow).map(name => ({
      text: name,
      data: toCmd(name),
      enter: true,
      style
    })))
  }
  return segment.keyboard(rows)
}

/**
 * 渲染图 + 按钮菜单
 *
 * 菜单是 puppeteer 截的 base64 图，QQBot 适配器 v2 发图走 markdown 通道，
 * 需经 fileToUrl 上传成公网 https URL。该处理器见同目录 fileToUrl.js（图床上传）。
 * 图片与按钮一起丢进数组，适配器会合并成一条 markdown + keyboard 发送。
 */
async function renderMenu(e, menuTitle, commandsList, usageExamples, updateTime, buttons) {
  const templateData = {
    type: menuTitle,
    total: commandsList.length,
    commands: commandsList,
    usage: usageExamples,
    updateTime,
    scale: scale(1.1)
  }

  const img = await karin.render({
    name: 'hanhan-media-menu',
    file: join(__dirname, '../../resources/templates/menu.html'),
    data: templateData,
    pageGotoParams: { waitUntil: 'networkidle0' }
  })

  const msg = [segment.image(`base64://${img}`)]
  if (buttons) msg.push(buttons)
  return await e.reply(msg)
}

const scale = (pct = 1) => `style='transform:scale(${pct})'`

export const showExpressionHelp = karin.command(/^#?表情包(帮助|菜单)$/, async (e) => {
  try {
    if (!apiData) {
      return await e.reply('❌ API数据未加载，请尝试 #更新表情包API列表')
    }

    const expressionList = apiData.pictureCategories?.['表情包'] || []
    if (expressionList.length === 0) {
      return await e.reply('❌ 暂无可用表情包')
    }

    // 点击按钮直接发送目录名，触发 dynamicMedia 出图
    const buttons = buildDirButtons(expressionList, name => `#${name}`)
    return await renderMenu(e, '📦 表情包菜单', expressionList, ['直接发送表情包名称', '#憨憨随机表情包'], getUpdateTime(), buttons)
  } catch (error) {
    logger.error('[表情包帮助] 渲染失败:', error)
    return await e.reply('❌ 表情包菜单获取失败')
  }
})

export const showPictureHelp = karin.command(/^#?憨憨图片(帮助|菜单)$/, async (e) => {
  try {
    if (!apiData) {
      return await e.reply('❌ API数据未加载，请尝试 #更新图片API列表')
    }

    const categories = apiData.pictureCategories || {}
    const allPictureDirs = Object.values(categories).flat()

    return await renderMenu(e, '🖼️ 图片菜单', allPictureDirs, ['直接发送图片目录名称', '#随机图片'], getUpdateTime())
  } catch (error) {
    logger.error('[图片帮助] 渲染失败:', error)
    return await e.reply('❌ 图片菜单获取失败')
  }
})

export const showGirlHelp = karin.command(/^#?小姐姐(帮助|菜单)$/, async (e) => {
  try {
    if (!apiData) {
      return await e.reply('❌ API数据未加载，请尝试 #更新图片API列表')
    }

    const girlList = apiData.pictureCategories?.['三次元'] || []

    // 点击按钮直接发送目录名，触发 dynamicMedia 出图
    const buttons = buildDirButtons(girlList, name => `#${name}`)
    return await renderMenu(e, '👧 小姐姐菜单', girlList, ['直接发送类型名查看图片', '#随机三次元'], getUpdateTime(), buttons)
  } catch (error) {
    logger.error('[小姐姐帮助] 渲染失败:', error)
    return await e.reply('❌ 小姐姐菜单获取失败')
  }
})

export const showVideoHelp = karin.command(/^#?视频(帮助|菜单)$/, async (e) => {
  try {
    if (!apiData) {
      return await e.reply('❌ API数据未加载，请尝试 #更新视频API列表')
    }

    const categories = apiData.videoCategories || {}
    const allVideoDirs = Object.values(categories).flat()

    // 视频目录点击后发送“目录名+视频”，触发 dynamicMedia 出视频
    const buttons = buildDirButtons(allVideoDirs, name => `#${name}视频`)
    return await renderMenu(e, '🎬 视频菜单', allVideoDirs, ['发送 目录名+视频，查看视频', '#随机视频'], getUpdateTime(), buttons)
  } catch (error) {
    logger.error('[视频帮助] 渲染失败:', error)
    return await e.reply('❌ 视频菜单获取失败')
  }
})

export const showBeautyVideoHelp = karin.command(/^#?美女视频(帮助|菜单)$/, async (e) => {
  try {
    if (!apiData) {
      return await e.reply('❌ API数据未加载，请尝试 #更新视频API列表')
    }

    const beautyVideoList = apiData.videoCategories?.['美女视频'] || []

    return await renderMenu(e, '💃 美女视频菜单', beautyVideoList, ['发送类型名+视频', '#随机美女视频'], getUpdateTime())
  } catch (error) {
    logger.error('[美女视频帮助] 渲染失败:', error)
    return await e.reply('❌ 美女视频菜单获取失败')
  }
})