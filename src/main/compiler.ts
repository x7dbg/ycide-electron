import { join, dirname, basename } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync } from 'fs'
import { execFile, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { libraryManager } from './library-manager'
import type { LibCommand, LibConstant } from './fne-parser'

// 编译消息类型
export interface CompileMessage {
  type: 'info' | 'warning' | 'error' | 'success'
  text: string
}

// 编译选项
export interface CompileOptions {
  projectDir: string
  debug?: boolean
  linkMode?: 'static' | 'normal'  // 静态编译 | 普通编译（默认普通）
  arch?: string                    // 目标架构（优先于 .epp 中的 platform）
}

// 编译结果
export interface CompileResult {
  success: boolean
  outputFile: string
  errorCount: number
  warningCount: number
  elapsedMs: number
}

// 窗口控件信息
interface WindowControlInfo {
  type: string
  name: string
  x: number
  y: number
  width: number
  height: number
  text: string
  visible: boolean
  disabled: boolean
  extraProps: Record<string, unknown>  // 支持库自定义属性原始值
}

// 窗口文件信息
interface WindowFileInfo {
  width: number
  height: number
  title: string
  visible: boolean
  disabled: boolean
  border: number       // 0无边框 1单线 2可调(default) 3对话框 4工具窗 5可调工具窗
  maxButton: boolean
  minButton: boolean
  controlBox: boolean
  topmost: boolean
  startPos: number     // 0手工 1居中(default)
  controls: WindowControlInfo[]
}

// 项目文件条目
interface ProjectFileEntry {
  type: string
  fileName: string
  flag: number
}

// 项目信息
interface ProjectInfo {
  projectName: string
  outputType: string
  platform: string
  files: ProjectFileEntry[]
  projectDir: string
}

interface GlobalVarDef {
  name: string
  type: string
}

interface ConstantDef {
  name: string
  value: string
}

interface LibraryConstantDef extends ConstantDef {
  type: 'null' | 'number' | 'bool' | 'text'
}

type EventChannel = 'WM_COMMAND' | 'WM_NOTIFY' | 'WM_HSCROLL' | 'WM_VSCROLL'

interface LibraryEventBindingSpec {
  library?: string
  unit: string
  unitEnglishName?: string
  event: string
  channel: EventChannel
  code?: string
}

interface LibraryCompileProtocol {
  version?: string | number
  eventBindings?: LibraryEventBindingSpec[]
}

interface NormalizedEventBinding {
  library: string
  unit: string
  unitEnglishName: string
  event: string
  channel: EventChannel
  code: string
}

// 正在运行的进程
let runningProcess: ChildProcess | null = null

// 发送编译消息到渲染进程
function sendMessage(msg: CompileMessage): void {
  BrowserWindow.getAllWindows().forEach(w => {
    w.webContents.send('compiler:output', msg)
  })
}

// 获取应用目录（开发模式下是项目根目录）
function getAppDirectory(): string {
  if (!app.isPackaged) {
    return app.getAppPath()
  }
  return dirname(process.execPath)
}

// 查找 Clang 编译器
function findClangCompiler(): string | null {
  const appDir = getAppDirectory()
  const searchPaths = [
    join(appDir, 'compiler', 'llvm', 'bin', 'clang.exe'),
    join(appDir, 'compiler', 'bin', 'clang.exe'),
  ]
  for (const p of searchPaths) {
    if (existsSync(p)) return p
  }
  return null
}

// 查找 MSVC SDK 路径
interface MSVCSDKPaths {
  msvcInclude: string
  msvcLib: string
  ucrtInclude: string
  ucrtLib: string
  umInclude: string
  sharedInclude: string
  umLib: string
}

function findMSVCSDK(arch: string): MSVCSDKPaths | null {
  const appDir = getAppDirectory()
  const searchRoots = [
    join(appDir, 'compiler', 'MSVCSDK'),
    join(appDir, 'MSVCSDK'),
  ]

  for (const root of searchRoots) {
    if (!existsSync(root)) continue

    // 检测 MSVC 版本号
    const msvcBase = join(root, 'MSVC')
    if (!existsSync(msvcBase)) continue
    const msvcVersions = readdirSync(msvcBase).filter(d => {
      try { return statSync(join(msvcBase, d)).isDirectory() } catch { return false }
    })
    if (msvcVersions.length === 0) continue
    const msvcVer = msvcVersions[msvcVersions.length - 1]
    const msvcRoot = join(msvcBase, msvcVer)

    // 检测 SDK 版本号
    const sdkBase = join(root, 'WindowsKits', '10')
    const sdkIncDir = join(sdkBase, 'Include')
    if (!existsSync(sdkIncDir)) continue
    const sdkVersions = readdirSync(sdkIncDir).filter(d => d.startsWith('10.'))
    if (sdkVersions.length === 0) continue
    const sdkVer = sdkVersions[sdkVersions.length - 1]

    const sdkIncBase = join(sdkBase, 'Include', sdkVer)
    const sdkLibBase = join(sdkBase, 'Lib', sdkVer)

    // 验证关键文件
    if (!existsSync(join(msvcRoot, 'include', 'vcruntime.h'))) continue
    if (!existsSync(join(sdkIncBase, 'um', 'windows.h'))) continue

    const archDir = arch === 'x86' ? 'x86' : 'x64'
    return {
      msvcInclude: join(msvcRoot, 'include'),
      msvcLib: join(msvcRoot, 'lib', archDir),
      ucrtInclude: join(sdkIncBase, 'ucrt'),
      ucrtLib: join(sdkLibBase, 'ucrt', archDir),
      umInclude: join(sdkIncBase, 'um'),
      sharedInclude: join(sdkIncBase, 'shared'),
      umLib: join(sdkLibBase, 'um', archDir),
    }
  }
  return null
}

// 解析 .epp 项目文件
function parseEppFile(eppPath: string): ProjectInfo | null {
  if (!existsSync(eppPath)) return null
  const content = readFileSync(eppPath, 'utf-8')
  const lines = content.split('\n').map(l => l.trim())
  const info: Record<string, string> = {}
  const files: ProjectFileEntry[] = []
  for (const line of lines) {
    if (line.startsWith('#') || line === '') continue
    if (line.startsWith('File=')) {
      const parts = line.substring(5).split('|')
      if (parts.length >= 2) {
        files.push({
          type: parts[0],
          fileName: parts[1],
          flag: parts[2] ? parseInt(parts[2], 10) : 0
        })
      }
    } else {
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        info[line.substring(0, eqIdx)] = line.substring(eqIdx + 1)
      }
    }
  }
  return {
    projectName: info['ProjectName'] || '',
    outputType: info['OutputType'] || 'WindowsApp',
    platform: info['Platform'] || 'x64',
    files,
    projectDir: dirname(eppPath)
  }
}

// 获取控件的 Win32 类名
function getWin32ClassName(ctrlType: string): string {
  const map: Record<string, string> = {
    'Button': 'BUTTON', '按钮': 'BUTTON',
    'Label': 'STATIC', '标签': 'STATIC',
    'Edit': 'EDIT', '编辑框': 'EDIT',
    'TextBox': 'EDIT', '文本框': 'EDIT',
    'CheckBox': 'BUTTON', '复选框': 'BUTTON', '选择框': 'BUTTON',
    'RadioButton': 'BUTTON', '单选框': 'BUTTON',
    'ListBox': 'LISTBOX', '列表框': 'LISTBOX',
    'ListView': 'SysListView32', '列表视图': 'SysListView32',
    'TreeView': 'SysTreeView32', '树形框': 'SysTreeView32',
    'TabControl': 'SysTabControl32', '标签页': 'SysTabControl32',
    'ComboBox': 'COMBOBOX', '组合框': 'COMBOBOX',
    'SliderBar': 'msctls_trackbar32', '滑块条': 'msctls_trackbar32',
    'ScrollBar': 'SCROLLBAR', '滚动条': 'SCROLLBAR',
    'ProgressBar': 'msctls_progress32', '进度条': 'msctls_progress32',
    'GroupBox': 'BUTTON', '分组框': 'BUTTON',
    '图片框': 'STATIC',
    'ycUI按钮': 'ycButton',
  }
  return map[ctrlType] || 'STATIC'
}

// 获取控件的 Win32 样式（不含 WS_VISIBLE，由外层 visFlag 控制）
function getWin32Style(ctrlType: string): string {
  const map: Record<string, string> = {
    'Button': 'WS_CHILD | BS_PUSHBUTTON',
    '按钮': 'WS_CHILD | BS_PUSHBUTTON',
    'Label': 'WS_CHILD | SS_LEFT',
    '标签': 'WS_CHILD | SS_LEFT',
    'Edit': 'WS_CHILD | WS_BORDER | ES_AUTOHSCROLL',
    '编辑框': 'WS_CHILD | WS_BORDER | ES_AUTOHSCROLL',
    'TextBox': 'WS_CHILD | WS_BORDER | ES_AUTOHSCROLL',
    '文本框': 'WS_CHILD | WS_BORDER | ES_AUTOHSCROLL',
    'CheckBox': 'WS_CHILD | BS_AUTOCHECKBOX',
    '复选框': 'WS_CHILD | BS_AUTOCHECKBOX',
    '选择框': 'WS_CHILD | BS_AUTOCHECKBOX',
    'ListBox': 'WS_CHILD | WS_BORDER | WS_VSCROLL | LBS_NOTIFY',
    '列表框': 'WS_CHILD | WS_BORDER | WS_VSCROLL | LBS_NOTIFY',
    'ListView': 'WS_CHILD | WS_BORDER | LVS_REPORT',
    '列表视图': 'WS_CHILD | WS_BORDER | LVS_REPORT',
    'TreeView': 'WS_CHILD | WS_BORDER | TVS_HASLINES | TVS_LINESATROOT | TVS_HASBUTTONS',
    '树形框': 'WS_CHILD | WS_BORDER | TVS_HASLINES | TVS_LINESATROOT | TVS_HASBUTTONS',
    'TabControl': 'WS_CHILD | WS_CLIPSIBLINGS',
    '标签页': 'WS_CHILD | WS_CLIPSIBLINGS',
    'ComboBox': 'WS_CHILD | CBS_DROPDOWNLIST | WS_VSCROLL',
    '组合框': 'WS_CHILD | CBS_DROPDOWNLIST | WS_VSCROLL',
    'SliderBar': 'WS_CHILD | TBS_AUTOTICKS',
    '滑块条': 'WS_CHILD | TBS_AUTOTICKS',
    'ScrollBar': 'WS_CHILD | SBS_HORZ',
    '滚动条': 'WS_CHILD | SBS_HORZ',
    'ProgressBar': 'WS_CHILD',
    '进度条': 'WS_CHILD',
    'GroupBox': 'WS_CHILD | BS_GROUPBOX',
    '分组框': 'WS_CHILD | BS_GROUPBOX',
    '图片框': 'WS_CHILD | SS_LEFT',
    'ycUI按钮': 'WS_CHILD',
  }
  return map[ctrlType] || 'WS_CHILD | SS_LEFT'
}

