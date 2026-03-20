/**
 * FNE 支持库解析器
 * 使用 koffi 加载易语言 .fne 支持库（Windows DLL），
 * 调用导出函数 GetNewInf 获取 LIB_INFO 结构体并解析为 JS 对象。
 */
import koffi from 'koffi'

// ========== 数据类型常量 ==========

const SDT_BYTE      = 0x80000101
const SDT_SHORT     = 0x80000201
const SDT_INT       = 0x80000301
const SDT_INT64     = 0x80000401
const SDT_FLOAT     = 0x80000501
const SDT_DOUBLE    = 0x80000601
const SDT_BOOL      = 0x80000002
const SDT_DATE_TIME = 0x80000003
const SDT_TEXT      = 0x80000004
const SDT_BIN       = 0x80000005
const SDT_SUB_PTR   = 0x80000006

// 参数标志
const AS_HAS_DEFAULT_VALUE      = 1 << 0
const AS_DEFAULT_VALUE_IS_EMPTY = 1 << 1
const AS_RECEIVE_VAR            = 1 << 2
const AS_RECEIVE_VAR_ARRAY      = 1 << 3
const AS_RECEIVE_ARRAY_DATA     = 1 << 5
const AS_RECEIVE_ALL_TYPE_DATA  = 1 << 6

// 命令标志
const CT_IS_HIDED = 1 << 2

// 数据类型标志
const LDT_IS_HIDED    = 1 << 0
const LDT_WIN_UNIT    = 1 << 6

// 属性状态标志
const UW_ONLY_READ    = 1 << 2
const UW_IS_HIDED     = 1 << 4

// 事件标志
const EV_IS_HIDED     = 1 << 0

// 事件参数标志
const EAS_BY_REF      = 1 << 1

// ========== koffi 结构体定义 ==========

const ARG_INFO = koffi.struct('ARG_INFO', {
  m_szName:         'const char *',
  m_szExplain:      'const char *',
  m_shtBitmapIndex: 'int16',
  m_shtBitmapCount: 'int16',
  m_dtType:         'uint32',
  m_nDefault:       'int32',
  m_dwState:        'uint32',
})

const CMD_INFO = koffi.struct('CMD_INFO', {
  m_szName:         'const char *',
  m_szEgName:       'const char *',
  m_szExplain:      'const char *',
  m_shtCategory:    'int16',
  m_wState:         'uint16',
  m_dtRetValType:   'uint32',
  m_wReserved:      'uint16',
  m_shtUserLevel:   'int16',
  m_shtBitmapIndex: 'int16',
  m_shtBitmapCount: 'int16',
  m_nArgCount:      'int32',
  m_pBeginArgInfo:  'ARG_INFO *',
})

const LIB_DATA_TYPE_INFO = koffi.struct('LIB_DATA_TYPE_INFO', {
  m_szName:            'const char *',
  m_szEgName:          'const char *',
  m_szExplain:         'const char *',
  m_nCmdCount:         'int32',
  m_pnCmdsIndex:       'int32 *',
  m_dwState:           'uint32',
  m_dwUnitBmpID:       'uint32',
  m_nEventCount:       'int32',
  m_pEventBegin:       'void *',
  m_nPropertyCount:    'int32',
  m_pPropertyBegin:    'void *',
  m_pfnGetInterface:   'void *',
  m_nElementCount:     'int32',
  m_pElementBegin:     'void *',
})

// 窗口组件属性结构
const UNIT_PROPERTY_RAW = koffi.struct('UNIT_PROPERTY_RAW', {
  m_szName:       'const char *',
  m_szEgName:     'const char *',
  m_szExplain:    'const char *',
  m_shtType:      'int16',
  m_wState:       'uint16',
  m_szzPickStr:   'void *',
})

// 事件参数结构
const EVENT_ARG_INFO2_RAW = koffi.struct('EVENT_ARG_INFO2_RAW', {
  m_szName:       'const char *',
  m_szExplain:    'const char *',
  m_dwState:      'uint32',
  m_dtDataType:   'uint32',
})

