import { karin, redis, segment } from 'node-karin'
import { makeKeyboard } from '../../lib/buttons.js'

// 游戏进行中 / 新开局 两套按钮
const playKb = () => makeKeyboard([['#开枪', '#当前子弹', '#结束游戏']])
const newGameKb = () => makeKeyboard([['#开盘']])

export const startELSGame = karin.command('^#?(开启俄罗斯轮盘|开盘|开启轮盘|开启转盘|俄罗斯轮盘)$', async (e) => {
  const groupId = e.groupId
  // 判断是否已经开启了俄罗斯轮盘
  if (await redis.exists(`HANHAN:ELS2:${groupId}`) === 1) {
    e.reply([segment.text('当前群俄罗斯轮盘正在进行中！\n请发送#开枪 参与游戏'), playKb()])
    return
  }
  // 随机生成数组，长度从3到8，其中一项为子弹，剩下的为空(0为空，1为子弹)
  const length = Math.floor(Math.random() * 6) + 3
  // 随机指定数组的某一项为子弹，剩下的为空
  const arr = new Array(length).fill(0)
  const target = Math.floor(Math.random() * length)
  arr[target] = 1
  // 记录一下当前的数组
  // Bot.logger.mark('arr', arr)
  await redis.set(`HANHAN:ELS2:${groupId}`, JSON.stringify(arr), { EX: 60 * 60 * 24 })
  await e.reply([segment.text(`当前群俄罗斯轮盘已开启！\n弹夹有【${length}】发子弹。\n请发送#开枪 参与游戏`), playKb()])
  return true
}, { name: 'levi-els', event: 'message.group' })

export const shoot = karin.command('^#?开枪$', async (e) => {
  const username = e.sender.nick
  const groupId = e.groupId

  if (await redis.exists(`HANHAN:ELS2:${groupId}`) === 0) {
    await startELSGame(e)
  }

  const arr = JSON.parse(await redis.get(`HANHAN:ELS2:${groupId}`))
  if (arr === null) {
    await redis.del(`HANHAN:ELS2:${groupId}`)
    await startELSGame(e)
    return true
  }

  if (arr[0] === 0) {
    arr.shift()
    if (arr.length === 1) {
      e.reply([
        segment.text(`【${username}】开了一枪，没响。\n由于只剩一发子弹，本轮游戏结束。\n请使用#开盘 开启新一轮游戏`),
        segment.image('https://www.loliapi.com/acg/pc/'),
        newGameKb(),
      ])
      await redis.del(`HANHAN:ELS2:${groupId}`)
      return true
    }
    e.reply([segment.text(`【${username}】开了一枪，没响。\n还剩【${arr.length}】发子弹`), playKb()])
    await redis.set(`HANHAN:ELS2:${groupId}`, JSON.stringify(arr), { EX: 60 * 60 * 24 })
    return true
  }

  if (arr[0] === 1) {
    const time = Math.floor(Math.random() * 240) + 60
    await e.bot.BanMember({ group_id: groupId, target_uid: e.userId, duration: time })
    e.reply([segment.text(`【${username}】开了一枪，枪响了。\n恭喜【${username}】被禁言${time}秒\n本轮游戏结束。请使用#开盘 开启新一轮游戏`), newGameKb()])
    await redis.del(`HANHAN:ELS2:${groupId}`)
  }
  return true
}, { name: 'levi-els', event: 'message.group' })

export const stopELSGame = karin.command('^#?结束游戏$', async (e) => {
  const groupId = e.groupId
  const arr = await redis.exists(`HANHAN:ELS2:${groupId}`)
  if (arr === 0) {
    e.reply([segment.text('当前群没有开盘'), newGameKb()])
  } else {
    await redis.del(`HANHAN:ELS2:${groupId}`)
    e.reply([segment.text('结束成功'), newGameKb()])
  }
  return true
}, { name: 'levi-els', event: 'message.group' })

export const nowBullet = karin.command('^#?当前子弹$', async (e) => {
  const groupId = e.groupId
  const arr = JSON.parse(await redis.get(`HANHAN:ELS2:${groupId}`))
  if (!arr) {
    e.reply([segment.text('当前群没有开盘'), newGameKb()])
  } else {
    e.reply([segment.text(`当前还有【${arr.length}】发子弹)`), playKb()])
  }
  return true
}, { name: 'levi-els', event: 'message.group' })