function resolveCommandNotifyCode(className: string, eventName: string): string | null {
  const cls = (className || '').toUpperCase()
  const ev = (eventName || '').replace(/\s+/g, '')

  const isClick = ev.includes('被单击') || ev === '单击' || ev === '点击'
  const isDblClick = ev.includes('双击')
  const isTextChange = ev.includes('内容被改变') || ev.includes('内容改变') || ev.includes('文本被改变') || ev.includes('文本改变')
  const isSelectChange = ev.includes('选择项被改变') || ev.includes('选择被改变') || ev.includes('选中项被改变') || ev.includes('选中被改变')
  const isFocus = ev.includes('得到焦点')
  const isBlur = ev.includes('失去焦点')

  if (isClick) {
    if (cls === 'BUTTON' || cls === 'YCBUTTON') return 'BN_CLICKED'
    if (cls === 'STATIC') return 'STN_CLICKED'
  }
  if (isDblClick) {
    if (cls === 'BUTTON' || cls === 'YCBUTTON') return 'BN_DBLCLK'
    if (cls === 'STATIC') return 'STN_DBLCLK'
    if (cls === 'LISTBOX') return 'LBN_DBLCLK'
  }
  if (isTextChange) {
    if (cls === 'EDIT') return 'EN_CHANGE'
    if (cls === 'COMBOBOX') return 'CBN_EDITCHANGE'
  }
  if (isSelectChange) {
    if (cls === 'LISTBOX') return 'LBN_SELCHANGE'
    if (cls === 'COMBOBOX') return 'CBN_SELCHANGE'
  }
  if (isFocus) {
    if (cls === 'EDIT') return 'EN_SETFOCUS'
    if (cls === 'LISTBOX') return 'LBN_SETFOCUS'
    if (cls === 'COMBOBOX') return 'CBN_SETFOCUS'
    if (cls === 'BUTTON' || cls === 'YCBUTTON') return 'BN_SETFOCUS'
  }
  if (isBlur) {
    if (cls === 'EDIT') return 'EN_KILLFOCUS'
    if (cls === 'LISTBOX') return 'LBN_KILLFOCUS'
    if (cls === 'COMBOBOX') return 'CBN_KILLFOCUS'
    if (cls === 'BUTTON' || cls === 'YCBUTTON') return 'BN_KILLFOCUS'
  }

  return null
}

function resolveNotifyCode(className: string, eventName: string): string | null {
  const cls = (className || '').toUpperCase()
  const ev = (eventName || '').replace(/\s+/g, '')

  const isClick = ev.includes('被单击') || ev === '单击' || ev === '点击'
  const isDblClick = ev.includes('双击')
  const isSelectChange = ev.includes('选择项被改变') || ev.includes('选择被改变') || ev.includes('选中项被改变') || ev.includes('选中被改变')
  const isItemActivate = ev.includes('项被激活') || ev.includes('激活项')
  const isLabelBegin = ev.includes('开始标签编辑') || ev.includes('开始编辑标签')
  const isLabelEnd = ev.includes('结束标签编辑') || ev.includes('标签编辑结束')
  const isExpandCollapse = ev.includes('展开') || ev.includes('折叠')
  const isCustomDraw = ev.includes('自定义绘制') || ev.includes('绘制')

  if (cls === 'SYSLISTVIEW32') {
    if (isClick) return 'NM_CLICK'
    if (isDblClick) return 'NM_DBLCLK'
    if (isSelectChange) return 'LVN_ITEMCHANGED'
    if (isItemActivate) return 'LVN_ITEMACTIVATE'
    if (isLabelBegin) return 'LVN_BEGINLABELEDIT'
    if (isLabelEnd) return 'LVN_ENDLABELEDIT'
    if (isCustomDraw) return 'NM_CUSTOMDRAW'
  }

  if (cls === 'SYSTREEVIEW32') {
    if (isClick) return 'NM_CLICK'
    if (isDblClick) return 'NM_DBLCLK'
    if (isSelectChange) return 'TVN_SELCHANGED'
    if (isLabelBegin) return 'TVN_BEGINLABELEDIT'
    if (isLabelEnd) return 'TVN_ENDLABELEDIT'
    if (isExpandCollapse) return 'TVN_ITEMEXPANDED'
    if (isCustomDraw) return 'NM_CUSTOMDRAW'
  }

  if (cls === 'SYSTABCONTROL32') {
    if (isSelectChange) return 'TCN_SELCHANGE'
    if (isClick) return 'NM_CLICK'
    if (isDblClick) return 'NM_DBLCLK'
  }

  return null
}

function resolveScrollMessage(className: string, eventName: string): 'WM_HSCROLL' | 'WM_VSCROLL' | null {
  const cls = (className || '').toUpperCase()
  const ev = (eventName || '').replace(/\s+/g, '')
  const isScrollLike = ev.includes('滚动') || ev.includes('位置') || ev.includes('值被改变') || ev.includes('值改变')
  if (!isScrollLike) return null

  if (cls === 'MSCTLS_TRACKBAR32') return 'WM_HSCROLL'
  if (cls === 'SCROLLBAR') return 'WM_HSCROLL'
  return null
}

function normalizeKey(text: string): string {
  return (text || '').replace(/\s+/g, '').toLowerCase()
}

function parseEventBindingsFromProtocol(content: string, libName: string): NormalizedEventBinding[] {
  let json: LibraryCompileProtocol
  try {
    json = JSON.parse(content) as LibraryCompileProtocol
  } catch {
    return []
  }

  if (!json || !Array.isArray(json.eventBindings)) return []

  const result: NormalizedEventBinding[] = []
  for (const item of json.eventBindings) {
    if (!item || typeof item !== 'object') continue
    const channel = item.channel
    if (!channel || !['WM_COMMAND', 'WM_NOTIFY', 'WM_HSCROLL', 'WM_VSCROLL'].includes(channel)) continue

    const unit = normalizeKey(item.unit || '')
    const event = normalizeKey(item.event || '')
    if (!unit || !event) continue

    const normalized: NormalizedEventBinding = {
      library: normalizeKey(item.library || libName),
      unit,
      unitEnglishName: normalizeKey(item.unitEnglishName || ''),
      event,
      channel,
      code: (item.code || '').trim(),
    }

    // WM_COMMAND / WM_NOTIFY 需要通知码，滚动消息不需要。
    if ((channel === 'WM_COMMAND' || channel === 'WM_NOTIFY') && !normalized.code) continue
    result.push(normalized)
  }
  return result
}

function loadEventBindingProtocols(): NormalizedEventBinding[] {
  const bindings: NormalizedEventBinding[] = []
  const libs = libraryManager.getList().filter(l => l.loaded)

  for (const lib of libs) {
    const dir = dirname(lib.filePath)
    const candidates = [
      join(dir, `${lib.name}.events.json`),
      join(dir, `${lib.name}.protocol.json`),
      join(dir, `${lib.name}.compile-protocol.json`),
    ]

    for (const p of candidates) {
      if (!existsSync(p)) continue
      try {
        const content = readFileSync(p, 'utf-8')
        const parsed = parseEventBindingsFromProtocol(content, lib.name)
        if (parsed.length > 0) {
          bindings.push(...parsed)
          sendMessage({ type: 'info', text: `已加载支持库事件协议: ${basename(p)} (${parsed.length} 条)` })
        }
      } catch {
        sendMessage({ type: 'warning', text: `警告: 读取支持库事件协议失败: ${p}` })
      }
      break
    }
  }

  return bindings
}

function resolveEventByProtocol(
  bindings: NormalizedEventBinding[],
  libraryFileName: string,
  unitName: string,
  unitEnglishName: string,
  eventName: string,
): { channel: EventChannel; code: string } | null {
  if (bindings.length === 0) return null

  const lib = normalizeKey(libraryFileName)
  const unit = normalizeKey(unitName)
  const unitEn = normalizeKey(unitEnglishName)
  const event = normalizeKey(eventName)
  if (!event) return null

  for (const b of bindings) {
    if (b.library && b.library !== lib) continue
    const unitMatch = b.unit === unit || (!!b.unitEnglishName && b.unitEnglishName === unitEn)
    if (!unitMatch || b.event !== event) continue
    return { channel: b.channel, code: b.code }
  }
  return null
}

