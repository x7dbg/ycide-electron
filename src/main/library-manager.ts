/**
 * 支持库管理器
 * 扫描 lib 文件夹、加载 .fne 文件、管理已加载的支持库信息。
 */
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join, basename, extname, dirname } from 'path'
import { app } from 'electron'
import { parseFneFile, type LibInfo, type LibCommand, type LibWindowUnit } from './fne-parser'
import { deriveBinaryContract } from './contract/binary-contract'
import { validateBinaryContract } from './contract/contract-validator'
import type { ContractDiagnostic } from './contract/contract-diagnostics'

/** 核心支持库文件名（不含扩展名） */
const CORE_LIB_NAME = 'krnln'

export interface LibraryItem {
  name: string         // 文件名（不含扩展名，如 krnln）
  filePath: string     // 完整路径
  loaded: boolean      // 是否已加载
  libInfo: LibInfo | null  // 支持库元信息（扫描或加载后可用）
}

/** 加载结果（用于 load 方法返回冲突信息） */
export interface LoadResult {
  success: boolean
  info: LibInfo | null
  error?: string  // 冲突或错误信息
  diagnostics?: ContractDiagnostic[]
}

const SUPPORTED_CONTRACT_METADATA_MAJOR_VERSION = 1

class LibraryManager {
  private libraries: LibraryItem[] = []
  private loadedContractDiagnostics = new Map<string, ContractDiagnostic[]>()

  /** 确保库元信息已解析（用于未加载库的名称/版本展示） */
  private ensureLibInfo(item: LibraryItem): LibInfo | null {
    if (item.libInfo) return item.libInfo
    const info = parseFneFile(item.filePath)
    if (info) item.libInfo = info
    return info
  }

  /** 判断是否为核心支持库 */
  isCore(name: string): boolean {
    return name === CORE_LIB_NAME
  }

  /** 获取持久化配置文件路径 */
  private getConfigPath(): string {
    return join(app.getPath('userData'), 'library-state.json')
  }

  /** 保存已加载的支持库名称列表 */
  saveLoadedState(): void {
    const loaded = this.libraries.filter(l => l.loaded).map(l => l.name)
    try {
      writeFileSync(this.getConfigPath(), JSON.stringify({ loadedLibs: loaded }, null, 2), 'utf-8')
    } catch { /* ignore */ }
  }

  /** 读取上次保存的已加载支持库名称列表 */
  private getSavedLoadedNames(): string[] {
    try {
      const configPath = this.getConfigPath()
      if (!existsSync(configPath)) return []
      const data = JSON.parse(readFileSync(configPath, 'utf-8'))
      return Array.isArray(data.loadedLibs) ? data.loadedLibs : []
    } catch { return [] }
  }

  /** 启动时自动扫描并加载上次已加载的支持库 */
  scanAndAutoLoad(): void {
    // 必须先读取持久化状态，避免后续核心库加载触发保存时覆盖旧配置
    const savedNames = this.getSavedLoadedNames()
    this.scan()
    // 核心库始终加载
    this.loadInternal(CORE_LIB_NAME)
    // 加载上次保存的其他支持库
    for (const name of savedNames) {
      if (name !== CORE_LIB_NAME) {
        this.load(name)
      }
    }
  }

  /** 获取 lib 文件夹路径 */
  getLibFolder(): string {
    const isDev = !app.isPackaged
    if (isDev) {
      return join(app.getAppPath(), 'lib')
    }
    return join(dirname(process.execPath), 'lib')
  }

  /** 扫描支持库文件夹，查找所有 .fne 文件 */
  scan(customFolder?: string): ReturnType<LibraryManager['getList']> {
    this.libraries = []
    this.loadedContractDiagnostics.clear()
    const libFolder = customFolder || this.getLibFolder()
    const found = new Set<string>()

    // 扫描顺序：先 lib/x64，再 lib 根目录
    const scanDirs = [join(libFolder, 'x64'), libFolder]

    for (const dir of scanDirs) {
      if (!existsSync(dir)) continue
      try {
        const files = readdirSync(dir)
        for (const file of files) {
          if (extname(file).toLowerCase() !== '.fne') continue
          const name = basename(file, '.fne')
          if (found.has(name)) continue
          found.add(name)

          this.libraries.push({
            name,
            filePath: join(dir, file),
            loaded: false,
            libInfo: null,
          })
        }
      } catch {
        // 目录不可读，跳过
      }
    }

    // 扫描后预读取元信息，使未加载库也可显示中文名与版本号
    for (const item of this.libraries) {
      this.ensureLibInfo(item)
    }

    return this.getList()
  }

  /** 内部加载（无冲突检查，用于核心库或已确认安全的加载） */
  private loadInternal(name: string): LibInfo | null {
    const item = this.libraries.find(l => l.name === name)
    if (!item) return null
    if (item.loaded && item.libInfo) return item.libInfo

    const info = this.ensureLibInfo(item)
    if (!info) return null
    const diagnostics = this.validateBinaryContractForLoad(info, item.filePath)
    const blockingErrors = diagnostics.filter(d => d.level === 'ERROR')
    if (blockingErrors.length > 0) {
      return null
    }

    item.loaded = true
    item.libInfo = info
    this.refreshContractDiagnosticsFor(item)
    this.saveLoadedState()
    return info
  }