// 事件结构
const EVENT_INFO2_RAW = koffi.struct('EVENT_INFO2_RAW', {
  m_szName:          'const char *',
  m_szExplain:       'const char *',
  m_dwState:         'uint32',
  m_nArgCount:       'int32',
  m_pEventArgInfo:   'EVENT_ARG_INFO2_RAW *',
  m_dtRetDataType:   'uint32',
})

const LIB_CONST_INFO = koffi.struct('LIB_CONST_INFO', {
  m_szName:    'const char *',
  m_szEgName:  'const char *',
  m_szExplain: 'const char *',
  m_shtLayout: 'int16',
  m_shtType:   'int16',
  m_szText:    'const char *',
  m_dbValue:   'double',
})

const LIB_INFO = koffi.struct('LIB_INFO', {
  m_dwLibFormatVer:            'uint32',
  m_szGuid:                    'const char *',
  m_nMajorVersion:             'int32',
  m_nMinorVersion:             'int32',
  m_nBuildNumber:              'int32',
  m_nRqSysMajorVer:            'int32',
  m_nRqSysMinorVer:            'int32',
  m_nRqSysKrnlLibMajorVer:     'int32',
  m_nRqSysKrnlLibMinorVer:     'int32',
  m_szName:                    'const char *',
  m_nLanguage:                 'int32',
  m_szExplain:                 'const char *',
  m_dwState:                   'uint32',
  m_szAuthor:                  'const char *',
  m_szZipCode:                 'const char *',
  m_szAddress:                 'const char *',
  m_szPhoto:                   'const char *',
  m_szFax:                     'const char *',
  m_szEmail:                   'const char *',
  m_szHomePage:                'const char *',
  m_szOther:                   'const char *',
  m_nDataTypeCount:            'int32',
  m_pDataType:                 'LIB_DATA_TYPE_INFO *',
  m_nCategoryCount:            'int32',
  m_szzCategory:               'void *',
  m_nCmdCount:                 'int32',
  m_pBeginCmdInfo:             'CMD_INFO *',
  m_pCmdsFunc:                 'void *',
  m_pfnRunAddInFn:             'void *',
  m_szzAddInFnInfo:            'const char *',
  m_pfnNotify:                 'void *',
  m_pfnSuperTemplate:          'void *',
  m_szzSuperTemplateInfo:      'const char *',
  m_nLibConstCount:            'int32',
  m_pLibConst:                 'void *',
  m_szzDependFiles:            'const char *',
})

// ========== 导出接口 ==========

export interface LibParam {
  name: string
  type: string
  description: string
  optional: boolean
  isVariable: boolean
  isArray: boolean
}

export interface LibCommand {
  name: string
  englishName: string
  description: string
  returnType: string
  category: string
  params: LibParam[]
  isHidden: boolean
  isMember: boolean
  ownerTypeName: string
  commandIndex: number
}

export interface LibDataType {
  name: string
  englishName: string
  description: string
  isWindowUnit: boolean
}

export interface LibConstant {
  name: string
  englishName: string
  description: string
  type: 'null' | 'number' | 'bool' | 'text'
  value: string
}

/** 属性类型常量 */
export const PropertyTypes = {
  PickSpecInt: 1000,
  Int: 1001,
  Double: 1002,
  Bool: 1003,
  DateTime: 1004,
  Text: 1005,
  PickInt: 1006,
  PickText: 1007,
  EditPickText: 1008,
  Picture: 1009,
  Icon: 1010,
  Cursor: 1011,
  Music: 1012,
  Font: 1013,
  Color: 1014,
  ColorTrans: 1015,
  FileName: 1016,
  ColorBack: 1017,
  ImageList: 1023,
  Customize: 1024,
} as const