// 解析窗口文件
function parseWindowFile(efwPath: string): WindowFileInfo {
  const info: WindowFileInfo = { width: 592, height: 384, title: '窗口', visible: true, disabled: false, border: 2, maxButton: true, minButton: true, controlBox: true, topmost: false, startPos: 1, controls: [] }
  if (!existsSync(efwPath)) return info
  try {
    const data = JSON.parse(readFileSync(efwPath, 'utf-8'))
    info.width = data.formWidth || data.width || 592
    info.height = data.formHeight || data.height || 384
    info.title = data.formTitle || data.title || data.name || '窗口'
    const p = data.properties || {}
    if (p['可视'] === false) info.visible = false
    if (p['禁止'] === true) info.disabled = true
    if (typeof p['边框'] === 'number') info.border = p['边框']
    if (p['最大化按鈕'] === false) info.maxButton = false
    if (p['最小化按鈕'] === false) info.minButton = false
    if (p['控制按鈕'] === false) info.controlBox = false
    if (p['总在最前'] === true) info.topmost = true
    if (typeof p['位置'] === 'number') info.startPos = p['位置']
    if (Array.isArray(data.controls)) {
      for (const c of data.controls) {
        const props = c.properties || {}
        info.controls.push({
          type: c.type || '',
          name: c.name || '',
          x: c.x ?? c.left ?? 0,
          y: c.y ?? c.top ?? 0,
          width: c.width ?? 80,
          height: c.height ?? 24,
          text: props['标题'] || props['内容'] || props['文本'] || props['title'] || props['text'] || c.text || c.name || '',
          visible: c.visible ?? true,
          disabled: c.enabled === false || props['禁止'] === true,
          extraProps: { ...props },
        })
      }
    }
  } catch { /* ignore */ }
  return info
}

// 易语言数据类型 → C 类型
function mapTypeToCType(type: string): string {
  const map: Record<string, string> = {
    '整数型': 'int', '长整数型': 'long long', '小数型': 'float',
    '双精度小数型': 'double', '文本型': 'wchar_t*', '逻辑型': 'int',
    '字节型': 'unsigned char', '短整数型': 'short',
  }
  return map[type] || 'int'
}

function splitDeclParts(text: string): string[] {
  return text.split(/[\uFF0C,]/).map(s => s.trim())
}

function parseGlobalVarDeclarations(content: string): GlobalVarDef[] {
  const vars: GlobalVarDef[] = []
  const lines = content.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.replace(/[\u200B\u200C\u200D\u2060]/g, '').trim()
    if (!line.startsWith('.全局变量 ')) continue
    const parts = splitDeclParts(line.substring(5))
    const name = parts[0] || ''
    const type = parts[1] || '整数型'
    if (!name) continue
    vars.push({ name, type })
  }
  return vars
}

function parseConstantDeclarations(content: string): ConstantDef[] {
  const constants: ConstantDef[] = []
  const lines = content.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.replace(/[\u200B\u200C\u200D\u2060]/g, '').trim()
    if (!line.startsWith('.常量 ')) continue
    const parts = splitDeclParts(line.substring(3))
    const name = parts[0] || ''
    const value = parts[1] || '0'
    if (!name) continue
    constants.push({ name, value })
  }
  return constants
}

function collectProjectGlobalVars(project: ProjectInfo, editorFiles?: Map<string, string>): GlobalVarDef[] {
  const result: GlobalVarDef[] = []
  const seen = new Set<string>()

  for (const f of project.files) {
    if (f.type !== 'EYC' && f.type !== 'EGV' && f.type !== 'ECS' && f.type !== 'EDT' && f.type !== 'ELL') continue
    const sourcePath = join(project.projectDir, f.fileName)
    const editorContent = editorFiles?.get(f.fileName)
    const content = editorContent || (existsSync(sourcePath) ? readFileSync(sourcePath, 'utf-8') : '')
    if (!content) continue

    const vars = parseGlobalVarDeclarations(content)
    for (const v of vars) {
      if (seen.has(v.name)) continue
      seen.add(v.name)
      result.push(v)
    }
  }

  return result
}

function collectProjectConstants(project: ProjectInfo, editorFiles?: Map<string, string>): ConstantDef[] {
  const result: ConstantDef[] = []
  const seen = new Set<string>()

  for (const f of project.files) {
    if (f.type !== 'EYC' && f.type !== 'EGV' && f.type !== 'ECS' && f.type !== 'EDT' && f.type !== 'ELL') continue
    const sourcePath = join(project.projectDir, f.fileName)
    const editorContent = editorFiles?.get(f.fileName)
    const content = editorContent || (existsSync(sourcePath) ? readFileSync(sourcePath, 'utf-8') : '')
    if (!content) continue

    const constants = parseConstantDeclarations(content)
    for (const c of constants) {
      if (seen.has(c.name)) continue
      seen.add(c.name)
      result.push(c)
    }
  }

  return result
}

function collectLibraryConstants(): LibraryConstantDef[] {
  const result: LibraryConstantDef[] = []
  const seen = new Set<string>()

  for (const lib of libraryManager.getLoadedLibraryFiles()) {
    const info = libraryManager.getLibInfo(lib.name)
    const constants = (info?.constants || []) as LibConstant[]
    for (const c of constants) {
      const name = (c.name || '').trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      result.push({
        name,
        value: (c.value || '').trim(),
        type: c.type || 'null',
      })
    }
  }

  return result
}

function escapeCString(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

function toCLibraryConstantValue(c: LibraryConstantDef): string {
  if (c.type === 'text') return `L"${escapeCString(c.value)}"`
  if (c.type === 'bool') return (c.value === '真' || c.value === '1') ? '1' : '0'
  if (c.type === 'number') return c.value || '0'
  return '0'
}

// ========== 基于支持库的命令解析系统 ==========

// 从已加载的支持库构建命令查找表
// 命令名 → 支持库命令信息（来源完全由 .fne 决定，不硬编码归属）
function buildCommandMap(): Map<string, LibCommand & { libraryName: string }> {
  const map = new Map<string, LibCommand & { libraryName: string }>()
  const allCommands = libraryManager.getAllCommands()

  for (const cmd of allCommands) {
    if (cmd.isHidden) continue
    // 同名命令后加载的覆盖先加载的（与自动补全行为一致）
    map.set(cmd.name, cmd)
  }
  return map
}

// 将全角运算符转换为C运算符
function convertFullWidthOps(expr: string): string {
  return expr
    .replace(/≠/g, '!=')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/＝/g, '==')
    .replace(/＜/g, '<')
    .replace(/＞/g, '>')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
}

function replaceConstantRefs(expr: string): string {
  return expr.replace(/#([\u4e00-\u9fa5A-Za-z_][\u4e00-\u9fa5A-Za-z0-9_.]*)/g, '$1')
}

// 从行中提取命令名称（括号或空格之前的部分）
function extractCommandName(line: string): string {
  let end = line.length
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === ' ' || ch === '(' || ch === '\uff08' || ch === '\t') {
      end = i
      break
    }
  }
  return line.substring(0, end)
}

// 解析命令调用行，提取名称和参数
function parseCommandCall(line: string): { name: string; args: string[] } | null {
  const trimmed = line.trim()
  // 查找第一个括号（中文或英文）
  let openIdx = -1
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '(' || ch === '\uff08') {
      openIdx = i
      break
    }
  }

  if (openIdx < 0) {
    // 没有括号 - 无参数的命令调用
    return { name: trimmed, args: [] }
  }

  const name = trimmed.substring(0, openIdx).trim()
  if (!name) return null

  // 查找匹配的右括号
  let depth = 1
  let closeIdx = -1
  for (let i = openIdx + 1; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '(' || ch === '\uff08') depth++
    else if (ch === ')' || ch === '\uff09') {
      depth--
      if (depth === 0) { closeIdx = i; break }
    }
  }

  if (closeIdx < 0) return null

  const argsStr = trimmed.substring(openIdx + 1, closeIdx)
  const args = splitArguments(argsStr)
  return { name, args }
}

// 分割参数列表（处理嵌套括号和字符串字面量）
function splitArguments(argsStr: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i]
    if (inString) {
      current += ch
      if ((stringChar === '"' && ch === '"') || (stringChar === '\u201c' && ch === '\u201d')) {
        inString = false
      }
      continue
    }
    if (ch === '"' || ch === '\u201c') {
      inString = true
      stringChar = ch
      current += ch
      continue
    }
    if (ch === '(' || ch === '\uff08') { depth++; current += ch; continue }
    if (ch === ')' || ch === '\uff09') { depth--; current += ch; continue }

    if ((ch === ',' || ch === '\uff0c') && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }

  if (current.trim()) args.push(current.trim())
  return args
}

// 将易语言参数格式化为C语言参数
function formatArgForC(arg: string): string {
  if (!arg) return '0'
  const trimmed = arg.trim()
  // 中文引号字符串 → C宽字符串
  const chineseStrMatch = trimmed.match(/^\u201c(.*)\u201d$/)
  if (chineseStrMatch) {
    const content = chineseStrMatch[1].replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `L"${content}"`
  }
  // 英文引号字符串 → C宽字符串
  const englishStrMatch = trimmed.match(/^"(.*)"$/)
  if (englishStrMatch) {
    const content = englishStrMatch[1].replace(/\\/g, '\\\\')
    return `L"${content}"`
  }
  // 布尔值
  if (trimmed === '真') return '1'
  if (trimmed === '假') return '0'
  // 数值直接传递
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  // 变量名或表达式：转换全角运算符
  return replaceConstantRefs(convertFullWidthOps(trimmed))
}

// 命令 → C代码生成器（直接按命令名索引，不按库名分组）
// 命令属于哪个支持库由 buildCommandMap() 从 .fne 自动获取
// 这里只定义命令的C代码翻译规则
type CommandCodeGenerator = (args: string[]) => string