  private validateBinaryContractForLoad(info: LibInfo, filePath: string): ContractDiagnostic[] {
    const contract = deriveBinaryContract(info, filePath)
    return validateBinaryContract(contract, {
      supportedMetadataMajorVersion: SUPPORTED_CONTRACT_METADATA_MAJOR_VERSION,
    })
  }

  private refreshContractDiagnosticsFor(item: LibraryItem): void {
    if (!item.loaded || !item.libInfo) {
      this.loadedContractDiagnostics.delete(item.name)
      return
    }
    const contract = deriveBinaryContract(item.libInfo, item.filePath)
    const diagnostics = validateBinaryContract(contract, {
      supportedMetadataMajorVersion: SUPPORTED_CONTRACT_METADATA_MAJOR_VERSION,
    })
    this.loadedContractDiagnostics.set(item.name, diagnostics)
  }

  /** 检查 GUID 冲突 */
  private checkGuidConflict(newInfo: LibInfo, excludeName: string): string | null {
    for (const item of this.libraries) {
      if (!item.loaded || !item.libInfo || item.name === excludeName) continue
      if (item.libInfo.guid && newInfo.guid && item.libInfo.guid === newInfo.guid) {
        return `支持库 GUID 冲突：「${newInfo.name}」与已加载的「${item.libInfo.name}」(${item.name}.fne) 具有相同的 GUID`
      }
    }
    return null
  }

  /** 检查命令名冲突（仅检查非成员命令） */
  private checkCommandConflict(newInfo: LibInfo, excludeName: string): string | null {
    // 收集已加载库的所有独立函数命令名
    const existingCmds = new Map<string, string>() // cmdName → libName
    for (const item of this.libraries) {
      if (!item.loaded || !item.libInfo || item.name === excludeName) continue
      for (const cmd of item.libInfo.commands) {
        if (cmd.name && !cmd.isHidden && !cmd.isMember) {
          existingCmds.set(cmd.name, item.libInfo.name || item.name)
        }
      }
    }
    // 检查新库的独立函数命令是否与已有命令重名
    for (const cmd of newInfo.commands) {
      if (cmd.name && !cmd.isHidden && !cmd.isMember && existingCmds.has(cmd.name)) {
        const existingLib = existingCmds.get(cmd.name)!
        return `支持库命令冲突：「${newInfo.name}」的命令「${cmd.name}」与已加载的「${existingLib}」中的同名命令冲突`
      }
    }
    return null
  }

  /** 加载指定支持库（带冲突检测） */
  load(name: string): LoadResult {
    const item = this.libraries.find(l => l.name === name)
    if (!item) return { success: false, info: null, error: `未找到支持库 ${name}` }
    if (item.loaded && item.libInfo) return { success: true, info: item.libInfo, diagnostics: [] }

    const info = this.ensureLibInfo(item)
    if (!info) return { success: false, info: null, error: `解析支持库 ${name} 失败` }

    // GUID 冲突检查
    const guidConflict = this.checkGuidConflict(info, name)
    if (guidConflict) return { success: false, info: null, error: guidConflict }

    // 命令名冲突检查
    const cmdConflict = this.checkCommandConflict(info, name)
    if (cmdConflict) return { success: false, info: null, error: cmdConflict }
    // Ordered gate: checkGuidConflict -> checkCommandConflict -> validateBinaryContract (D6-20)

    // D6-12：加载门禁需明确“可加载/不可加载”分层；校验失败即 blocked
    const diagnostics = this.validateBinaryContractForLoad(info, item.filePath)
    const blockingErrors = diagnostics.filter(d => d.level === 'ERROR')
    if (blockingErrors.length > 0) {
      return {
        success: false,
        info: null,
        error: `支持库契约校验失败（blocked）: ${blockingErrors[0].message}`,
        diagnostics,
      }
    }

    item.loaded = true
    item.libInfo = info
    this.refreshContractDiagnosticsFor(item)
    this.saveLoadedState()
    return { success: true, info, diagnostics }
  }

  /** 卸载指定支持库（核心库不可卸载） */
  unload(name: string): { success: boolean; error?: string } {
    if (this.isCore(name)) {
      return { success: false, error: '核心支持库不可卸载' }
    }
    const item = this.libraries.find(l => l.name === name)
    if (!item || !item.loaded) return { success: false, error: '该支持库未加载' }
    item.loaded = false
    this.loadedContractDiagnostics.delete(item.name)
    this.saveLoadedState()
    return { success: true }
  }

