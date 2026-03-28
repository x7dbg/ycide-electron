/**
 * 支持库管理器（ycmd 版）
 * 扫描 lib 目录中的 *.ycmd.json 清单。
 */
import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { getYcmdCommands, scanYcmdRegistry, type YcmdResolvedCommand } from './ycmd-registry'

export interface LibraryParam {
  name: string
  type: string
  description: string
  optional: boolean
  isVariable: boolean
  isArray: boolean
}

export interface LibraryCommand {
  name: string
  englishName: string
  description: string
  returnType: string
  category: string
  params: LibraryParam[]
  isHidden: boolean
  isMember: boolean
  ownerTypeName: string
  commandIndex: number
  libraryName: string
  libraryFileName: string
  source: 'ycmd'
  manifestPath: string
}

export interface LibraryDataType {
  name: string
  englishName: string
  description: string
  isWindowUnit: boolean
}

export interface LibraryConstant {
  name: string
  englishName: string
  description: string
  type: 'null' | 'number' | 'bool' | 'text'
  value: string
}

export interface LibraryWindowUnit {
  name: string
  englishName: string
  description: string
  className: string
  style: string
  properties: Array<{ name: string; typeName: string }>
  events: Array<{ name: string }>
  libraryName: string
}

export interface LibraryInfo {
  name: string
  guid: string
  version: string
  description: string
  author: string
  zipCode: string
  address: string
  phone: string
  qq: string
  email: string
  homePage: string
  otherInfo: string
  fileName: string
  commands: LibraryCommand[]
  dataTypes: LibraryDataType[]
  constants: LibraryConstant[]
  windowUnits: LibraryWindowUnit[]
}

export interface LibraryItem {
  name: string
  filePath: string
  loaded: boolean
  isCore: boolean
  libName?: string
  version?: string
  cmdCount?: number
  dtCount?: number
}

export interface LoadResult {
  success: boolean
  info: LibraryInfo | null
  error?: string
}

class LibraryManager {
  private static readonly CORE_LIBRARY_FILE_NAME = 'krnln'
  private libraries: LibraryItem[] = []

  private getConfigPath(): string {
    return join(app.getPath('userData'), 'library-state.json')
  }

  private getSavedLoadedNames(): string[] | null {
    try {
      const cfgPath = this.getConfigPath()
      if (!existsSync(cfgPath)) return null
      const data = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { loadedLibs?: unknown }
      if (!Array.isArray(data.loadedLibs)) return []
      return data.loadedLibs.filter((x): x is string => typeof x === 'string')
    } catch {
      return []
    }
  }

  private saveLoadedState(): void {
    try {
      const loadedLibs = this.libraries.filter(l => l.loaded).map(l => l.name)
      writeFileSync(this.getConfigPath(), JSON.stringify({ loadedLibs }, null, 2), 'utf-8')
    } catch {
      // ignore
    }
  }

  private getLibraryDisplayMeta(customFolder?: string): Map<string, { libName: string; version: string; cmdCount: number }> {
    const root = customFolder || this.getLibFolder()
    const scan = scanYcmdRegistry(root)
    const map = new Map<string, { libName: string; version: string; cmdCount: number }>()

    for (const lib of scan.libraries) {
      let libName = lib.name
      let version = '-'
      let cmdCount = 0

      for (const item of lib.manifests) {
        if (!item.valid || !item.manifest) continue
        cmdCount++
        const m = item.manifest as {
          library?: string
          libraryDisplayName?: string
          libraryVersion?: string
          contractVersion?: string
        }
        if (m.libraryDisplayName && m.libraryDisplayName.trim()) {
          libName = m.libraryDisplayName.trim()
        } else if (m.library && m.library.trim() && libName === lib.name) {
          libName = m.library.trim()
        }
        if (m.libraryVersion && m.libraryVersion.trim()) {
          version = m.libraryVersion.trim()
        } else if (version === '-' && m.contractVersion && m.contractVersion.trim()) {
          version = m.contractVersion.trim()
        }
      }

      map.set(lib.name, { libName, version, cmdCount })
    }

    return map
  }

  isCore(name: string): boolean {
    return name === LibraryManager.CORE_LIBRARY_FILE_NAME
  }

  getLibFolder(): string {
    const isDev = !app.isPackaged
    if (isDev) {
      return join(app.getAppPath(), 'lib')
    }
    return join(dirname(process.execPath), 'lib')
  }

