import axios from 'node-karin/axios'
import { karin, segment } from 'node-karin'
import { makeKeyboard } from '../../lib/buttons.js'

// 语音功能快捷按钮（语音走富媒体通道，keyboard 需配文字垫住，避免空 markdown 报错）
const voiceKb = (e) => makeKeyboard(e, [['#唱鸭', '#坤坤语音', '#网易云', '#绿茶', '#骂我']])

export const sjcy = karin.command('^#?(唱鸭|随机唱鸭)$', async (e) => {
  await e.reply([segment.text('🎵 随机唱鸭'), segment.record('http://api.yujn.cn/api/changya.php?type=mp3'), voiceKb(e)].filter(Boolean))
  return true
}, { name: '随机唱鸭' })

export const sjkk = karin.command('^#?(坤坤语音|随机坤坤)$', async (e) => {
  await e.reply([segment.text('🎤 随机坤坤'), segment.record('http://api.yujn.cn/api/sjkunkun.php?'), voiceKb(e)].filter(Boolean))
  return true
}, { name: '随机坤坤' })

export const sjwyy = karin.command('^#?(网易云|随机网易云)$', async (e) => {
  let retryCount = 0
  const fnc = async () => {
    if (retryCount >= 3) {
      retryCount = 0
      return e.reply('已尝试3次，仍未获取到普通歌曲，请稍后再试')
    }

    const url = 'https://api.yujn.cn/api/sjwyy.php?type=json'
    const response = await axios.get(url)
    if (response.code !== 200) {
      return e.reply('api寄了')
    }

    const result = response.data
    console.log(result)

    if (result.id) {
      await e.reply(segment.image(result.img))
      await e.reply([segment.text('🎶 随机网易云'), segment.record(result.url), voiceKb(e)].filter(Boolean))
    } else {
      retryCount++
      await e.reply('随机到vip歌曲了，已自动随机下一首')
      return fnc()
    }
  }

  await fnc()
  retryCount = 0
  return true
}, { name: '随机网易云' })

export const maren = karin.command('^#?骂我$', async (e) => {
  await e.reply([segment.text('🗯 骂我'), segment.record('http://api.yujn.cn/api/maren.php?'), voiceKb(e)].filter(Boolean))
  return true
}, { name: '骂我' })

export const lvcha = karin.command('^#?(绿茶|随机绿茶)$', async (e) => {
  await e.reply([segment.text('🍵 随机绿茶'), segment.record('https://api.yujn.cn/api/lvcha.php?'), voiceKb(e)].filter(Boolean))
  return true
}, { name: '随机绿茶' })