  /** 根据勾选结果批量应用加载状态 */
  applySelection(selectedNames: string[]): {
    loadedCount: number
    unloadedCount: number
    failed: Array<{ name: string; error: string; diagnostics?: ContractDiagnostic[] }>
  } {
    const selected = new Set(selectedNames)
    selected.add(CORE_LIB_NAME)
    let loadedCount = 0
    let unloadedCount = 0
    const failed: Array<{ name: string; error: string; diagnostics?: ContractDiagnostic[] }> = []

    // 先卸载未勾选项（核心库除外）
    for (const item of this.libraries) {
      if (!item.loaded || this.isCore(item.name) || selected.has(item.name)) continue
      const result = this.unload(item.name)
      if (result.success) unloadedCount++
      else failed.push({ name: item.name, error: result.error || '卸载失败' })
    }

    // 再加载勾选项
    for (const item of this.libraries) {
      if (item.loaded || !selected.has(item.name)) continue
      const result = this.load(item.name)
      if (result.success) loadedCount++
      else failed.push({
        name: item.name,
        error: result.error || '加载失败',
        diagnostics: result.diagnostics,
      })
    }

    this.saveLoadedState()
    return { loadedCount, unloadedCount, failed }
  }

  /** 加载所有已扫描的支持库 */
  loadAll(): number {
    let count = 0
    for (const item of this.libraries) {
      if (!item.loaded) {
        const result = this.load(item.name)
        if (result.success) count++
      }
    }
    this.saveLoadedState()
    return count
  }

  /** 获取支持库列表（不含 libInfo 详情，用于 UI 展示） */
  getList(): Array<{ name: string; filePath: string; loaded: boolean; isCore: boolean; libName?: string; version?: string; cmdCount?: number; dtCount?: number }> {
    return this.libraries.map(l => ({
      name: l.name,
      filePath: l.filePath,
      loaded: l.loaded,
      isCore: this.isCore(l.name),
      libName: l.libInfo?.name,
      version: l.libInfo?.version,
      cmdCount: l.libInfo?.commands.length,
      dtCount: l.libInfo?.dataTypes.length,
    }))
  }

  /** 获取所有已加载的命令 */
  getAllCommands(): (LibCommand & { libraryName: string })[] {
    const cmds: (LibCommand & { libraryName: string })[] = []
    for (const item of this.libraries) {
      if (item.loaded && item.libInfo) {
        const libName = item.libInfo.name || ''
        for (const cmd of item.libInfo.commands) {
          cmds.push({ ...cmd, libraryName: libName })
        }
      }
    }
    return cmds
  }

  /** 获取所有已加载的数据类型 */
  getAllDataTypes(): LibInfo['dataTypes'] {
    const dts: LibInfo['dataTypes'] = []
    for (const item of this.libraries) {
      if (item.loaded && item.libInfo) {
        dts.push(...item.libInfo.dataTypes)
      }
    }
    return dts
  }

  /** 获取指定支持库的详细信息 */
  getLibInfo(name: string): LibInfo | null {
    const item = this.libraries.find(l => l.name === name)
    return item?.libInfo ?? null
  }

  /** 获取所有已加载的窗口组件 */
  getAllWindowUnits(): LibWindowUnit[] {
    const units: LibWindowUnit[] = []
    for (const item of this.libraries) {
      if (item.loaded && item.libInfo) {
        units.push(...item.libInfo.windowUnits)
      }
    }
    return units
  }

  /** 获取静态库文件夹路径 */
  getStaticLibFolder(): string {
    const isDev = !app.isPackaged
    if (isDev) {
      return join(app.getAppPath(), 'static_lib')
    }
    return join(dirname(process.execPath), 'static_lib')
  }

  /** 查找指定支持库的静态库文件(.lib) */
  findStaticLib(name: string, arch: string): string | null {
    const staticFolder = this.getStaticLibFolder()
    const archDir = arch === 'x86' ? 'x86' : 'x64'
    // 搜索模式： name_static.lib 或 name.lib
    const candidates = [
      join(staticFolder, archDir, `${name}_static.lib`),
      join(staticFolder, archDir, `${name}.lib`),
      join(staticFolder, `${name}_static.lib`),
      join(staticFolder, `${name}.lib`),
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return null
  }

  /** 获取所有已加载支持库的文件信息（用于编译链接） */
  getLoadedLibraryFiles(): Array<{ name: string; fnePath: string; libName: string }> {
    return this.libraries
      .filter(l => l.loaded && l.libInfo)
      .map(l => ({
        name: l.name,
        fnePath: l.filePath,
        libName: l.libInfo!.name || l.name,
      }))
  }

  /** 获取已加载支持库的契约诊断快照（用于编译门禁，级别仅 ERROR/INFO） */
  getLoadedContractDiagnostics(): ContractDiagnostic[] {
    const diagnostics: ContractDiagnostic[] = []
    for (const item of this.libraries) {
      if (!item.loaded || !item.libInfo) continue
      const cached = this.loadedContractDiagnostics.get(item.name)
      if (cached) {
        diagnostics.push(...cached)
        continue
      }
      this.refreshContractDiagnosticsFor(item)
      const refreshed = this.loadedContractDiagnostics.get(item.name)
      if (refreshed) diagnostics.push(...refreshed)
    }
    return diagnostics.map(d => ({ ...d }))
  }
}

export const libraryManager = new LibraryManager()