export function propertyTypeToString(type: number): string {
  switch (type) {
    case PropertyTypes.Int: return '整数型'
    case PropertyTypes.Double: return '小数型'
    case PropertyTypes.Bool: return '逻辑型'
    case PropertyTypes.DateTime: return '日期时间型'
    case PropertyTypes.Text: return '文本型'
    case PropertyTypes.PickInt: return '选择整数'
    case PropertyTypes.PickText: return '选择文本'
    case PropertyTypes.EditPickText: return '编辑选择文本'
    case PropertyTypes.PickSpecInt: return '选择特定整数'
    case PropertyTypes.Picture: return '图片'
    case PropertyTypes.Icon: return '图标'
    case PropertyTypes.Cursor: return '鼠标指针'
    case PropertyTypes.Music: return '声音'
    case PropertyTypes.Font: return '字体'
    case PropertyTypes.Color: return '颜色'
    case PropertyTypes.ColorTrans: return '颜色(透明)'
    case PropertyTypes.ColorBack: return '背景颜色'
    case PropertyTypes.FileName: return '文件名'
    case PropertyTypes.ImageList: return '图片组'
    case PropertyTypes.Customize: return '自定义'
    default: return '未知'
  }
}

/** 窗口组件属性 */
export interface LibUnitProperty {
  name: string
  englishName: string
  description: string
  type: number       // PropertyTypes 值
  typeName: string
  isReadOnly: boolean
  pickOptions: string[]
}

/** 事件参数 */
export interface LibEventArg {
  name: string
  description: string
  dataType: string
  isByRef: boolean
}

/** 窗口组件事件 */
export interface LibUnitEvent {
  name: string
  description: string
  args: LibEventArg[]
}

/** 窗口组件完整信息 */
export interface LibWindowUnit {
  name: string
  englishName: string
  description: string
  libraryName: string
  properties: LibUnitProperty[]
  events: LibUnitEvent[]
}

export interface LibInfo {
  name: string
  guid: string
  version: string
  description: string
  author: string
  fileName: string
  commands: LibCommand[]
  dataTypes: LibDataType[]
  constants: LibConstant[]
  windowUnits: LibWindowUnit[]
}

// ========== 工具函数 ==========

function dataTypeToString(dt: number): string {
  if (dt === 0) return ''
  if (dt === SDT_BYTE)      return '字节型'
  if (dt === SDT_SHORT)     return '短整数型'
  if (dt === SDT_INT)       return '整数型'
  if (dt === SDT_INT64)     return '长整数型'
  if (dt === SDT_FLOAT)     return '小数型'
  if (dt === SDT_DOUBLE)    return '双精度小数型'
  if (dt === SDT_BOOL)      return '逻辑型'
  if (dt === SDT_DATE_TIME) return '日期时间型'
  if (dt === SDT_TEXT)      return '文本型'
  if (dt === SDT_BIN)       return '字节集'
  if (dt === SDT_SUB_PTR)   return '子程序指针'
  if ((dt & 0x80000000) === 0 && dt !== 0) return '自定义类型'
  return '通用型'
}

function formatLibConstValue(type: number, textValue: string, numValue: number): { type: 'null' | 'number' | 'bool' | 'text'; value: string } {
  if (type === 3) return { type: 'text', value: textValue || '' }
  if (type === 2) return { type: 'bool', value: numValue !== 0 ? '真' : '假' }
  if (type === 1) {
    const isIntLike = Number.isFinite(numValue) && Math.abs(numValue - Math.round(numValue)) < 1e-10
    return { type: 'number', value: isIntLike ? String(Math.round(numValue)) : String(numValue) }
  }
  return { type: 'null', value: '' }
}

function readCStr(ptr: unknown): string {
  if (!ptr) return ''
  try {
    return koffi.decode(ptr as never, 'const char *') as string
  } catch {
    return ''
  }
}

