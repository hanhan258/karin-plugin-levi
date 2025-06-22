'use strict'
import { karin, exec } from 'node-karin'
import { config } from '../../lib/config.js'
import pingMan from 'pingman'
import dns from 'dns'
import net from 'net'

export const ping = karin.command('^#?[pP]ing ', async (e) => {
  if (!config().pingToken) {
    e.reply('请前往 https://ipinfo.io 注册账号，使用 #憨憨设置pingtoken 命令进行设置，设置好之后请重启')
    return false
  }

  const msg = e.msg.trim().replace(/^#?[pP]ing\s/, '').replace(/https?:\/\//, '').trim()
  await e.reply('在ping了、在ping了。。。', true, { recallMsg: 3 })
  let pingRes; let domain; let ipAddress = msg; let isShowIP = false; const numberOfEchos = 6
  if (e.msg.trim().includes('#Ping')) isShowIP = true
  if (msg !== 'me') {
    const options = {
      logToFile: false,
      numberOfEchos,
      timeout: 2,
    }
    if (net.isIPv4(msg)) {
      options.IPV4 = true
    } else if (net.isIPv6(msg)) {
      options.IPV6 = true
    } else {
      domain = getDomain(msg)
      ipAddress = domain ? await getIPAddress(domain) : ''
      if (!ipAddress) {
        await e.reply('解析域名ip出错！')
        return false
      }
    }

    try {
      const response = await pingMan(ipAddress, options)
      if (response.alive) {
        pingRes = '最小延迟：' + Math.floor(response.min) + 'ms\n' +
          '最大延迟：' + Math.floor(response.max) + 'ms\n' +
          '平均延迟：' + Math.floor(response.avg) + 'ms\n' +
          '发送数据包: ' + numberOfEchos + '\n' +
          '丢失数据包: ' + Math.round(numberOfEchos * (response.packetLoss / 100)) + '\n' +
          '丢包率：' + response.packetLoss + '%'
      } else {
        pingRes = `目标地址${!e.isGroup ? '(' + ipAddress + ')' : domain || ''}无法响应，请检查网络连接是否正常(是否需要代理访问？)，或该站点是否已关闭。`
      }
    } catch (error) {
      logger.error(`ping 执行出错: ${error}`)
      await e.reply('ping 执行出错: ', error)
    }
  }

  const { status, error, stdout } = await exec(`curl https://ipinfo.io/${msg === 'me' ? '' : ipAddress}?token=${config().pingToken}`)
  if (!status) {
    logger.error(error)
    await e.reply(`exec curl执行出错: ${error.message}`, { reply: e.isGroup })
    return true
  }

  const ipInfo = JSON.parse(stdout.trim())
  logger.warn(ipInfo)

  if (ipInfo.bogon) {
    await e.reply(pingRes, e.isGroup)
    return false
  }
  const res = `${isShowIP ? 'IP: ' + ipInfo.ip + '\n' : ''}${domain ? 'Domain: ' + domain + '\n' : ''}国家/地区：${ipInfo.country}\n区域：${ipInfo.region}\n城市：${ipInfo.city}\n时区：${ipInfo.timezone}\n经纬度：${ipInfo.loc}\n运营商：${ipInfo.org}\n${pingRes || ''}`
  await e.reply(res, e.isGroup)
  return true
}, { name: 'levi-ping' })

function getDomain (url) {
  const domainRegex = /((?:[\u4e00-\u9fa5a-zA-Z0-9-]+\.)+[\u4e00-\u9fa5a-zA-Z]{2,})/
  const match = url.match(domainRegex)
  return match ? match[1] : false
}

async function getIPAddress (host) {
  try {
    return await new Promise((resolve, reject) => {
      dns.lookup(host, (err, address) => {
        if (err) {
          reject(err)
        } else {
          resolve(address)
        }
      })
    })
  } catch (error) {
    logger.error(error)
    return false
  }
}
