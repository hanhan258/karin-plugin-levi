import { karin, segment } from 'node-karin'

export const sendPicture = karin.command('^#(sendPic|sendpic|pic|img)', async (e) => {
  const url = e.msg.replace(/^#(sendPic|sendpic|pic|img)/, '').trim()
  if (!url) return e.reply('这是 null，你疯了吗?', true)
  if (url.startsWith('http')) {
    await e.reply(segment.image(url))
  }
  return true
}, { name: 'levi-send-pic', perm: 'admin' })

export const sendVideo = karin.command('^#(sendVid|sendvid|vid)', async (e) => {
  const url = e.msg.replace(/^#(sendVid|sendvid|vid)/, '').trim()
  if (!url) return e.reply('这是 null，你疯了吗?', true)
  if (url.startsWith('http')) {
    await e.reply(segment.video(url))
  }
  return true
}, { name: 'levi-send-vid', perm: 'admin' })

export const sendRecord = karin.command('^#(sendRec|sendrec|rec)', async (e) => {
  const url = e.msg.replace(/^#(sendRec|sendrec|rec)/, '').trim()
  if (!url) return e.reply('这是 null，你疯了吗?', true)
  if (url.startsWith('http')) {
    await e.reply(segment.record(url))
  }
  return true
}, { name: 'levi-send-rec', perm: 'admin' })