/** 解析以 \0 分隔、双 \0 结束的字符串列表 */
function readSzzStrings(ptr: unknown, count: number): string[] {
  if (!ptr || count <= 0) return []
  const result: string[] = []
  try {
    const maxBuf = count * 100
    const raw = koffi.decode(ptr as never, koffi.array('uint8', maxBuf)) as number[]
    const buf = Buffer.from(raw)
    let offset = 0
    for (let i = 0; i < count; i++) {
      const nullPos = buf.indexOf(0, offset)
      if (nullPos < 0) break
      let catName = buf.toString('utf8', offset, nullPos)
      // 去掉类别名前面的数字前缀（如 "0001"）
      const m = catName.match(/^\d{4}(.*)$/)
      if (m) catName = m[1]
      result.push(catName)
      offset = nullPos + 1
    }
  } catch {
    // 解析失败，返回已有结果
  }
  return result
}

// ========== 核心解析 ==========

export function parseFneFile(fnePath: string): LibInfo | null {
  let lib: ReturnType<typeof koffi.load> | null = null
  try {
    lib = koffi.load(fnePath)
  } catch (err) {
    console.error(`[fne-parser] 无法加载: ${fnePath}`, err)
    return null
  }

  let getNewInf: (() => unknown) | null = null
  const funcNames = ['GetNewInf', '_GetNewInf', 'GetLibInfo', '_GetLibInfo']
  for (const fn of funcNames) {
    try {
      getNewInf = lib.func(fn, 'LIB_INFO *', [])
      break
    } catch {
      // 尝试下一个名称
    }
  }

  if (!getNewInf) {
    console.error(`[fne-parser] 未找到导出函数: ${fnePath}`)
    lib.unload()
    return null
  }

  let pLibInfo: Record<string, unknown>
  try {
    const ptr = getNewInf()
    if (!ptr) {
      lib.unload()
      return null
    }
    // GetNewInf 返回的是不透明指针，需要用 koffi.decode 解码
    pLibInfo = koffi.decode(ptr as never, 'LIB_INFO') as Record<string, unknown>
  } catch (err) {
    console.error(`[fne-parser] 调用 GetNewInf 失败: ${fnePath}`, err)
    lib.unload()
    return null
  }

  if (!pLibInfo) {
    lib.unload()
    return null
  }

  // 提取文件名（不含扩展名）
  const parts = fnePath.replace(/\\/g, '/').split('/')
  const fileNameWithExt = parts[parts.length - 1]
  const dotPos = fileNameWithExt.lastIndexOf('.')
  const fileName = dotPos >= 0 ? fileNameWithExt.slice(0, dotPos) : fileNameWithExt

  // 基础信息
  const info: LibInfo = {
    name: (pLibInfo.m_szName as string) || '',
    guid: (pLibInfo.m_szGuid as string) || '',
    version: `${pLibInfo.m_nMajorVersion}.${pLibInfo.m_nMinorVersion}.${pLibInfo.m_nBuildNumber}`,
    description: (pLibInfo.m_szExplain as string) || '',
    author: (pLibInfo.m_szAuthor as string) || '',
    fileName,
    commands: [],
    dataTypes: [],
    constants: [],
    windowUnits: [],
  }

  // 解析支持库常量
  const libConstCount = pLibInfo.m_nLibConstCount as number
  const pLibConstArr = pLibInfo.m_pLibConst
  if (pLibConstArr && libConstCount > 0) {
    let constArray: Array<Record<string, unknown>>
    try {
      constArray = koffi.decode(pLibConstArr as never, koffi.array(LIB_CONST_INFO, libConstCount)) as Array<Record<string, unknown>>
    } catch {
      constArray = []
    }
    for (let i = 0; i < constArray.length; i++) {
      const c = constArray[i]
      const name = (c.m_szName as string) || ''
      if (!name) continue
      const typeNum = c.m_shtType as number
      const textValue = (c.m_szText as string) || ''
      const numValue = Number(c.m_dbValue as number)
      const formatted = formatLibConstValue(typeNum, textValue, numValue)
      info.constants.push({
        name,
        englishName: (c.m_szEgName as string) || '',
        description: (c.m_szExplain as string) || '',
        type: formatted.type,
        value: formatted.value,
      })
    }
  }

  // 解析命令类别
  const categoryCount = pLibInfo.m_nCategoryCount as number
  const categories = readSzzStrings(pLibInfo.m_szzCategory, categoryCount)

  // 解析命令
  const cmdCount = pLibInfo.m_nCmdCount as number
  const pCmdArr = pLibInfo.m_pBeginCmdInfo
  if (pCmdArr && cmdCount > 0) {
    let cmdArray: Array<Record<string, unknown>>
    try {
      cmdArray = koffi.decode(pCmdArr as never, koffi.array(CMD_INFO, cmdCount)) as Array<Record<string, unknown>>
    } catch {
      cmdArray = []
    }
    for (let i = 0; i < cmdArray.length; i++) {
      const c = cmdArray[i]
      const catIdx = (c.m_shtCategory as number) - 1
      const state = c.m_wState as number

      const cmdDescription = (c.m_szExplain as string) || ''
      const isMemberCmd = (c.m_shtCategory as number) === -1
      const cmd: LibCommand = {
        name: (c.m_szName as string) || '',
        englishName: (c.m_szEgName as string) || '',
        description: cmdDescription,
        returnType: dataTypeToString(c.m_dtRetValType as number),
        category: catIdx >= 0 && catIdx < categories.length ? categories[catIdx] : '',
        params: [],
        isHidden: (state & CT_IS_HIDED) !== 0,
        isMember: isMemberCmd,
        ownerTypeName: '',
        commandIndex: i,
      }

      // 解析参数
      const argCount = c.m_nArgCount as number
      const pArgs = c.m_pBeginArgInfo
      if (pArgs && argCount > 0) {
        let argArray: Array<Record<string, unknown>>
        try {
          argArray = koffi.decode(pArgs as never, koffi.array(ARG_INFO, argCount)) as Array<Record<string, unknown>>
        } catch {
          argArray = []
        }
        for (let j = 0; j < argCount; j++) {
          const a = argArray[j]
          const argState = a.m_dwState as number

          let type = dataTypeToString(a.m_dtType as number)
          if (argState & AS_RECEIVE_ALL_TYPE_DATA) type = '通用型'

          cmd.params.push({
            name: (a.m_szName as string) || '',
            type,
            description: (a.m_szExplain as string) || '',
            optional: (argState & AS_HAS_DEFAULT_VALUE) !== 0 || (argState & AS_DEFAULT_VALUE_IS_EMPTY) !== 0,
            isVariable: (argState & AS_RECEIVE_VAR) !== 0,
            isArray: (argState & AS_RECEIVE_ARRAY_DATA) !== 0 || (argState & AS_RECEIVE_VAR_ARRAY) !== 0,
          })
        }
      }

      info.commands.push(cmd)
    }
  }

  // 解析数据类型
  const dtCount = pLibInfo.m_nDataTypeCount as number
  const pDtArr = pLibInfo.m_pDataType
  if (pDtArr && dtCount > 0) {
    let dtArray: Array<Record<string, unknown>>
    try {
      dtArray = koffi.decode(pDtArr as never, koffi.array(LIB_DATA_TYPE_INFO, dtCount)) as Array<Record<string, unknown>>
    } catch {
      dtArray = []
    }
    for (let i = 0; i < dtCount; i++) {
      const d = dtArray[i]
      const state = d.m_dwState as number
      const dtName = (d.m_szName as string) || ''

      // 无论数据类型是否隐藏，都要标记其成员命令
      const dtCmdCount = d.m_nCmdCount as number
      const pCmdIndices = d.m_pnCmdsIndex
      if (pCmdIndices && dtCmdCount > 0) {
        try {
          const indices = koffi.decode(pCmdIndices as never, koffi.array('int32', dtCmdCount)) as number[]
          for (const idx of indices) {
            if (idx >= 0 && idx < info.commands.length) {
              info.commands[idx].isMember = true
              info.commands[idx].ownerTypeName = dtName
            }
          }
        } catch { /* 解析命令索引失败 */ }
      }

      if (state & LDT_IS_HIDED) continue

      const dtEnglishName = (d.m_szEgName as string) || ''
      const dtDescription = (d.m_szExplain as string) || ''
      const isWinUnit = (state & LDT_WIN_UNIT) !== 0

      info.dataTypes.push({
        name: dtName,
        englishName: dtEnglishName,
        description: dtDescription,
        isWindowUnit: isWinUnit,
      })

      // 窗口组件：解析属性和事件
      if (isWinUnit) {
        const unit: LibWindowUnit = {
          name: dtName,
          englishName: dtEnglishName,
          description: dtDescription,
          libraryName: info.name,
          properties: [],
          events: [],
        }

        // 解析属性
        const propCount = d.m_nPropertyCount as number
        const pPropArr = d.m_pPropertyBegin
        if (pPropArr && propCount > 0) {
          let propArray: Array<Record<string, unknown>>
          try {
            propArray = koffi.decode(pPropArr as never, koffi.array(UNIT_PROPERTY_RAW, propCount)) as Array<Record<string, unknown>>
          } catch {
            propArray = []
          }
          for (let j = 0; j < propArray.length; j++) {
            const p = propArray[j]
            const propState = p.m_wState as number
            if (propState & UW_IS_HIDED) continue

            const propType = p.m_shtType as number
            const prop: LibUnitProperty = {
              name: (p.m_szName as string) || '',
              englishName: (p.m_szEgName as string) || '',
              description: (p.m_szExplain as string) || '',
              type: propType,
              typeName: propertyTypeToString(propType),
              isReadOnly: (propState & UW_ONLY_READ) !== 0,
              pickOptions: [],
            }

            // 解析选择选项
            const pPickStr = p.m_szzPickStr
            if (pPickStr) {
              try {
                const maxBuf = 2000
                const raw = koffi.decode(pPickStr as never, koffi.array('uint8', maxBuf)) as number[]
                const buf = Buffer.from(raw)
                let offset = 0
                while (offset < buf.length) {
                  const nullPos = buf.indexOf(0, offset)
                  if (nullPos < 0 || nullPos === offset) break
                  prop.pickOptions.push(buf.toString('utf8', offset, nullPos))
                  offset = nullPos + 1
                }
              } catch { /* 解析选项失败 */ }
            }

            unit.properties.push(prop)
          }
        }

        // 解析事件
        const evtCount = d.m_nEventCount as number
        const pEvtArr = d.m_pEventBegin
        if (pEvtArr && evtCount > 0) {
          let evtArray: Array<Record<string, unknown>>
          try {
            evtArray = koffi.decode(pEvtArr as never, koffi.array(EVENT_INFO2_RAW, evtCount)) as Array<Record<string, unknown>>
          } catch {
            evtArray = []
          }
          for (let j = 0; j < evtArray.length; j++) {
            const ev = evtArray[j]
            const evState = ev.m_dwState as number
            if (evState & EV_IS_HIDED) continue

            const evt: LibUnitEvent = {
              name: (ev.m_szName as string) || '',
              description: (ev.m_szExplain as string) || '',
              args: [],
            }

            // 解析事件参数
            const evArgCount = ev.m_nArgCount as number
            const pEvArgs = ev.m_pEventArgInfo
            if (pEvArgs && evArgCount > 0) {
              let evArgArray: Array<Record<string, unknown>>
              try {
                evArgArray = koffi.decode(pEvArgs as never, koffi.array(EVENT_ARG_INFO2_RAW, evArgCount)) as Array<Record<string, unknown>>
              } catch {
                evArgArray = []
              }
              for (let k = 0; k < evArgArray.length; k++) {
                const a = evArgArray[k]
                evt.args.push({
                  name: (a.m_szName as string) || '',
                  description: (a.m_szExplain as string) || '',
                  dataType: dataTypeToString(a.m_dtDataType as number),
                  isByRef: ((a.m_dwState as number) & EAS_BY_REF) !== 0,
                })
              }
            }

            unit.events.push(evt)
          }
        }

        info.windowUnits.push(unit)
      }
    }
  }

  // 注意：不在这里 unload，因为 DLL 中的字符串指针在 unload 后失效
  // lib.unload() — 保持加载状态

  return info
}