  scan(customFolder?: string): LibraryItem[] {
    const root = customFolder || this.getLibFolder()
    const result = scanYcmdRegistry(root)
    const metaMap = this.getLibraryDisplayMeta(root)
    const previousLoaded = new Map(this.libraries.map(l => [l.name, l.loaded]))
    const savedLoaded = this.getSavedLoadedNames()
    const savedSet = savedLoaded ? new Set(savedLoaded) : null

    this.libraries = result.libraries.map(lib => ({
      name: lib.name,
      filePath: lib.folderPath,
      loaded: this.isCore(lib.name)
        ? true
        : (savedSet
            ? savedSet.has(lib.name)
            : (previousLoaded.get(lib.name) ?? true)),
      isCore: this.isCore(lib.name),
      libName: metaMap.get(lib.name)?.libName || lib.name,
      version: metaMap.get(lib.name)?.version || '-',
      cmdCount: metaMap.get(lib.name)?.cmdCount ?? lib.manifests.filter(x => x.valid).length,
      dtCount: 0,
    }))

    return this.libraries
  }

  scanAndAutoLoad(): void {
    this.scan()
  }

  load(name: string): LoadResult {
    if (this.libraries.length === 0) this.scan()
    const item = this.libraries.find(l => l.name === name)
    if (!item) return { success: false, info: null, error: `未找到支持库 ${name}` }
    if (!item.loaded) {
      item.loaded = true
      this.saveLoadedState()
    }
    const info = this.getLibInfo(name)
    if (!info) return { success: false, info: null, error: `未找到支持库 ${name}` }
    return { success: true, info }
  }

  unload(name: string): { success: boolean; error?: string } {
    if (this.isCore(name)) {
      return { success: false, error: '核心支持库不可卸载' }
    }
    if (this.libraries.length === 0) this.scan()
    const item = this.libraries.find(l => l.name === name)
    if (!item) return { success: false, error: `未找到支持库 ${name}` }
    if (!item.loaded) return { success: true }
    item.loaded = false
    this.saveLoadedState()
    return { success: true }
  }

  applySelection(selectedNames: string[]): { loadedCount: number; unloadedCount: number; failed: Array<{ name: string; error: string }> } {
    if (this.libraries.length === 0) this.scan()

    const failed: Array<{ name: string; error: string }> = []
    const selected = new Set(selectedNames)
    selected.add(LibraryManager.CORE_LIBRARY_FILE_NAME)

    let loadedCount = 0
    let unloadedCount = 0

    for (const item of this.libraries) {
      const targetLoaded = this.isCore(item.name) ? true : selected.has(item.name)
      if (item.loaded === targetLoaded) continue

      if (!targetLoaded && this.isCore(item.name)) {
        failed.push({ name: item.name, error: '核心支持库不可卸载' })
        continue
      }

      if (targetLoaded) {
        item.loaded = true
        loadedCount++
      } else {
        item.loaded = false
        unloadedCount++
      }
    }

    this.saveLoadedState()
    return { loadedCount, unloadedCount, failed }
  }

  loadAll(): number {
    if (this.libraries.length === 0) this.scan()
    let changed = 0
    for (const item of this.libraries) {
      if (!item.loaded) {
        item.loaded = true
        changed++
      }
    }
    if (changed > 0) this.saveLoadedState()
    return changed
  }

  getList(): LibraryItem[] {
    return this.scan()
  }

  private mapYcmdCommand(cmd: YcmdResolvedCommand): LibraryCommand {
    return {
      ...cmd,
      params: (cmd.params || []).map(p => ({
        name: p.name,
        type: p.type,
        description: p.description,
        optional: !!p.optional,
        isVariable: !!p.isVariable,
        isArray: !!p.isArray,
      })),
    }
  }

  getAllCommands(): LibraryCommand[] {
    if (this.libraries.length === 0) this.scan()
    const loadedSet = new Set(this.libraries.filter(l => l.loaded).map(l => l.name))
    return getYcmdCommands()
      .filter(cmd => loadedSet.has(cmd.libraryFileName))
      .map(cmd => this.mapYcmdCommand(cmd))
  }

  getAllDataTypes(): LibraryDataType[] {
    return []
  }

  getLibInfo(name: string): LibraryInfo | null {
    const all = getYcmdCommands().map(cmd => this.mapYcmdCommand(cmd)).filter(c => c.libraryFileName === name || c.libraryName === name)
    if (all.length === 0) return null
    const meta = this.getLibraryDisplayMeta().get(name)
    return {
      name: meta?.libName || name,
      guid: '-',
      version: meta?.version || '-',
      description: '由 ycmd 清单生成',
      author: '-',
      zipCode: '-',
      address: '-',
      phone: '-',
      qq: '-',
      email: '-',
      homePage: '-',
      otherInfo: '-',
      fileName: name,
      commands: all,
      dataTypes: [],
      constants: [],
      windowUnits: [],
    }
  }

  getAllWindowUnits(): LibraryWindowUnit[] {
    return []
  }

  findStaticLib(_name: string, _arch: string): string | null {
    return null
  }

  getLoadedLibraryFiles(): Array<{ name: string; libraryPath: string; libName: string }> {
    return []
  }
}

export const libraryManager = new LibraryManager()
