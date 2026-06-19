# karin-plugin-levi

基于 [Karin](https://github.com/karinjs/karin) 的多功能娱乐插件：富媒体图库/视频、语音、俄罗斯轮盘小游戏、台风路径录制、Ping 查询等，并针对 **QQ 官方机器人（QQBot）** 做了按钮、图床、@ 提及等适配。

> 模板来源：[karin-plugin-template](https://github.com/KarinJS/karin-plugin-template)

---

## ✨ 功能特性

- 🖼️ **憨憨富媒体**：按目录发图/发视频，多种随机分类，图文菜单 + 可点按钮
- 🎵 **语音**：唱鸭、坤坤、网易云、绿茶、骂我，一键再来一个
- 🔫 **俄罗斯轮盘**：群内开盘开枪小游戏（中弹禁言），带操作按钮
- 🌪️ **台风路径**：录制实时台风路径 GIF
- 📡 **Ping**：域名/IP 归属地 + 延迟查询
- 📤 **发送工具**：管理员快捷发送图片/视频/语音
- 🔘 **QQBot 适配**：菜单与媒体均带 keyboard 按钮，base64 图自动走图床上传

---

## 📦 安装

在 Karin 根目录执行：

```bash
# Github
git clone --depth=1 https://github.com/hanhan258/karin-plugin-levi ./plugins/karin-plugin-levi

# Github 镜像
git clone --depth=1 https://ghproxy.net/https://github.com/hanhan258/karin-plugin-levi ./plugins/karin-plugin-levi
```

安装依赖：

```bash
pnpm install --filter=karin-plugin-levi
```

### 运行环境依赖

| 依赖 | 用途 | 必需 |
|---|---|---|
| **Redis** | 俄罗斯轮盘游戏状态（Karin 内置 redis） | 玩游戏时 |
| **ffmpeg** | 台风路径 GIF 合成 | `#台风路径` 时 |
| **puppeteer** | 菜单 / 台风路径截图（随依赖安装） | 是 |

---

## ⚙️ 配置

首次运行会把默认配置复制到 `@karinjs/karin-plugin-levi/config/config.yaml`，按需修改（支持热重载）：

```yaml
# ipinfo.io 的 token，用于 #ping 查询（https://ipinfo.io 注册获取）
pingToken: ''
# ffmpeg 可执行文件路径，留空则用系统环境变量 PATH 中的 ffmpeg
ffmpegPath: ''
```

> 💡 `pingToken` 也可直接用指令设置：`#憨憨设置pingtoken <token>`（主人权限，写入即生效）。

---

## 📖 指令列表

> 默认指令前缀 `#` 可省略。

### 🖼️ 富媒体图库 / 视频

| 指令 | 说明 |
|---|---|
| `#憨憨菜单` / `#憨憨帮助` | 总菜单（带功能导航按钮） |
| `#表情包菜单` | 表情包目录菜单（点按钮直接出图） |
| `#憨憨图片菜单` | 全部图片目录菜单 |
| `#小姐姐菜单` | 三次元目录菜单 |
| `#视频菜单` | 视频目录菜单 |
| `#美女视频菜单` | 美女视频目录菜单 |
| `<目录名>` | 直接发送目录名，随机出该目录一张图，例：`#小黑猫` |
| `<目录名>视频` | 随机出该目录一个视频，例：`#白丝视频` |
| `#憨憨随机表情包/图片/壁纸/二次元/三次元/基础分类/叼图` | 按分类随机出图 |
| `#憨憨随机美女视频/舞蹈视频/其他视频/视频` | 按分类随机出视频 |
| `#憨憨更新API列表` | 手动刷新目录数据（也支持 `更新表情包/图片/视频API列表`） |

### 🎵 语音

| 指令 | 说明 |
|---|---|
| `#唱鸭` / `#随机唱鸭` | 随机唱鸭语音 |
| `#坤坤语音` / `#随机坤坤` | 随机坤坤语音 |
| `#网易云` / `#随机网易云` | 随机网易云歌曲 |
| `#绿茶` / `#随机绿茶` | 随机绿茶语音 |
| `#骂我` | 随机“骂我”语音 |

### 🔫 俄罗斯轮盘（群聊）

| 指令 | 说明 |
|---|---|
| `#开盘`（`#开启轮盘`/`#俄罗斯轮盘` 等） | 开启一局，随机 3~8 发弹夹 |
| `#开枪` | 开一枪，中弹随机禁言 60~300 秒 |
| `#当前子弹` | 查看剩余子弹数 |
| `#结束游戏` | 结束当前对局 |

### 🌪️ 其他工具

| 指令 | 说明 |
|---|---|
| `#台风路径` | 录制实时台风路径 GIF |
| `#ping <域名/IP/me>` | 归属地 + 延迟查询（需 `pingToken`）；`#Ping` 额外显示 IP |
| `#憨憨设置pingtoken <token>` | 【主人】设置 ipinfo.io 的 token，写入配置并即时生效（无需重启） |
| `#pic/img <url>` | 【管理员】发送图片 |
| `#vid <url>` | 【管理员】发送视频 |
| `#rec <url>` | 【管理员】发送语音 |

---

## 🔘 QQ 官方机器人（QQBot）适配说明

本插件针对 `@karinjs/adapter-qqbot` v2 做了适配，使用 QQBot 时请注意：

### 1. 图片发送 —— 内置图床上传
QQBot 发图一律走 markdown 通道，**base64/本地图必须先转成公网 https URL** 才能显示。`src/apps/fileToUrl.js` 已注册全局 `fileToUrl` 处理器，自动把图片上传到图床并返回链接。如需更换图床，修改该文件顶部的 `IMG_BED` 配置即可。

### 2. 按钮（keyboard）
菜单、媒体输出均附带可点按钮（`lib/buttons.js` 提供构建工具）。按钮 `enter:true` 点击即自动发送，受 QQ「每行≤5、最多5行（共≤25）」限制。

### 3. 去除 @ 提及（重要）
QQBot 群内点按钮/被 @ 触发时，指令前会带 `<@机器人>` 提及，导致匹配失败。请在适配器配置 `@karinjs-adapter-qqbot/config/config.json` 对应 bot 的 `regex` 数组中加入一条，全局剥离：

```json
"regex": [
  { "reg": "^/", "rep": "#" },
  { "reg": "^<?@[0-9A-Za-z]+>\\s*", "rep": "" }
]
```

---

## 🛠️ 开发调试

```bash
node . --dev
```

## 🔗 相关链接

- Karin 框架：https://github.com/KarinJS/Karin
- 问题反馈：https://github.com/hanhan258/karin-plugin-levi/issues
