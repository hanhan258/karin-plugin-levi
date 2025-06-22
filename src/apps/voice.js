import axios from 'node-karin/axios'
import { karin, segment } from 'node-karin'

export const sjcy = karin.command('^#?(唱鸭|随机唱鸭)$', async (e) => {
  await e.reply(segment.record('http://api.yujn.cn/api/changya.php?type=mp3'))
  return true
}, { name: '随机唱鸭' })

export const sjkk = karin.command('^#?(坤坤语音|随机坤坤)$', async (e) => {
  await e.reply(segment.record('http://api.yujn.cn/api/sjkunkun.php?'))
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
      await e.reply(segment.record(result.url))
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
  await e.reply(segment.record('http://api.yujn.cn/api/maren.php?'))
  return true
}, { name: '骂我' })

export const lvcha = karin.command('^#?(绿茶|随机绿茶)$', async (e) => {
  await e.reply(segment.record('https://api.yujn.cn/api/lvcha.php?'))
  return true
}, { name: '随机绿茶' })
