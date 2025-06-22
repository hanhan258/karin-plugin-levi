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
  PICTURE_API: 'https://ai.ycxom.top:3002/picture',
  VIDEO_API: 'https://ai.ycxom.top:3002/video',
  TIMEOUT: 15000
}

const FILE_CONFIG = {
  DATA_DIR: './data/hanhan-pics',
  API_DATA_FILE: './data/hanhan-pics/api-data.json',
  UPDATE_INTERVAL: 5 * 24 * 60 * 60 * 1000
}

let apiData = null
let dynamicCommands = []

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
    await registerDynamicCommands()
    logger.info('[憨憨富媒体] 插件初始化成功')
  } catch (error) {
    logger.error('[憨憨富媒体] 插件初始化失败:', error)
  }
}

async function registerDynamicCommands() {
  if (!apiData) {
    logger.warn('[憨憨富媒体] API数据为空，跳过动态命令注册')
    return
  }

  try {
    const allPicDirs = apiData.pictureDirs || []
    const allVideoDirs = apiData.videoDirs || []
    if (allPicDirs.length > 0) {
      const picValueMap = {}
      allPicDirs.forEach(dir => {
        picValueMap[dir] = dir
      })
      if (Object.keys(picValueMap).length > 0) {
        dynamicCommands.push(
          karin.command(`^#?(${Object.keys(picValueMap).join('|')})$`, async (e) => {
            const dirName = e.msg.replace('#', '')
            const imageUrl = `${API_CONFIG.PICTURE_API}/${encodeURIComponent(dirName)}`
            await e.reply(segment.image(imageUrl))
            return true
          }, { name: 'dynamicPicture' })
        )
      }
    }
    if (allVideoDirs.length > 0) {
      const videoValueMap = {}
      allVideoDirs.forEach(dir => {
        videoValueMap[`${dir}视频`] = dir
      })
      if (Object.keys(videoValueMap).length > 0) {
        dynamicCommands.push(
          karin.command(`^#?(${Object.keys(videoValueMap).join('|')})$`, async (e) => {
            const dirName = videoValueMap[e.msg.replace('#', '')]
            const videoUrl = `${API_CONFIG.VIDEO_API}/${encodeURIComponent(dirName)}`
            await e.reply(segment.video(videoUrl))
            return true
          }, { name: 'dynamicVideo' })
        )
      }
    }

    logger.info(`[憨憨富媒体] 动态注册 ${allPicDirs.length} 个图片命令，${allVideoDirs.length} 个视频命令`)
  } catch (error) {
    logger.error('[憨憨富媒体] 动态命令注册失败:', error)
  }
}
initPlugin()

export const updateApiList = karin.command(/^#?憨憨?更新(表情包|图片|视频)?API列表$/, async (e) => {
  try {
    await e.reply('正在更新API列表，请稍候...')
    await fetchAndSaveApiData()
    await registerDynamicCommands()
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

    const imageUrl = `${API_CONFIG.PICTURE_API}/${encodeURIComponent(randomDir)}`
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

async function renderMenu(e, menuTitle, commandsList, usageExamples, updateTime) {
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
    pageGotoParams: { waitUntil: 'networkidle0' },
    quality: 100
  })

  return await e.reply(segment.image(`base64://${img}`))
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

    return await renderMenu(e, '📦 表情包菜单', expressionList, ['直接发送表情包名称', '#憨憨随机表情包'], getUpdateTime())
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

    return await renderMenu(e, '👧 小姐姐菜单', girlList, ['直接发送类型名查看图片', '#随机三次元'], getUpdateTime())
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

    return await renderMenu(e, '🎬 视频菜单', allVideoDirs, ['发送 目录名+视频，查看视频', '#随机视频'], getUpdateTime())
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