const COMMAND_CODE_GENERATORS: Record<string, CommandCodeGenerator> = {
  '信息框': (args) => {
    const msg = formatArgForC(args[0] || '')
    const flags = args[1] || '0'
    const title = args.length > 2 ? formatArgForC(args[2]) : 'L"提示"'
    return `MessageBoxW(NULL, ${msg}, ${title}, ${flags});`
  },
  '标准输出': (args) => {
    const arg = args[0] || ''
    if (/^[\u201c"]/.test(arg)) {
      // 使用窄字符串 printf：exec-charset=utf-8 保证字节为 UTF-8，管道侧按 UTF-8 解读
      const narrowArg = formatArgForC(arg).replace(/^L/, '')
      return `printf("%s\\n", ${narrowArg});`
    }
    return `printf("%lld\\n", (long long)(${formatArgForC(arg)}));`
  },
  '调试输出': (args) => {
    const arg = args[0] || ''
    if (/^[\u201c"]/.test(arg)) {
      const narrowArg = formatArgForC(arg).replace(/^L/, '')
      return `printf("%s\\n", ${narrowArg});`
    }
    return `printf("%lld\\n", (long long)(${arg}));`
  },
  '输出调试文本': (args) => {
    return COMMAND_CODE_GENERATORS['调试输出'](args)
  },
}

// 为支持库命令生成C代码
function generateCCodeForCommand(cmd: LibCommand & { libraryName: string }, args: string[]): string {
  // 查找已注册的代码生成器
  const generator = COMMAND_CODE_GENERATORS[cmd.name]
  if (generator) {
    return generator(args)
  }

  // 没有已注册的生成器：暂时生成注释占位，后续接入支持库的实际调用机制
  const funcName = cmd.englishName || cmd.name
  const cArgs = args.map(a => formatArgForC(a)).join(', ')
  return `/* TODO: ${cmd.libraryName}.${cmd.name}(${funcName}) 尚未实现C代码生成 */ (void)0;`
}

// .eyc 转 C 代码转译器
// 将易语言源代码中的子程序转译成 C 函数
// 命令识别基于已加载的支持库，支持第三方支持库扩展
function transpileEycContent(eycContent: string, fileName: string, projectGlobals: GlobalVarDef[] = [], projectConstants: ConstantDef[] = [], libraryConstants: LibraryConstantDef[] = []): string {
  // 从已加载的支持库构建命令查找表
  const commandMap = buildCommandMap()
  const isClassModuleSource = /\.ecc$/i.test(fileName)

  const lines = eycContent.split('\n')
  let result = `/* 由 ycIDE 自动从 ${fileName} 生成 */\n`
  result += '#include <windows.h>\n#include <stdio.h>\n#include <stdint.h>\n\n'

  if (projectGlobals.length > 0) {
    result += '/* 项目全局变量声明 */\n'
    for (const gv of projectGlobals) {
      result += `extern ${mapTypeToCType(gv.type)} ${gv.name};\n`
    }
    result += '\n'
  }

  if (libraryConstants.length > 0) {
    result += '/* 支持库常量定义 */\n'
    for (const c of libraryConstants) {
      result += `#define ${c.name} (${toCLibraryConstantValue(c)})\n`
    }
    result += '\n'
  }

  if (projectConstants.length > 0) {
    result += '/* 项目常量定义 */\n'
    for (const c of projectConstants) {
      const cValue = replaceConstantRefs(convertFullWidthOps((c.value || '0').trim() || '0'))
      if (libraryConstants.some(lc => lc.name === c.name)) {
        result += `#undef ${c.name}\n`
      }
      result += `#define ${c.name} (${cValue})\n`
    }
    result += '\n'
  }

  // ---- 第一遍：收集并输出 自定义数据类型 ----
  {
    let inDataType = false
    let structName = ''
    let structFields = ''
    for (const rawLine of lines) {
      const line = rawLine.replace(/[\u200B\u200C\u200D\u2060]/g, '').trim()
      if (line.startsWith('.数据类型 ')) {
        // 保存上一个结构体
        if (inDataType && structName) {
          result += `struct ${structName} {\n${structFields}};\n\n`
        }
        const parts = line.substring(5).split(',').map(s => s.trim())
        structName = parts[0] || 'UnknownType'
        structFields = ''
        inDataType = true
        continue
      }
      if (inDataType) {
        // 遇到新的块（子程序/程序集/版本）则结束当前结构体
        if (line.startsWith('.子程序 ') || line.startsWith('.程序集') || line.startsWith('.版本')) {
          result += `struct ${structName} {\n${structFields}};\n\n`
          inDataType = false
          structName = ''
          structFields = ''
          continue
        }
        if (line.startsWith('.成员 ')) {
          const parts = line.substring(3).split(',').map(s => s.trim())
          const fieldName = parts[0] || 'field'
          const fieldType = parts[1] || '整数型'
          structFields += `    ${mapTypeToCType(fieldType)} ${fieldName};\n`
        }
        // 其他行（注释等）跳过
      }
    }
    // 最后一个结构体
    if (inDataType && structName) {
      result += `struct ${structName} {\n${structFields}};\n\n`
    }
  }

  let inSub = false
  let subName = ''
  let subParams: Array<{ name: string; type: string }> = []
  let subBody = ''
  let blockIndent = 1
  let loopTempIndex = 0

  const buildSubSignature = (name: string, params: Array<{ name: string; type: string }>): string => {
    if (params.length === 0) return 'void'
    return params.map(p => `${mapTypeToCType(p.type)} ${p.name}`).join(', ')
  }

  const emitSubLine = (code: string) => {
    subBody += `${'    '.repeat(Math.max(1, blockIndent))}${code}\n`
  }

  for (const rawLine of lines) {
    // 剥离流程标记零宽字符（\u200C/\u200D/\u2060/\u200B）
    const line = rawLine.replace(/[\u200B\u200C\u200D\u2060]/g, '').trim()
    if (line.startsWith('.版本') || line.startsWith('.程序集') || line === '') continue

    if (line.startsWith('.子程序 ')) {
      // 如果之前有子程序，先输出
      if (inSub && subName) {
        const storage = isClassModuleSource ? 'static ' : ''
        result += `${storage}void ${subName}(${buildSubSignature(subName, subParams)}) {\n${subBody}}\n\n`
      }
      const parts = line.substring(4).split(',').map(s => s.trim())
      subName = parts[0] || 'unnamed'
      subParams = []
      subBody = ''
      blockIndent = 1
      inSub = true
      continue
    }

    if (inSub && line.startsWith('.参数 ')) {
      const parts = splitDeclParts(line.substring(3))
      const paramName = (parts[0] || '').trim()
      const paramType = (parts[1] || '整数型').trim()
      if (paramName) subParams.push({ name: paramName, type: paramType })
      continue
    }

    if (line.startsWith('.局部变量 ')) {
      const parts = splitDeclParts(line.substring(5))
      const varName = parts[0] || 'v'
      const varType = parts[1] || '整数型'
      emitSubLine(`${mapTypeToCType(varType)} ${varName};`)
      continue
    }

    if (!inSub && line.startsWith('.全局变量 ')) {
      const parts = splitDeclParts(line.substring(5))
      const varName = parts[0] || 'g'
      const varType = parts[1] || '整数型'
      result += `${mapTypeToCType(varType)} ${varName};\n`
      continue
    }

    if (inSub) {
      // 声明行跳过
      if (line.startsWith('.参数 ') || line.startsWith('.支持库 ')) {
        continue
      }

      // 流程控制语句
      if (line.startsWith('.')) {
        const flowCall = parseCommandCall(line.substring(1).trim())
        const flowName = flowCall?.name || ''

        if (flowName === '如果' || flowName === '如果真' || flowName === '判断') {
          const cond = formatArgForC(flowCall?.args?.[0] || '0')
          emitSubLine(`if (${cond}) {`)
          blockIndent++
          continue
        }

        if (flowName === '否则' || flowName === '默认') {
          blockIndent = Math.max(1, blockIndent - 1)
          emitSubLine('} else {')
          blockIndent++
          continue
        }

        if (flowName === '如果结束' || flowName === '如果真结束' || flowName === '判断结束') {
          blockIndent = Math.max(1, blockIndent - 1)
          emitSubLine('}')
          continue
        }

        if (flowName === '计次循环首') {
          const countExpr = formatArgForC(flowCall?.args?.[0] || '0')
          const userVar = (flowCall?.args?.[1] || '').trim()
          // C++ 允许在 for 内部声明循环变量，避免重复声明问题
          const loopVar = userVar || `__loop_${loopTempIndex++}`
          const initDecl = userVar ? `${userVar} = 1` : `int64_t ${loopVar} = 1`
          emitSubLine(`for (${initDecl}; ${loopVar} <= (${countExpr}); ${loopVar}++) {`)
          blockIndent++
          continue
        }

        if (flowName === '计次循环尾') {
          blockIndent = Math.max(1, blockIndent - 1)
          emitSubLine('}')
          continue
        }
      }

      // 注释行
      if (line.startsWith("'")) {
        emitSubLine(`/* ${line.slice(1).trim()} */`)
        continue
      }

      // 赋值表达式：variable ＝ expr（全角等号）
      const assignMatch = line.match(/^([\u4e00-\u9fa5A-Za-z_][\u4e00-\u9fa5A-Za-z0-9_.]*)\s*＝\s*(.+)$/)
      if (assignMatch) {
        const varName = assignMatch[1]
        const expr = replaceConstantRefs(convertFullWidthOps(assignMatch[2]))
        emitSubLine(`${varName} = ${expr};`)
        continue
      }

      const callableLine = line.startsWith('.') ? line.substring(1).trim() : line

      // 提取命令名并在支持库中查找
      const cmdName = extractCommandName(callableLine)
      const resolved = commandMap.get(cmdName)

      if (resolved) {
        // 命令在支持库中找到 - 解析参数并生成C代码
        const call = parseCommandCall(callableLine)
        const args = call ? call.args : []
        const cCode = generateCCodeForCommand(resolved, args)
        emitSubLine(cCode)
      } else {
        // 非支持库命令 - 尝试作为用户自定义子程序调用
        const call = parseCommandCall(callableLine)
        if (call && call.name) {
          const cArgs = call.args.map(a => formatArgForC(a)).join(', ')
          emitSubLine(`${call.name}(${cArgs});`)
        } else {
          emitSubLine(`/* ${line} */`)
        }
      }
    }
  }

  // 输出最后一个子程序
  if (inSub && subName) {
    const storage = isClassModuleSource ? 'static ' : ''
    result += `${storage}void ${subName}(${buildSubSignature(subName, subParams)}) {\n${subBody}}\n\n`
  }

  return result
}

// 生成 main.cpp 入口文件
function generateMainC(project: ProjectInfo, tempDir: string, editorFiles?: Map<string, string>, linkMode: string = 'normal'): string[] {
  const mainCPath = join(tempDir, 'main.cpp')
  const additionalCFiles: string[] = []

  let mainCode = '/* 由 ycIDE 自动生成 */\n'
  mainCode += `/* 项目名称: ${project.projectName} */\n\n`
  mainCode += '#include <windows.h>\n#include <commctrl.h>\n#include <stdint.h>\n#include <stdio.h>\n#include <io.h>\n#include <fcntl.h>\n\n'

  const isWindowsApp = project.outputType === 'WindowsApp'
  const projectGlobals = collectProjectGlobalVars(project, editorFiles)
  const projectConstants = collectProjectConstants(project, editorFiles)
  const libraryConstants = collectLibraryConstants()

  if (isWindowsApp) {
    // 查找启动窗口文件
    let efwFile = project.files.find(f => f.fileName === '_启动窗口.efw')
    if (!efwFile) efwFile = project.files.find(f => f.type === 'EFW')

    let winInfo: WindowFileInfo = { width: 592, height: 384, title: project.projectName, visible: true, disabled: false, border: 2, maxButton: true, minButton: true, controlBox: true, topmost: false, startPos: 1, controls: [] }
    if (efwFile) {
      // 优先从编辑器内存中获取
      const editorContent = editorFiles?.get(efwFile.fileName)
      if (editorContent) {
        try {
          const data = JSON.parse(editorContent)
          winInfo.width = data.width || 592
          winInfo.height = data.height || 384
          winInfo.title = data.title || data.name || project.projectName
          const p = data.properties || {}
          if (p['可视'] === false) winInfo.visible = false
          if (p['禁止'] === true) winInfo.disabled = true
          if (typeof p['边框'] === 'number') winInfo.border = p['边框']
          if (p['最大化按钮'] === false) winInfo.maxButton = false
          if (p['最小化按钮'] === false) winInfo.minButton = false
          if (p['控制按钮'] === false) winInfo.controlBox = false
          if (p['总在最前'] === true) winInfo.topmost = true
          if (typeof p['位置'] === 'number') winInfo.startPos = p['位置']
          if (Array.isArray(data.controls)) {
            for (const c of data.controls) {
              const props = c.properties || {}
              winInfo.controls.push({
                type: c.type || '', name: c.name || '',
                x: c.x ?? c.left ?? 0, y: c.y ?? c.top ?? 0,
                width: c.width ?? 80, height: c.height ?? 24,
                text: props['标题'] || props['内容'] || props['文本'] || c.text || c.name || '',
                visible: c.visible ?? true,
                disabled: c.enabled === false || props['禁止'] === true,
                extraProps: { ...props },
              })
            }
          }
        } catch { /* fall through to file */ }
      } else {
        winInfo = parseWindowFile(join(project.projectDir, efwFile.fileName))
      }
    }

    // 全局变量
    mainCode += 'static const wchar_t* g_szClassName = L"ycIDEWindowClass";\n'
    mainCode += `static const wchar_t* g_szTitle = L"${winInfo.title}";\n`
    mainCode += `static int g_nWidth = ${winInfo.width};\n`
    mainCode += `static int g_nHeight = ${winInfo.height};\n`
    mainCode += 'static HINSTANCE g_hInstance;\n\n'
    // 在全局区生成窗口组件库初始化函数的 extern "C" 声明（仅静态编译模式，跳过系统核心库）
    {
      const arch = project.platform === 'x86' ? 'x86' : 'x64'
      for (const lib of libraryManager.getLoadedLibraryFiles()) {
        if (libraryManager.isCore(lib.name)) continue
        const info = libraryManager.getLibInfo(lib.name)
        if (!info || !info.windowUnits || info.windowUnits.length === 0) continue
        if (linkMode !== 'static') continue  // 普通编译走 .fne 动态加载，不需要声明
        const staticLib = libraryManager.findStaticLib(lib.name, arch)
        if (staticLib) {
          mainCode += `extern "C" BOOL ${lib.name}_Init(HINSTANCE);\n`
        }
      }
      mainCode += '\n'
    }

    // 控件ID
    if (winInfo.controls.length > 0) {
      mainCode += '/* 控件ID定义 */\n'
      let ctrlId = 1001
      for (const ctrl of winInfo.controls) {
        mainCode += `#define IDC_${ctrl.name.toUpperCase()} ${ctrlId++}\n`
      }
      mainCode += '\n'
    }

    // 前向声明 .eyc 中的子程序
    // 查找关联的 .eyc 文件并转译
    for (const f of project.files) {
      if (f.type !== 'EYC' && f.type !== 'EGV' && f.type !== 'ECS' && f.type !== 'EDT' && f.type !== 'ELL') continue
      const eycPath = join(project.projectDir, f.fileName)
      const editorContent = editorFiles?.get(f.fileName)
      const content = editorContent || (existsSync(eycPath) ? readFileSync(eycPath, 'utf-8') : '')
      if (!content) continue

      sendMessage({ type: 'info', text: `正在转换源文件: ${f.fileName}` })
      const cCode = transpileEycContent(content, f.fileName, projectGlobals, projectConstants, libraryConstants)
      const cFileName = f.fileName.replace(/\.(eyc|ecc|egv|ecs|edt|ell)$/i, '.cpp')
      const cFilePath = join(tempDir, cFileName)
      writeFileSync(cFilePath, cCode, 'utf-8')
      additionalCFiles.push(cFilePath)
      sendMessage({ type: 'info', text: `已生成: ${cFileName}` })
    }

    // 创建控件函数
    mainCode += '/* 创建所有控件 */\n'
    mainCode += 'void CreateControls(HWND hWndParent) {\n'
    mainCode += '    HFONT hFont = (HFONT)GetStockObject(DEFAULT_GUI_FONT);\n'
    mainCode += '    HWND hCtrl;\n'

    let ctrlId = 1001
    for (const ctrl of winInfo.controls) {
      const className = getWin32ClassName(ctrl.type)
      const baseStyle = getWin32Style(ctrl.type)
      const visFlag = ctrl.visible ? ' | WS_VISIBLE' : ''
      const disFlag = ctrl.disabled ? ' | WS_DISABLED' : ''
      const style = `${baseStyle}${visFlag}${disFlag}`
      const text = ctrl.text || ctrl.name
      mainCode += `    hCtrl = CreateWindowExW(0, L"${className}", L"${text}",\n`
      mainCode += `        ${style},\n`
      mainCode += `        ${ctrl.x}, ${ctrl.y}, ${ctrl.width}, ${ctrl.height},\n`
      mainCode += `        hWndParent, (HMENU)${ctrlId++}, g_hInstance, NULL);\n`
      mainCode += '    SendMessage(hCtrl, WM_SETFONT, (WPARAM)hFont, TRUE);\n'
      // 通用窗口组件属性：通过标准 WCM_SETPROP 协议 (WM_APP+1) 设置
      // wParam = 属性在 FNE 元数据中的声明索引，lParam = 属性值
      // 任何按此协议实现 WndProc 的第三方组件库均自动支持
      const unitInfo = libraryManager.getAllWindowUnits().find(u => u.name === ctrl.type || u.englishName === ctrl.type)
      if (unitInfo && Object.keys(ctrl.extraProps).length > 0) {
        for (let pi = 0; pi < unitInfo.properties.length; pi++) {
          const prop = unitInfo.properties[pi]
          const value = ctrl.extraProps[prop.name]
          if (value === undefined) continue
          if (prop.typeName === '文本型') continue  // 文本由 CreateWindowExW 第3参数处理
          let lparamCode: string
          if (prop.typeName === '逻辑型') {
            lparamCode = (value === true || value === '真') ? 'TRUE' : 'FALSE'
          } else {
            lparamCode = typeof value === 'number' ? String(value) : '0'
          }
          mainCode += `    SendMessage(hCtrl, WM_APP + 1, ${pi}, (LPARAM)${lparamCode});\n`
        }
      }
      mainCode += '\n'
    }
    mainCode += '}\n\n'

    // 弱链接事件处理函数
    type CommandEventBinding = { ctrlName: string; notifyCode: string; handlerName: string }
    type NotifyEventBinding = { ctrlName: string; notifyCode: string; handlerName: string }
    type ScrollEventBinding = { ctrlName: string; message: 'WM_HSCROLL' | 'WM_VSCROLL'; handlerName: string }
    const commandEventBindings: CommandEventBinding[] = []
    const notifyEventBindings: NotifyEventBinding[] = []
    const scrollEventBindings: ScrollEventBinding[] = []
    const allUnits = libraryManager.getAllWindowUnits()
    const protocolBindings = loadEventBindingProtocols()
    const unresolvedEvents = new Set<string>()
    const loadedLibs = libraryManager.getList().filter(l => l.loaded)
    const libNameToFileName = new Map<string, string>()
    for (const lib of loadedLibs) {
      libNameToFileName.set(normalizeKey(lib.libName || ''), lib.name)
      libNameToFileName.set(normalizeKey(lib.name), lib.name)
    }

    for (const ctrl of winInfo.controls) {
      const className = getWin32ClassName(ctrl.type)
      const unit = allUnits.find(u => u.name === ctrl.type || u.englishName === ctrl.type)
      const events = unit?.events || []
      const libraryFileName = unit ? (libNameToFileName.get(normalizeKey(unit.libraryName)) || '') : ''
      for (const ev of events) {
        const handlerName = `_${ctrl.name.replace(/^_+/, '')}_${ev.name}`
        const proto = resolveEventByProtocol(
          protocolBindings,
          libraryFileName,
          unit?.name || ctrl.type,
          unit?.englishName || '',
          ev.name,
        )

        if (proto) {
          if (proto.channel === 'WM_COMMAND') {
            commandEventBindings.push({ ctrlName: ctrl.name, notifyCode: proto.code, handlerName })
            continue
          }
          if (proto.channel === 'WM_NOTIFY') {
            notifyEventBindings.push({ ctrlName: ctrl.name, notifyCode: proto.code, handlerName })
            continue
          }
          if (proto.channel === 'WM_HSCROLL' || proto.channel === 'WM_VSCROLL') {
            scrollEventBindings.push({ ctrlName: ctrl.name, message: proto.channel, handlerName })
            continue
          }
        }

        const notifyCode = resolveCommandNotifyCode(className, ev.name)
        if (notifyCode) {
          commandEventBindings.push({ ctrlName: ctrl.name, notifyCode, handlerName })
          continue
        }
        const nmCode = resolveNotifyCode(className, ev.name)
        if (nmCode) {
          notifyEventBindings.push({ ctrlName: ctrl.name, notifyCode: nmCode, handlerName })
          continue
        }
        const scrollMsg = resolveScrollMessage(className, ev.name)
        if (scrollMsg) {
          scrollEventBindings.push({ ctrlName: ctrl.name, message: scrollMsg, handlerName })
          continue
        }

        const unresolvedKey = `${ctrl.type}:${ev.name}`
        if (!unresolvedEvents.has(unresolvedKey)) {
          unresolvedEvents.add(unresolvedKey)
          sendMessage({ type: 'warning', text: `未解析事件绑定: 组件「${ctrl.type}」事件「${ev.name}」，请在支持库协议中补充 eventBindings` })
        }
      }
    }

    mainCode += '/* 事件处理函数默认实现 */\n'
    mainCode += '#define WEAK_FUNC __attribute__((weak))\n'

    // 兼容历史按钮事件命名
    const isClickable = (t: string) => ['Button', '按钮', 'ycUI按钮'].includes(t)
    for (const ctrl of winInfo.controls) {
      if (isClickable(ctrl.type)) {
        mainCode += `WEAK_FUNC void ${ctrl.name}_被单击(void) { }\n`
        mainCode += `WEAK_FUNC void _${ctrl.name.replace(/^_+/, '')}_被单击(void) { ${ctrl.name}_被单击(); }\n`
      }
    }

    const declaredHandlers = new Set<string>()
    for (const b of commandEventBindings) {
      if (declaredHandlers.has(b.handlerName)) continue
      declaredHandlers.add(b.handlerName)
      mainCode += `WEAK_FUNC void ${b.handlerName}(void) { }\n`
    }
    for (const b of notifyEventBindings) {
      if (declaredHandlers.has(b.handlerName)) continue
      declaredHandlers.add(b.handlerName)
      mainCode += `WEAK_FUNC void ${b.handlerName}(void) { }\n`
    }
    for (const b of scrollEventBindings) {
      if (declaredHandlers.has(b.handlerName)) continue
      declaredHandlers.add(b.handlerName)
      mainCode += `WEAK_FUNC void ${b.handlerName}(void) { }\n`
    }

    mainCode += 'WEAK_FUNC void __启动窗口_创建完毕(void) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_按下某键(int 键代码, int 功能键状态) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_某键被放开(int 键代码, int 功能键状态) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_窗口尺寸被改变(int 宽度, int 高度) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_被移动(int 左边, int 顶边) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_被激活(int 激活状态) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_得到焦点(void) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_失去焦点(void) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_即将被销毁(void) { }\n'
    mainCode += 'WEAK_FUNC void __启动窗口_被销毁(void) { }\n'

    // 窗口过程
    mainCode += '/* 窗口过程函数 */\n'
    mainCode += 'LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {\n'
    mainCode += '    switch (message) {\n'
    mainCode += '    case WM_CREATE:\n'
    mainCode += '        CreateControls(hWnd);\n'
    mainCode += '        __启动窗口_创建完毕();\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_COMMAND: {\n'
    mainCode += '        int wmId = LOWORD(wParam);\n'
    mainCode += '        int wmEvent = HIWORD(wParam);\n'
    mainCode += '        switch (wmId) {\n'

    ctrlId = 1001
    for (const ctrl of winInfo.controls) {
      const bindings = commandEventBindings.filter(b => b.ctrlName === ctrl.name)
      const hasCompatClick = isClickable(ctrl.type)
      if (bindings.length > 0 || hasCompatClick) {
        mainCode += `        case IDC_${ctrl.name.toUpperCase()}:\n`
        if (hasCompatClick) {
          mainCode += '            if (wmEvent == BN_CLICKED) {\n'
          mainCode += `                _${ctrl.name.replace(/^_+/, '')}_被单击();\n`
          mainCode += '            }\n'
        }
        for (const b of bindings) {
          mainCode += `            if (wmEvent == ${b.notifyCode}) { ${b.handlerName}(); }\n`
        }
        mainCode += '            break;\n'
      }
      ctrlId++
    }

    mainCode += '        }\n'
    mainCode += '        break;\n'
    mainCode += '    }\n'
    mainCode += '    case WM_NOTIFY: {\n'
    mainCode += '        LPNMHDR pnm = (LPNMHDR)lParam;\n'
    mainCode += '        if (!pnm) break;\n'
    mainCode += '        switch ((int)pnm->idFrom) {\n'

    ctrlId = 1001
    for (const ctrl of winInfo.controls) {
      const bindings = notifyEventBindings.filter(b => b.ctrlName === ctrl.name)
      if (bindings.length > 0) {
        mainCode += `        case IDC_${ctrl.name.toUpperCase()}:\n`
        for (const b of bindings) {
          mainCode += `            if (pnm->code == ${b.notifyCode}) { ${b.handlerName}(); }\n`
        }
        mainCode += '            break;\n'
      }
      ctrlId++
    }

    mainCode += '        }\n'
    mainCode += '        break;\n'
    mainCode += '    }\n'
    mainCode += '    case WM_HSCROLL:\n'
    mainCode += '    case WM_VSCROLL: {\n'
    mainCode += '        HWND hScroll = (HWND)lParam;\n'
    mainCode += '        if (!hScroll) break;\n'
    mainCode += '        int sid = GetDlgCtrlID(hScroll);\n'
    mainCode += '        switch (sid) {\n'

    ctrlId = 1001
    for (const ctrl of winInfo.controls) {
      const bindings = scrollEventBindings.filter(b => b.ctrlName === ctrl.name)
      if (bindings.length > 0) {
        mainCode += `        case IDC_${ctrl.name.toUpperCase()}:\n`
        for (const b of bindings) {
          const cond = b.message === 'WM_HSCROLL' ? 'message == WM_HSCROLL' : 'message == WM_VSCROLL'
          mainCode += `            if (${cond}) { ${b.handlerName}(); }\n`
        }
        mainCode += '            break;\n'
      }
      ctrlId++
    }

    mainCode += '        default:\n'
    mainCode += '            break;\n'
    mainCode += '        }\n'
    mainCode += '        break;\n'
    mainCode += '    }\n'
    mainCode += '    case WM_PAINT: {\n'
    mainCode += '        PAINTSTRUCT ps;\n'
    mainCode += '        HDC hdc = BeginPaint(hWnd, &ps);\n'
    mainCode += '        EndPaint(hWnd, &ps);\n'
    mainCode += '        break;\n'
    mainCode += '    }\n'
    mainCode += '    case WM_KEYDOWN:\n'
    mainCode += '    case WM_SYSKEYDOWN:\n'
    mainCode += '        __启动窗口_按下某键((int)wParam, (int)lParam);\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_KEYUP:\n'
    mainCode += '    case WM_SYSKEYUP:\n'
    mainCode += '        __启动窗口_某键被放开((int)wParam, (int)lParam);\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_SIZE:\n'
    mainCode += '        __启动窗口_窗口尺寸被改变((int)LOWORD(lParam), (int)HIWORD(lParam));\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_MOVE:\n'
    mainCode += '        __启动窗口_被移动((int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam));\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_ACTIVATE:\n'
    mainCode += '        __启动窗口_被激活((int)LOWORD(wParam));\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_SETFOCUS:\n'
    mainCode += '        __启动窗口_得到焦点();\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_KILLFOCUS:\n'
    mainCode += '        __启动窗口_失去焦点();\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_CLOSE:\n'
    mainCode += '        __启动窗口_即将被销毁();\n'
    mainCode += '        DestroyWindow(hWnd);\n'
    mainCode += '        break;\n'
    mainCode += '    case WM_DESTROY:\n'
    mainCode += '        __启动窗口_被销毁();\n'
    mainCode += '        PostQuitMessage(0);\n'
    mainCode += '        break;\n'
    mainCode += '    default:\n'
    mainCode += '        return DefWindowProcW(hWnd, message, wParam, lParam);\n'
    mainCode += '    }\n'
    mainCode += '    return 0;\n'
    mainCode += '}\n\n'

    // WinMain
    mainCode += 'int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,\n'
    mainCode += '                   LPSTR lpCmdLine, int nCmdShow) {\n'
    mainCode += '    /* 重定向 stdout 到父进程管道（使调试输出可被 IDE 捕获） */\n'
    mainCode += '    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);\n'
    mainCode += '    if (hOut && hOut != INVALID_HANDLE_VALUE) {\n'
    mainCode += '        int fd = _open_osfhandle((intptr_t)hOut, _O_TEXT);\n'
    mainCode += '        if (fd >= 0) {\n'
    mainCode += '            FILE* fp = _fdopen(fd, "w");\n'
    mainCode += '            if (fp) { *stdout = *fp; setvbuf(stdout, NULL, _IONBF, 0); }\n'
    mainCode += '        }\n'
    mainCode += '    }\n'
    mainCode += '    g_hInstance = hInstance;\n'
    // 初始化有窗口组件的支持库（跳过系统核心库）
    {
      const arch = project.platform === 'x86' ? 'x86' : 'x64'
      for (const lib of libraryManager.getLoadedLibraryFiles()) {
        if (libraryManager.isCore(lib.name)) continue
        const info = libraryManager.getLibInfo(lib.name)
        if (!info || !info.windowUnits || info.windowUnits.length === 0) continue
        const staticLib = libraryManager.findStaticLib(lib.name, arch)
        if (linkMode === 'static' && staticLib) {
          // 静态编译：直接调用（声明已在全局区生成）
          mainCode += `    ${lib.name}_Init(hInstance);\n`
        } else {
          // 普通/调试编译：用绝对路径直接加载 IDE lib 目录中的 .fne，DllMain 自动注册窗口类
          const fnePath = lib.fnePath.replace(/\\/g, '\\\\')
          mainCode += `    LoadLibraryW(L"${fnePath}");\n`
        }
      }
    }
    mainCode += '    WNDCLASSEXW wcex;\n'
    mainCode += '    wcex.cbSize = sizeof(WNDCLASSEXW);\n'
    mainCode += '    wcex.style = CS_HREDRAW | CS_VREDRAW;\n'
    mainCode += '    wcex.lpfnWndProc = WndProc;\n'
    mainCode += '    wcex.cbClsExtra = 0;\n'
    mainCode += '    wcex.cbWndExtra = 0;\n'
    mainCode += '    wcex.hInstance = hInstance;\n'
    mainCode += '    wcex.hIcon = LoadIcon(NULL, IDI_APPLICATION);\n'
    mainCode += '    wcex.hCursor = LoadCursor(NULL, IDC_ARROW);\n'
    mainCode += '    wcex.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);\n'
    mainCode += '    wcex.lpszMenuName = NULL;\n'
    mainCode += '    wcex.lpszClassName = g_szClassName;\n'
    mainCode += '    wcex.hIconSm = LoadIcon(NULL, IDI_APPLICATION);\n'
    mainCode += '    if (!RegisterClassExW(&wcex)) {\n'
    mainCode += '        MessageBoxW(NULL, L"窗口类注册失败!", L"错误", MB_ICONERROR);\n'
    mainCode += '        return 1;\n'
    mainCode += '    }\n'
    // 根据边框属性计算窗口样式
    {
      let dwStyle = 'WS_OVERLAPPED | WS_CAPTION'
      let dwExStyle = winInfo.topmost ? 'WS_EX_TOPMOST' : '0'
      switch (winInfo.border) {
        case 0: // 无边框
          dwStyle = 'WS_POPUP'
          break
        case 1: // 单线边框
          dwStyle = 'WS_OVERLAPPED | WS_CAPTION | WS_BORDER'
          break
        case 2: // 可调边框（默认）
        default:
          dwStyle = 'WS_OVERLAPPED | WS_CAPTION | WS_THICKFRAME'
          break
        case 3: // 对话框边框
          dwStyle = 'WS_OVERLAPPED | WS_CAPTION'
          dwExStyle = (winInfo.topmost ? 'WS_EX_TOPMOST | ' : '') + 'WS_EX_DLGMODALFRAME'
          break
        case 4: // 工具窗口边框
          dwStyle = 'WS_OVERLAPPED | WS_CAPTION'
          dwExStyle = (winInfo.topmost ? 'WS_EX_TOPMOST | ' : '') + 'WS_EX_TOOLWINDOW'
          break
        case 5: // 可调工具窗口边框
          dwStyle = 'WS_OVERLAPPED | WS_CAPTION | WS_THICKFRAME'
          dwExStyle = (winInfo.topmost ? 'WS_EX_TOPMOST | ' : '') + 'WS_EX_TOOLWINDOW'
          break
      }
      if (winInfo.border !== 0) {
        if (winInfo.controlBox) dwStyle += ' | WS_SYSMENU'
        if (winInfo.minButton && winInfo.controlBox) dwStyle += ' | WS_MINIMIZEBOX'
        if (winInfo.maxButton && winInfo.controlBox) dwStyle += ' | WS_MAXIMIZEBOX'
      }
      mainCode += `    DWORD dwStyle = ${dwStyle};\n`
      mainCode += `    DWORD dwExStyle = ${dwExStyle};\n`
    }
    mainCode += '    RECT rc = { 0, 0, g_nWidth, g_nHeight };\n'
    mainCode += '    AdjustWindowRectEx(&rc, dwStyle, FALSE, dwExStyle);\n'
    mainCode += '    int winW = rc.right - rc.left;\n'
    mainCode += '    int winH = rc.bottom - rc.top;\n'
    // 根据位置属性决定起始坐标
    if (winInfo.startPos === 0) {
      // 手工调整 - 系统默认
      mainCode += '    int posX = CW_USEDEFAULT;\n'
      mainCode += '    int posY = CW_USEDEFAULT;\n'
    } else {
      // 居中（默认）
      mainCode += '    int screenW = GetSystemMetrics(SM_CXSCREEN);\n'
      mainCode += '    int screenH = GetSystemMetrics(SM_CYSCREEN);\n'
      mainCode += '    int posX = (screenW - winW) / 2;\n'
      mainCode += '    int posY = (screenH - winH) / 2;\n'
    }
    mainCode += '    HWND hWnd = CreateWindowExW(dwExStyle, g_szClassName, g_szTitle,\n'
    mainCode += '        dwStyle,\n'
    mainCode += '        posX, posY, winW, winH,\n'
    mainCode += '        NULL, NULL, hInstance, NULL);\n'
    mainCode += '    if (!hWnd) {\n'
    mainCode += '        MessageBoxW(NULL, L"窗口创建失败!", L"错误", MB_ICONERROR);\n'
    mainCode += '        return 1;\n'
    mainCode += '    }\n'
    if (winInfo.disabled) mainCode += '    EnableWindow(hWnd, FALSE);\n'
    mainCode += `    ShowWindow(hWnd, ${winInfo.visible ? 'nCmdShow' : 'SW_HIDE'});\n`
    mainCode += '    UpdateWindow(hWnd);\n'
    mainCode += '    MSG msg;\n'
    mainCode += '    while (GetMessage(&msg, NULL, 0, 0)) {\n'
    mainCode += '        TranslateMessage(&msg);\n'
    mainCode += '        DispatchMessage(&msg);\n'
    mainCode += '    }\n'
    mainCode += '    return (int)msg.wParam;\n'
    mainCode += '}\n'
  } else {
    // 控制台程序
    // 先转译 .eyc 文件
    for (const f of project.files) {
      if (f.type !== 'EYC' && f.type !== 'EGV' && f.type !== 'ECS' && f.type !== 'EDT' && f.type !== 'ELL') continue
      const eycPath = join(project.projectDir, f.fileName)
      const editorContent = editorFiles?.get(f.fileName)
      const content = editorContent || (existsSync(eycPath) ? readFileSync(eycPath, 'utf-8') : '')
      if (!content) continue

      sendMessage({ type: 'info', text: `正在转换源文件: ${f.fileName}` })
      const cCode = transpileEycContent(content, f.fileName, projectGlobals, projectConstants)
      const cFileName = f.fileName.replace(/\.(eyc|ecc|egv|ecs|edt|ell)$/i, '.cpp')
      const cFilePath = join(tempDir, cFileName)
      writeFileSync(cFilePath, cCode, 'utf-8')
      additionalCFiles.push(cFilePath)
    }

    mainCode += '/* 控制台程序入口点 */\n'
    mainCode += 'int main(int argc, char* argv[]) {\n'
    mainCode += '    SetConsoleOutputCP(65001);\n'
    mainCode += '    SetConsoleCP(65001);\n'
    mainCode += `    printf("程序开始运行...\\n");\n`
    mainCode += `    printf("项目: ${project.projectName}\\n");\n`
    mainCode += '    printf("\\n");\n'

    // 查找是否有 _启动子程序
    let hasStartupSub = false
    for (const f of project.files) {
      if (f.type !== 'EYC') continue
      const eycPath = join(project.projectDir, f.fileName)
      const editorContent = editorFiles?.get(f.fileName)
      const content = editorContent || (existsSync(eycPath) ? readFileSync(eycPath, 'utf-8') : '')
      if (content && content.includes('.子程序 _启动子程序')) {
        hasStartupSub = true
        mainCode += '    extern void _启动子程序(void);\n'
        mainCode += '    _启动子程序();\n'
        break
      }
    }

    if (!hasStartupSub) {
      mainCode += '    printf("无启动子程序\\n");\n'
    }

    mainCode += '    printf("\\n程序运行结束.\\n");\n'
    mainCode += '    return 0;\n'
    mainCode += '}\n'
  }

  writeFileSync(mainCPath, mainCode, 'utf-8')
  return additionalCFiles
}

// 编译项目
export async function compileProject(options: CompileOptions, editorFiles?: Map<string, string>): Promise<CompileResult> {
  const result: CompileResult = {
    success: false, outputFile: '', errorCount: 0, warningCount: 0, elapsedMs: 0
  }

  const startTime = Date.now()

  try {
    // 查找 .epp 文件
    const projectDir = options.projectDir
    const eppFiles = readdirSync(projectDir).filter(f => f.endsWith('.epp'))
    if (eppFiles.length === 0) {
      sendMessage({ type: 'error', text: '错误: 项目目录中找不到 .epp 文件' })
      result.errorCount++
      return result
    }

    const eppPath = join(projectDir, eppFiles[0])
    const project = parseEppFile(eppPath)
    if (!project) {
      sendMessage({ type: 'error', text: '错误: 无法解析项目文件' })
      result.errorCount++
      return result
    }

    sendMessage({ type: 'info', text: `正在编译项目: ${project.projectName}` })

    // 确定架构：优先使用工具栏选择的架构，其次是项目文件中的配置
    const arch = options.arch || project.platform || 'x64'

    // 查找编译器
    const clangPath = findClangCompiler()
    if (!clangPath) {
      sendMessage({ type: 'error', text: '错误: 找不到 Clang 编译器\n请确保 compiler\\llvm\\bin 目录下有 clang.exe' })
      result.errorCount++
      return result
    }
    sendMessage({ type: 'info', text: `编译器: ${clangPath}` })

    // 查找 MSVC SDK
    const sdk = findMSVCSDK(arch)
    if (!sdk) {
      sendMessage({ type: 'error', text: '错误: 找不到 MSVC SDK\n请确保 compiler\\MSVCSDK 目录下有 MSVC 和 WindowsKits 文件' })
      result.errorCount++
      return result
    }

    // 准备目录
    const tempDir = join(projectDir, 'temp')
    const outputDir = join(projectDir, 'output')
    mkdirSync(tempDir, { recursive: true })
    mkdirSync(outputDir, { recursive: true })

    // ========== 支持库链接 ==========
    const linkMode = options.linkMode || 'normal'
    const loadedLibs = libraryManager.getLoadedLibraryFiles()
    sendMessage({ type: 'info', text: `编译模式: ${linkMode === 'static' ? '静态编译' : '普通编译'}` })

    // 生成C++代码
    sendMessage({ type: 'info', text: '正在生成C++代码...' })
    const additionalCFiles = generateMainC(project, tempDir, editorFiles, linkMode)
    const outputName = project.projectName
    const outputExe = join(outputDir, outputName + '.exe')
    const mainC = join(tempDir, 'main.cpp')

    const args: string[] = [
      '-o', outputExe,
      mainC,
      ...additionalCFiles,
    ]

    // 项目类型
    const isWindowsApp = project.outputType === 'WindowsApp'
    if (isWindowsApp) {
      args.push('-Wl,/SUBSYSTEM:WINDOWS')
      sendMessage({ type: 'info', text: '项目类型: Windows窗口程序' })
    } else if (project.outputType === 'DynamicLibrary') {
      args.push('-shared')
      sendMessage({ type: 'info', text: '项目类型: 动态链接库(DLL)' })
    } else {
      args.push('-Wl,/SUBSYSTEM:CONSOLE')
      sendMessage({ type: 'info', text: '项目类型: 控制台程序' })
    }

    // 链接 Windows API 库
    args.push('-lkernel32', '-luser32', '-lgdi32', '-lmsvcrt', '-lucrt', '-lvcruntime')

    // ========== 支持库链接 ==========
    if (loadedLibs.length > 0) {
      sendMessage({ type: 'info', text: `已加载 ${loadedLibs.length} 个支持库，正在处理链接依赖...` })
    }

    let linkFailed = false
    const fnesToCopy: Array<{ name: string; fnePath: string; libName: string }> = []

    for (const lib of loadedLibs) {
      const staticLib = libraryManager.findStaticLib(lib.name, arch)

      // 窗口组件静态库需要额外链接的系统库
      const winUnitExtraDeps: Record<string, string[]> = {
        ycui: ['d2d1.lib', 'dwrite.lib'],
      }
      const extraDeps = (staticLib && winUnitExtraDeps[lib.name]) ? winUnitExtraDeps[lib.name] : []

      if (linkMode === 'static') {
        // 静态编译：只使用 .lib，没有则报错
        if (staticLib) {
          args.push(staticLib, ...extraDeps)
          sendMessage({ type: 'info', text: `  ✓ ${lib.libName} (${lib.name}) - 静态链接: ${basename(staticLib)}` })
        } else {
          sendMessage({ type: 'error', text: `错误: 支持库「${lib.libName}」(${lib.name}) 没有静态库(.lib)，无法进行静态编译` })
          result.errorCount++
          linkFailed = true
        }
      } else {
        // 普通/调试编译：优先 .lib，没有则复制 .fne 到输出目录
        if (staticLib) {
          // 有窗口组件的库（如 ycui）在普通编译下走 .fne 动态加载，避免引入额外系统 .lib 依赖
          const info = libraryManager.getLibInfo(lib.name)
          const hasWinUnit = info?.windowUnits && info.windowUnits.length > 0
          if (hasWinUnit) {
            // 普通编译时窗口组件库用绝对路径 LoadLibraryW，无需复制
            sendMessage({ type: 'info', text: `  ✓ ${lib.libName} (${lib.name}) - 动态加载: ${lib.name}.fne` })
          } else {
            args.push(staticLib)
            sendMessage({ type: 'info', text: `  ✓ ${lib.libName} (${lib.name}) - 静态链接: ${basename(staticLib)}` })
          }
        } else {
          fnesToCopy.push(lib)
          sendMessage({ type: 'info', text: `  ○ ${lib.libName} (${lib.name}) - 动态依赖，将复制 .fne 到输出目录` })
        }
      }
    }

    if (linkFailed) {
      sendMessage({ type: 'error', text: '静态编译失败: 缺少必要的静态库文件' })
      result.elapsedMs = Date.now() - startTime
      return result
    }

    // 目标架构
    if (arch === 'x86') {
      args.push('--target=i686-pc-windows-msvc')
    } else {
      args.push('--target=x86_64-pc-windows-msvc')
    }

    // 链接器
    args.push('-fuse-ld=lld-link')

    // MSVC SDK 路径
    args.push(
      `-isystem`, sdk.msvcInclude,
      `-isystem`, sdk.ucrtInclude,
      `-isystem`, sdk.umInclude,
      `-isystem`, sdk.sharedInclude,
      `-Wl,/LIBPATH:${sdk.msvcLib}`,
      `-Wl,/LIBPATH:${sdk.ucrtLib}`,
      `-Wl,/LIBPATH:${sdk.umLib}`,
    )

    // 源文件/执行字符集均使用 UTF-8，确保中文字符串字面量不被 MSVC 模式按 GBK 解析
    args.push('-finput-charset=utf-8', '-fexec-charset=utf-8')

    // 调试/优化选项
    if (options.debug) {
      args.push('-g')
    } else {
      args.push('-O2', '-fno-ident', '-ffunction-sections', '-fdata-sections')
      args.push('-Wl,/OPT:REF,/OPT:ICF')
    }

    sendMessage({ type: 'info', text: '正在编译...' })

    // 调用 clang
    const compileSuccess = await new Promise<boolean>((resolve) => {
      const clangDir = dirname(clangPath)
      const proc = execFile(clangPath, args, { cwd: clangDir, maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (stderr) {
          const lines = stderr.split('\n').filter(l => l.trim())
          for (const line of lines) {
            const lower = line.toLowerCase()
            if (lower.includes('error')) {
              sendMessage({ type: 'error', text: line })
              result.errorCount++
            } else if (lower.includes('warning')) {
              sendMessage({ type: 'warning', text: line })
              result.warningCount++
            } else {
              sendMessage({ type: 'info', text: line })
            }
          }
        }
        resolve(!error)
      })
      proc.on('error', (err) => {
        sendMessage({ type: 'error', text: `编译器进程启动失败: ${err.message}` })
        resolve(false)
      })
    })

    if (!compileSuccess || !existsSync(outputExe)) {
      sendMessage({ type: 'error', text: '编译失败!' })
      result.errorCount++
      result.elapsedMs = Date.now() - startTime
      return result
    }

    // strip（非调试模式）
    if (!options.debug) {
      const stripPath = join(dirname(clangPath), 'llvm-strip.exe')
      if (existsSync(stripPath)) {
        await new Promise<void>((resolve) => {
          execFile(stripPath, ['--strip-all', outputExe], () => resolve())
        })
      }
    }

    result.success = true
    result.outputFile = outputExe
    result.elapsedMs = Date.now() - startTime

    sendMessage({ type: 'success', text: `编译成功 (${result.elapsedMs} 毫秒)` })
    sendMessage({ type: 'info', text: `输出文件: ${outputExe}` })

    // 普通编译模式: 复制动态依赖的 .fne 到输出目录的 lib 子目录
    if (fnesToCopy.length > 0) {
      const libOutputDir = join(outputDir, 'lib')
      mkdirSync(libOutputDir, { recursive: true })
      for (const lib of fnesToCopy) {
        const destPath = join(libOutputDir, basename(lib.fnePath))
        try {
          copyFileSync(lib.fnePath, destPath)
          sendMessage({ type: 'info', text: `已复制动态支持库: ${basename(lib.fnePath)} -> lib/` })
        } catch (e) {
          sendMessage({ type: 'warning', text: `复制支持库失败: ${basename(lib.fnePath)} - ${e instanceof Error ? e.message : String(e)}` })
        }
      }
    }

  } catch (e) {
    sendMessage({ type: 'error', text: `编译异常: ${e instanceof Error ? e.message : String(e)}` })
    result.errorCount++
  }

  result.elapsedMs = Date.now() - startTime
  return result
}

// 运行已编译的程序
export function runExecutable(exePath: string): boolean {
  if (!exePath || !existsSync(exePath)) {
    sendMessage({ type: 'error', text: '错误: 可执行文件不存在: ' + exePath })
    return false
  }

  // 如果已有程序在运行，先停止
  stopExecutable()

  sendMessage({ type: 'info', text: '' })
  sendMessage({ type: 'info', text: '==========================================' })
  sendMessage({ type: 'info', text: '正在运行程序...' })
  sendMessage({ type: 'info', text: '==========================================' })

  const workDir = dirname(exePath)

  try {
    const proc = execFile(exePath, [], {
      cwd: workDir,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: false,
    })

    runningProcess = proc

    proc.stdout?.on('data', (data: Buffer) => {
      sendMessage({ type: 'info', text: data.toString('utf-8') })
    })

    proc.stderr?.on('data', (data: Buffer) => {
      sendMessage({ type: 'warning', text: data.toString('utf-8') })
    })

    proc.on('exit', (code) => {
      runningProcess = null
      sendMessage({ type: 'info', text: '' })
      if (code === 0) {
        sendMessage({ type: 'success', text: `程序已退出 (退出码: ${code})` })
      } else {
        sendMessage({ type: 'warning', text: `程序已退出 (退出码: ${code})` })
      }
      BrowserWindow.getAllWindows().forEach(w => {
        w.webContents.send('compiler:processExit', code)
      })
    })

    proc.on('error', (err) => {
      runningProcess = null
      sendMessage({ type: 'error', text: `启动程序失败: ${err.message}` })
    })

    sendMessage({ type: 'success', text: `程序已启动 (PID: ${proc.pid})` })
    return true
  } catch (e) {
    sendMessage({ type: 'error', text: `启动程序失败: ${e instanceof Error ? e.message : String(e)}` })
    return false
  }
}

// 停止正在运行的程序
export function stopExecutable(): boolean {
  if (!runningProcess) return true

  try {
    runningProcess.kill()
    sendMessage({ type: 'info', text: '程序已停止' })
  } catch { /* ignore */ }

  runningProcess = null
  return true
}

// 检查是否有程序在运行
export function isRunning(): boolean {
  return runningProcess !== null
}
