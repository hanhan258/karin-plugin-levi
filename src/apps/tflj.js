import { fileURLToPath } from 'url'
import path from 'path'
import { snapka } from '@karinjs/plugin-puppeteer'
import { spawn } from 'child_process'
import { karin, segment, logger } from 'node-karin'
import { config } from '../../lib/config.js'
import { makeKeyboard } from '../../lib/buttons.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 安全加载插件配置的辅助函数
const pluginConfig = (() => {
    try {
        return config()
    } catch (err) {
        logger.warn('[台风路径] 加载用户config.yaml失败，将使用默认配置 (环境变量中的ffmpeg)', err.message)
        return {}
    }
})()

// 获取ffmpeg路径，如果未配置默认使用系统环境的ffmpeg命令
const getFfmpegPath = () => pluginConfig.ffmpegPath?.trim() || process.env.FFMPEG_PATH || 'ffmpeg'

// 最佳性能和平台发送兼容参数配置
const URL_TEMPLATE = 'https://typhoon.slt.zj.gov.cn/'
const TIME_MAP = 5        // 总录制时长：5秒内
const WIDTH = 500         // 宽度 500px (确定体积小于5MB)
const HEIGHT = 400        // 高度 400px
const FPS = 6             // 帧率较低减少体积，GIF仍流畅

// 入口函数
export const typhoonPath = karin.command(/^#?台风路径$/, async (e) => {
    await e.reply('🌪 正在录制台风路径GIF，请稍候...')

    try {
        const gifBuffer = await captureGif(URL_TEMPLATE, TIME_MAP, WIDTH, HEIGHT, FPS)

        if (!gifBuffer) {
            await e.reply('⚠ 台风数据获取失败，请稍后再试。')
            return
        }

        // 主动检查GIF大小，超过5M发出警告
        if (gifBuffer.byteLength > 5 * 1024 * 1024) {
            logger.warn(`[台风路径] 生成的GIF超过5MB(实际${(gifBuffer.byteLength / (1024 * 1024)).toFixed(2)}MB)，可能发送失败`)
        }

        await e.reply([
            segment.image(`base64://${gifBuffer.toString('base64')}`),
            makeKeyboard(e, [[{ text: '🔄 再录一次', cmd: '#台风路径' }]])
        ].filter(Boolean))

    } catch (error) {
        logger.error('[台风路径] 录制失败:', error)
        await e.reply('❌ 录制GIF失败，请稍后重试')
    }

}, { name: 'typhoonPath', event: 'message.group' })

// 高效能截图录制
async function captureGif(url, duration, width, height, fps) {
    // 复用 @karinjs/plugin-puppeteer 暴露的 snapka 引擎，避免本插件单独装 puppeteer/chromium。
    // snapka.launch() 返回 PuppeteerCore 包装对象，.browser 才是 puppeteer-core 的 Browser。
    const core = await snapka.launch({ args: ['--no-sandbox'] })
    const browser = core.browser
    const page = await browser.newPage()

    await page.setViewport({ width, height })
    await page.goto(url, { waitUntil: 'networkidle2' })

    await removeDOMElements(page)

    const client = await page.target().createCDPSession()
    await client.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        maxWidth: width,
        maxHeight: height,
        everyNthFrame: Math.ceil(30 / fps)
    })

    return new Promise(async (resolve, reject) => {
        const ffmpeg = spawn(getFfmpegPath(), [
            '-f', 'image2pipe',
            '-r', `${fps}`,
            '-i', '-',
            '-filter_complex', `[0:v] fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=160 [pal]; [0:v][pal] paletteuse=dither=bayer`,
            '-loop', '0',
            '-f', 'gif',
            '-'
        ])

        const buffers = []
        ffmpeg.stdout.on('data', chunk => buffers.push(chunk))
        ffmpeg.stdout.on('error', reject)
        ffmpeg.stdout.on('end', () => resolve(Buffer.concat(buffers)))

        ffmpeg.stderr.on('data', err => logger.debug('[ffmpeg]', err.toString()))

        const stopCapture = setTimeout(async () => {
            await client.send('Page.stopScreencast')
            ffmpeg.stdin.end()
            await core.close().catch(() => {})
        }, duration * 1000)

        client.on('Page.screencastFrame', async ({ data, sessionId }) => {
            ffmpeg.stdin.write(Buffer.from(data, 'base64'))
            await client.send('Page.screencastFrameAck', { sessionId })
        })

        ffmpeg.on('close', async code => {
            clearTimeout(stopCapture)
            await client.send('Page.stopScreencast').catch(() => { })
            await core.close().catch(() => {})
            if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}`))
        })
    })
}

// 移除页面不必要元素以优化录制效果
async function removeDOMElements(page) {
    await page.evaluate(() => {
        const selectors = [
            '#app > header > div.top-operations',
            '#app > div.content > div > div.sidebar.sidebar-web',
            '#app > div.content > div > div.map-btns',
            '#map > div.leaflet-control-container',
            '#app > div.content > div > div.legend-box',
            '#app > div.content > div > div.history-web'
        ]
        selectors.forEach(selector => document.querySelector(selector)?.remove())
    })
}