import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { karin, segment } from "node-karin";
import { makeKeyboard } from "../../lib/buttons.js";

// 插件路径
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const join = (...paths) => path.join(...paths).replace(/\\/g, '/');

//指令注册
export const menu = karin.command(/^#?憨憨(菜单|帮助)$/i, async (e) => {
    const jsFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.js') && file !== 'menu.js');
    let commands = [];
    const commandRegex = /karin\.command\s*\(\s*(?:('|")(.*?)\1|(\/.+?\/))[,\s]/gs;

    jsFiles.forEach(file => {
        const filePath = join(__dirname, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = commandRegex.exec(content)) !== null) {
            commands.push({
                file,
                command: cleanRegexToReadable(match[2] || match[3])
            });
        }
    });

    if (commands.length == 0) {
        e.reply("🌵未找到任何插件指令！")
        return
    }

    //渲染参数
    const options = {
        commands,
        pluginName: 'karin-plugin-levi',
        sys: { scale: scale(1.2) }
    }

    const img = await karin.render({
        name: 'karin-plugin-levi-menu',
        file: join(__dirname, '../../resources/menu/index.html'),
        data: options,
        pageGotoParams: { waitUntil: 'networkidle0' }
    });

    // 导航按钮：点一下直达各功能
    const keyboard = makeKeyboard(e, [
        ['#表情包菜单', '#视频菜单', '#小姐姐菜单'],
        ['#开盘', '#台风路径', '#唱鸭'],
        ['#坤坤语音', '#网易云', '#绿茶']
    ]);

    e.reply([segment.image(`base64://${img}`), keyboard].filter(Boolean))
});

// 指令美化处理
function cleanRegexToReadable(regexStr) {
    return regexStr
        .replace(/^\^#?/, '')
        .replace(/\$$/, '')
        .replace(/[\^\(\)\?\:]/g, '')
        .replace(/\|/g, ' / ')
        .replace(/\\d\+/g, '数字')
        .replace(/\\s\+/g, '空格');
}

// 缩放样式函数
const scale = (pct = 1) => `style='transform:scale(${pct})'`;