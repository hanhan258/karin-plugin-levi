import { dirPath } from '../utils/dir.js'
import {
  watch,
  basePath,
  filesByExt,
  YamlEditor,
  copyConfigSync,
  requireFileSync,
} from 'node-karin'

let cache

/**
 * @description package.json
 */
export const pkg = () => requireFileSync(`${dirPath}/package.json`)

/** 用户配置的插件名称 */
export const pluginName = pkg().name.replace(/\//g, '-')
/** 用户配置 */
const dirConfig = `${basePath}/${pluginName}/config`
/** 默认配置 */
const defConfig = `${dirPath}`

/**
 * @description 初始化配置文件
 */
copyConfigSync(defConfig, dirConfig, ['.yaml'])

/**
 * @description 配置文件
 */
export const config = () => {
  if (cache) return cache
  const user = requireFileSync(`${dirConfig}/config.yaml`)
  const def = requireFileSync(`${defConfig}/config.yaml`)
  const result = { ...def, ...user }
  cache = result
  return result
}

/**
 * @description 写入用户配置项并立即让缓存失效
 * @param {string} key 配置键，如 'pingToken'
 * @param {any} value 配置值
 */
export const setConfig = (key, value) => {
  const editor = new YamlEditor(`${dirConfig}/config.yaml`)
  editor.set(key, value)
  editor.save()
  cache = undefined
}

/**
 * @description 监听配置文件
 */
setTimeout(() => {
  const list = filesByExt(dirConfig, '.yaml', 'abs')
  list.forEach(file => watch(file, (old, now) => {
    cache = undefined
  }))
}, 2000)
