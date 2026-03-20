import { useState, useCallback, useEffect, useRef } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import type { TreeNode } from './components/Sidebar/Sidebar'
import Editor, { type EditorTab, type EditorHandle } from './components/Editor/Editor'
import OutputPanel, { type OutputMessage, type CommandDetail, type FileProblem } from './components/OutputPanel/OutputPanel'
import StatusBar from './components/StatusBar/StatusBar'
import LibraryDialog from './components/LibraryDialog/LibraryDialog'
import NewProjectDialog from './components/NewProjectDialog/NewProjectDialog'
import type { SelectionTarget, AlignAction, DesignForm, DesignControl } from './components/Editor/VisualDesigner'
import './App.css'

type ProjectSessionState = {
  openTabs: string[]
  activeTabPath?: string
}

function App(): React.JSX.Element {
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [outputHeight, setOutputHeight] = useState(200)
  const [showOutput, setShowOutput] = useState(true)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [selection, setSelection] = useState<SelectionTarget>(null)
  const [sidebarTab, setSidebarTab] = useState<'project' | 'library' | 'property'>('project')
  const [alignAction, setAlignAction] = useState<AlignAction>(null)
  const [multiSelectCount, setMultiSelectCount] = useState(0)
  const [openProjectFiles, setOpenProjectFiles] = useState<EditorTab[]>()
  const [projectTree, setProjectTree] = useState<TreeNode[]>([])
  const [currentProjectDir, setCurrentProjectDir] = useState<string>('')
  const currentProjectDirRef = useRef('')
  const editorRef = useRef<EditorHandle>(null)
  const [themeList, setThemeList] = useState<string[]>([])
  const [currentTheme, setCurrentTheme] = useState<string>('')
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [outputMessages, setOutputMessages] = useState<OutputMessage[]>([])
  const [commandDetail, setCommandDetail] = useState<CommandDetail | null>(null)
  const commandCacheRef = useRef<Map<string, CommandDetail | null>>(new Map())
  const [fileProblems, setFileProblems] = useState<FileProblem[]>([])
  const [designProblems, setDesignProblems] = useState<FileProblem[]>([])
  const openTabsRef = useRef<EditorTab[]>([])
  const activeFileIdRef = useRef<string | null>(null)
  const [cursorLine, setCursorLine] = useState<number | undefined>(undefined)
  const [cursorColumn, setCursorColumn] = useState<number | undefined>(undefined)
  const [docType, setDocType] = useState('')
  const [isCompiling, setIsCompiling] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [forceOutputTab, setForceOutputTab] = useState<'compile' | 'problems' | null>(null)
  const [targetArch, setTargetArch] = useState('x64')
  // 监听编译器输出
  useEffect(() => {
    const handleOutput = (msg: OutputMessage) => {
      setOutputMessages(prev => [...prev, msg])
    }
    window.api.on('compiler:output', handleOutput)
    return () => { window.api.off('compiler:output') }
  }, [])

  // 监听程序退出
  useEffect(() => {
    const handleExit = () => {
      setIsRunning(false)
    }
    window.api.on('compiler:processExit', handleExit)
    return () => { window.api.off('compiler:processExit') }
  }, [])

  // 检查设计时诊断：扫描所有 efw 标签页中的控件类型，找出依赖库未加载的
  const checkDesignProblems = useCallback(async (tabs: EditorTab[]) => {
    try {
      const units = await window.api.library.getWindowUnits() as Array<{ name: string; englishName?: string }>
      const knownTypes = new Set<string>(
        units.flatMap(u => [u.name, u.englishName].filter((n): n is string => !!n))
      )
      const problems: FileProblem[] = []
      for (const tab of tabs) {
        if (tab.language !== 'efw' || !tab.formData) continue
        for (const ctrl of tab.formData.controls) {
          if (!knownTypes.has(ctrl.type)) {
            problems.push({
              line: 0,
              column: 0,
              severity: 'error',
              file: tab.label,
              message: `窗口“${tab.formData.name}”中的控件“${ctrl.name}”(${ctrl.type})所依赖的支持库未加载`,
            })
          }
        }
      }
      setDesignProblems(problems)
    } catch {
      // 无法获取窗口单元列表时忽略
    }
  }, [])

  // 硬件加载或卸载时重新检查
  const handleLibraryChange = useCallback(() => {
    checkDesignProblems(openTabsRef.current)
  }, [checkDesignProblems])

  // 编译运行
  const handleCompileRun = useCallback(async () => {
    if (!currentProjectDir || isCompiling) return
    // 有无效命令时阻断运行，切换到问题面板
    if (fileProblems.length > 0 || designProblems.length > 0) {
      setShowOutput(true)
      setForceOutputTab('problems')
      setTimeout(() => setForceOutputTab(null), 100)
      return
    }
    setIsCompiling(true)
    editorRef.current?.save()
    setOutputMessages([])
    setShowOutput(true)
    setForceOutputTab('compile')
    const editorFiles = editorRef.current?.getEditorFiles()
    const result = await window.api.compiler.run(currentProjectDir, editorFiles, targetArch)
    setIsCompiling(false)
    setForceOutputTab(null)
    if (result?.success) setIsRunning(true)
  }, [currentProjectDir, isCompiling, targetArch, fileProblems, designProblems])

  // 普通编译
  const handleCompile = useCallback(async () => {
    if (!currentProjectDir || isCompiling) return
    if (fileProblems.length > 0 || designProblems.length > 0) {
      setShowOutput(true)
      setForceOutputTab('problems')
      setTimeout(() => setForceOutputTab(null), 100)
      return
    }
    setIsCompiling(true)
    editorRef.current?.save()
    setOutputMessages([])
    setShowOutput(true)
    setForceOutputTab('compile')
    const editorFiles = editorRef.current?.getEditorFiles()
    await window.api.compiler.compile(currentProjectDir, editorFiles, 'normal', targetArch)
    setIsCompiling(false)
    setForceOutputTab(null)
  }, [currentProjectDir, isCompiling, targetArch, fileProblems, designProblems])

  // 静态编译
  const handleCompileStatic = useCallback(async () => {
    if (!currentProjectDir || isCompiling) return
    if (fileProblems.length > 0 || designProblems.length > 0) {
      setShowOutput(true)
      setForceOutputTab('problems')
      setTimeout(() => setForceOutputTab(null), 100)
      return
    }
    setIsCompiling(true)
    editorRef.current?.save()
    setOutputMessages([])
    setShowOutput(true)
    setForceOutputTab('compile')
    const editorFiles = editorRef.current?.getEditorFiles()
    await window.api.compiler.compile(currentProjectDir, editorFiles, 'static', targetArch)
    setIsCompiling(false)
    setForceOutputTab(null)
  }, [currentProjectDir, isCompiling, fileProblems, designProblems])

  // 停止运行
  const handleStop = useCallback(() => {
    window.api.compiler.stop()
    setIsRunning(false)
  }, [])

  // 命令点击：查找命令详情
  const [highlightParamIndex, setHighlightParamIndex] = useState<number | undefined>(undefined)

  const handleCommandClick = useCallback(async (commandName: string, paramIndex?: number) => {
    const builtinTypeDescriptions: Record<string, string> = {
      '字节型': '可容纳 0 到 255 之间的数值。',
      '短整数型': '可容纳 -32768 到 32767 之间的数值。',
      '整数型': '可容纳 -2147483648 到 2147483647 之间的数值。',
      '长整数型': '可容纳更大范围的整数值（64位）。',
      '小数型': '单精度浮点数。',
      '双精度小数型': '双精度浮点数。',
      '逻辑型': '布尔值，仅可为真或假。',
      '文本型': '文本字符串类型。',
      '日期时间型': '日期与时间类型。',
      '字节集': '可变长二进制字节数据。',
      '子程序指针': '可指向子程序以便间接调用。',
      '通用型': '可承载多种类型的值。',
    }

    if (commandName.startsWith('__TYPE__:')) {
      const typeName = commandName.slice('__TYPE__:'.length).trim()
      if (!typeName) return
      setHighlightParamIndex(undefined)
      setCommandDetail({
        name: typeName,
        englishName: '',
        description: builtinTypeDescriptions[typeName] || `数据类型“${typeName}”`,
        returnType: '',
        category: '数据类型',
        libraryName: '项目/基础类型',
        params: [],
      })
      setShowOutput(true)
      return
    }

    if (commandName.startsWith('__PARAM__:')) {
      const payload = commandName.slice('__PARAM__:'.length)
      const [paramName = '', paramType = '', ownerSub = ''] = payload.split(':')
      if (!paramName) return
      setHighlightParamIndex(undefined)
      const desc = ownerSub
        ? `参数“${paramName}”的数据类型为“${paramType || '通用型'}”，所属子程序“${ownerSub}”。`
        : `参数“${paramName}”的数据类型为“${paramType || '通用型'}”。`
      setCommandDetail({
        name: paramName,
        englishName: '',
        description: desc,
        returnType: paramType || '',
        category: '参数',
        libraryName: '当前源码',
        params: [],
      })
      setShowOutput(true)
      return
    }

    // 对象.方法 形式，取方法名
    const name = commandName.includes('.') ? commandName.split('.').pop()! : commandName
    setHighlightParamIndex(paramIndex)

    // 先查缓存
    if (commandCacheRef.current.has(name)) {
      const cached = commandCacheRef.current.get(name)!
      setCommandDetail(cached)
      setShowOutput(true)
      return
    }

    // 从支持库加载全部命令并查找
    const allCommands = await window.api.library.getAllCommands()
    const cmd = allCommands.find((c: CommandDetail) => c.name === name)
    if (cmd) {
      const detail: CommandDetail = {
        name: cmd.name,
        englishName: cmd.englishName,
        description: cmd.description,
        returnType: cmd.returnType,
        category: cmd.category,
        libraryName: cmd.libraryName || '',
        params: cmd.params,
      }
      commandCacheRef.current.set(name, detail)
      setCommandDetail(detail)
    } else {
      setCommandDetail({ name, englishName: '', description: '未在已加载的支持库中找到此命令', returnType: '', category: '', libraryName: '', params: [] })
    }
    setShowOutput(true)
  }, [])

  const handleCommandClear = useCallback(() => {
    setCommandDetail(null)
  }, [])

  // 加载主题列表和当前主题
  const applyTheme = useCallback(async (name: string) => {
    const theme = await window.api?.theme?.load(name)
    if (!theme?.colors) return
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(key, value as string)
    }
    setCurrentTheme(name)
    window.api?.theme?.setCurrent(name)
  }, [])

  useEffect(() => {
    (async () => {
      const list = await window.api?.theme?.getList()
      if (list) setThemeList(list)
      const saved = await window.api?.theme?.getCurrent()
      if (saved) applyTheme(saved)
    })()
  }, [applyTheme])

  const handleAlignDone = useCallback(() => setAlignAction(null), [])

  const extractSubroutineNodes = useCallback((content: string, fileName: string): TreeNode[] => {
    const nodes: TreeNode[] = []
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
    const re = /^\s*\.子程序\s+([^,\s]+)/
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i])
      if (!m) continue
      const subName = (m[1] || '').trim()
      if (!subName) continue
      nodes.push({
        id: `${fileName}::sub::${i}`,
        label: subName,
        type: 'sub',
        fileId: fileName,
        fileName,
      })
    }
    return nodes
  }, [])

  const extractGlobalVarNodes = useCallback((content: string, fileName: string): TreeNode[] => {
    const nodes: TreeNode[] = []
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
    const re = /^\s*\.全局变量\s+([^,\s]+)/
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i])
      if (!m) continue
      const name = (m[1] || '').trim()
      if (!name) continue
      nodes.push({
        id: `${fileName}::global::${i}`,
        label: name,
        type: 'func',
        fileId: fileName,
        fileName,
      })
    }
    return nodes
  }, [])

  const extractConstantNodes = useCallback((content: string, fileName: string): TreeNode[] => {
    const nodes: TreeNode[] = []
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
    const re = /^\s*\.常量\s+([^,\s]+)/
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i])
      if (!m) continue
      const name = (m[1] || '').trim()
      if (!name) continue
      nodes.push({
        id: `${fileName}::const::${i}`,
        label: name,
        type: 'func',
        fileId: fileName,
        fileName,
      })
    }
    return nodes
  }, [])

  const extractDataTypeNodes = useCallback((content: string, fileName: string): TreeNode[] => {
    const nodes: TreeNode[] = []
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
    const re = /^\s*\.数据类型\s+([^,\s]+)/
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i])
      if (!m) continue
      const name = (m[1] || '').trim()
      if (!name) continue
      nodes.push({
        id: `${fileName}::dtype::${i}`,
        label: name,
        type: 'class',
        fileId: fileName,
        fileName,
      })
    }
    return nodes
  }, [])

  const extractDllCommandNodes = useCallback((content: string, fileName: string): TreeNode[] => {
    const nodes: TreeNode[] = []
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
    const re = /^\s*\.DLL命令\s+([^,\s]+)/
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i])
      if (!m) continue
      const name = (m[1] || '').trim()
      if (!name) continue
      nodes.push({
        id: `${fileName}::dll::${i}`,
        label: name,
        type: 'func',
        fileId: fileName,
        fileName,
      })
    }
    return nodes
  }, [])

  // 从 epp 文件列表构建项目树，按类别分组
  const buildProjectTreeFromEpp = useCallback(async (projectName: string, files: Array<{ type: string; fileName: string; flag: number }>, projectDir: string): Promise<TreeNode[]> => {
    const windowFiles: TreeNode[] = []
    const sourceFiles: TreeNode[] = []
    const globalVarFiles: TreeNode[] = []
    const constantFiles: TreeNode[] = []
    const dataTypeFiles: TreeNode[] = []
    const dllCmdFiles: TreeNode[] = []
    const imageResourceFiles: TreeNode[] = []
    const soundResourceFiles: TreeNode[] = []
    const videoResourceFiles: TreeNode[] = []
    const otherResourceFiles: TreeNode[] = []

    const imageExtSet = new Set(['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg', 'ico', 'tif', 'tiff'])
    const soundExtSet = new Set(['wav', 'mp3', 'ogg', 'wma', 'aac', 'flac', 'm4a', 'mid', 'midi'])
    const videoExtSet = new Set(['mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm', 'flv', 'm4v', 'mpeg', 'mpg'])

    for (const f of files) {
      if (f.type === 'EFW') {
        windowFiles.push({ id: f.fileName, label: f.fileName, type: 'window' })
      } else if (f.type === 'EYC') {
        const filePath = projectDir + '\\' + f.fileName
        const content = await window.api?.project?.readFile(filePath)
        const subNodes = extractSubroutineNodes(content || '', f.fileName)
        sourceFiles.push({ id: f.fileName, label: f.fileName, type: 'module', children: subNodes, expanded: false })
      } else if (f.type === 'EGV') {
        const filePath = projectDir + '\\' + f.fileName
        const content = await window.api?.project?.readFile(filePath)
        const varNodes = extractGlobalVarNodes(content || '', f.fileName)
        globalVarFiles.push({ id: f.fileName, label: f.fileName, type: 'module', children: varNodes, expanded: false })
      } else if (f.type === 'ECS') {
        const filePath = projectDir + '\\' + f.fileName
        const content = await window.api?.project?.readFile(filePath)
        const constNodes = extractConstantNodes(content || '', f.fileName)
        constantFiles.push({ id: f.fileName, label: f.fileName, type: 'module', children: constNodes, expanded: false })
      } else if (f.type === 'EDT') {
        const filePath = projectDir + '\\' + f.fileName
        const content = await window.api?.project?.readFile(filePath)
        const dtNodes = extractDataTypeNodes(content || '', f.fileName)
        dataTypeFiles.push({ id: f.fileName, label: f.fileName, type: 'module', children: dtNodes, expanded: false })
      } else if (f.type === 'ELL') {
        const filePath = projectDir + '\\' + f.fileName
        const content = await window.api?.project?.readFile(filePath)
        const dllNodes = extractDllCommandNodes(content || '', f.fileName)
        dllCmdFiles.push({ id: f.fileName, label: f.fileName, type: 'module', children: dllNodes, expanded: false })
      } else {
        const ext = (f.fileName.split('.').pop() || '').toLowerCase()
        const node = { id: f.fileName, label: f.fileName, type: 'resource' as const }
        if (videoExtSet.has(ext)) {
          videoResourceFiles.push(node)
        } else if (imageExtSet.has(ext)) {
          imageResourceFiles.push(node)
        } else if (soundExtSet.has(ext)) {
          soundResourceFiles.push(node)
        } else {
          otherResourceFiles.push(node)
        }
      }
    }

    const resourceChildren: TreeNode[] = [
      { id: '_cat_resources_images', label: '图片', type: 'folder', expanded: true, children: imageResourceFiles },
      { id: '_cat_resources_sounds', label: '声音', type: 'folder', expanded: true, children: soundResourceFiles },
      { id: '_cat_resources_videos', label: '视频', type: 'folder', expanded: true, children: videoResourceFiles },
    ]
    if (otherResourceFiles.length > 0) {
      resourceChildren.push({ id: '_cat_resources_others', label: '其他资源', type: 'folder', expanded: false, children: otherResourceFiles })
    }

    const categories: TreeNode[] = []
    categories.push({ id: '_cat_windows', label: '窗口', type: 'folder', expanded: true, children: windowFiles })
    categories.push({ id: '_cat_sources', label: '程序集', type: 'folder', expanded: true, children: sourceFiles })
    categories.push({ id: '_cat_globals', label: '全局变量', type: 'folder', expanded: true, children: globalVarFiles })
    categories.push({ id: '_cat_constants', label: '常量表', type: 'folder', expanded: true, children: constantFiles })
    categories.push({ id: '_cat_datatypes', label: '自定义数据类型', type: 'folder', expanded: true, children: dataTypeFiles })
    categories.push({ id: '_cat_dllcmds', label: 'DLL命令', type: 'folder', expanded: true, children: dllCmdFiles })
    categories.push({ id: '_cat_resources', label: '资源', type: 'folder', expanded: false, children: resourceChildren })

    return [{ id: 'root', label: projectName, type: 'folder', expanded: true, children: categories }]
  }, [extractSubroutineNodes, extractGlobalVarNodes, extractConstantNodes, extractDataTypeNodes, extractDllCommandNodes])

  // 标签页变化时保存到项目目录，并重新检查设计时诊断
  const handleOpenTabsChange = useCallback((tabs: EditorTab[]) => {
    openTabsRef.current = tabs
    const dir = currentProjectDirRef.current
    if (dir) {
      const session: ProjectSessionState = {
        openTabs: tabs.filter(t => t.filePath).map(t => t.filePath!),
        activeTabPath: activeFileIdRef.current ?? undefined,
      }
      window.api?.project?.saveOpenTabs(dir, session)
    }
    checkDesignProblems(tabs)
  }, [checkDesignProblems])

  // 刷新项目树（窗口重命名后调用）
  const refreshProjectTree = useCallback(async () => {
    const dir = currentProjectDirRef.current
    if (!dir) return
    const dirFiles = await window.api?.file?.readDir(dir) as string[] | undefined
    if (!dirFiles) return
    const eppFile = dirFiles.find(f => f.endsWith('.epp'))
    if (!eppFile) return
    const eppInfo = await window.api?.project?.parseEpp(dir + '\\' + eppFile)
    if (eppInfo) {
      setProjectTree(await buildProjectTreeFromEpp(eppInfo.projectName, eppInfo.files, dir))
    }
  }, [buildProjectTreeFromEpp])

  // 同步 ref
  useEffect(() => {
    currentProjectDirRef.current = currentProjectDir
  }, [currentProjectDir])

  useEffect(() => {
    activeFileIdRef.current = activeFileId
  }, [activeFileId])

  // 切换活动标签时也同步会话，确保下次打开优先恢复到上次标签
  useEffect(() => {
    const dir = currentProjectDirRef.current
    if (!dir) return
    const session: ProjectSessionState = {
      openTabs: openTabsRef.current.filter(t => t.filePath).map(t => t.filePath!),
      activeTabPath: activeFileId ?? undefined,
    }
    window.api?.project?.saveOpenTabs(dir, session)
  }, [activeFileId])

  const handleAppClose = useCallback(async () => {
    const hasUnsaved = editorRef.current?.hasModifiedTabs?.() ?? false
    if (hasUnsaved) {
      const action = await window.api?.dialog?.confirmSaveBeforeClose('未保存文件')
      if (action === 'cancel') return
      if (action === 'save') {
        editorRef.current?.saveAll()
      }
    }
    window.api?.window.close()
  }, [])

  const handleMenuAction = useCallback(async (action: string) => {
    switch (action) {
      // 文件菜单
      case 'file:newProject':
        setShowNewProject(true)
        break
      case 'file:openProject': {
        const eppPath = await window.api?.project?.openEpp()
        if (!eppPath) return
        const eppInfo = await window.api?.project?.parseEpp(eppPath)
        if (!eppInfo) return
        const dir = eppPath.replace(/\\[^\\]+$/, '')
        setCurrentProjectDir(dir)
        if (eppInfo.platform) setTargetArch(eppInfo.platform)
        setProjectTree(await buildProjectTreeFromEpp(eppInfo.projectName, eppInfo.files, dir))

        const buildTabFromPath = async (fp: string): Promise<EditorTab | null> => {
          const fileName = fp.split('\\').pop() || ''
          const ext = fileName.split('.').pop()?.toLowerCase()
          const content = await window.api?.project?.readFile(fp)
          if (content === null || content === undefined) return null

          if (ext === 'efw') {
            const efwData = JSON.parse(content)
            const formData: DesignForm = {
              name: efwData.name || fileName.replace('.efw', ''),
              title: efwData.title || '',
              width: efwData.width || 592,
              height: efwData.height || 384,
              sourceFile: efwData.sourceFile,
              properties: efwData.properties || undefined,
              controls: (efwData.controls || []).map((c: any) => ({
                id: c.id, type: c.type, name: c.name,
                left: c.x ?? c.left ?? 0, top: c.y ?? c.top ?? 0,
                width: c.width ?? 100, height: c.height ?? 30,
                text: c.properties?.['标题'] ?? c.properties?.['内容'] ?? c.properties?.['文本'] ?? c.text ?? c.name ?? '',
                visible: c.visible ?? true, enabled: c.enabled ?? true, properties: c.properties || {},
              }))
            }
            return { id: fp, label: fileName, language: 'efw', value: '', savedValue: JSON.stringify(formData, null, 2), filePath: fp, formData }
          }

          if (ext === 'eyc' || ext === 'ecc' || ext === 'egv' || ext === 'ecs' || ext === 'edt' || ext === 'ell') {
            return { id: fp, label: fileName, language: ext === 'ecc' ? 'eyc' : ext, value: content, savedValue: content, filePath: fp }
          }

          return null
        }

        // 恢复之前打开的标签页
        const session = await window.api?.project?.loadOpenTabs(dir)
        const savedPaths = session?.openTabs || []
        const restoredTabs: EditorTab[] = []
        if (savedPaths && savedPaths.length > 0) {
          for (const fp of savedPaths) {
            const tab = await buildTabFromPath(fp)
            if (tab) restoredTabs.push(tab)
          }
        }

        // Editor 默认激活第一个标签，因此将上次活动标签前置
        if (session?.activeTabPath && restoredTabs.length > 1) {
          const activeIndex = restoredTabs.findIndex(t => t.filePath?.toLowerCase() === session.activeTabPath?.toLowerCase())
          if (activeIndex > 0) {
            const [activeTab] = restoredTabs.splice(activeIndex, 1)
            restoredTabs.unshift(activeTab)
          }
        }

        // 未恢复到任何标签页时，默认打开 epp 中标记的主活动文件（flag=1）
        if (restoredTabs.length === 0) {
          const mainFile = eppInfo.files.find((f: { type: string; fileName: string; flag: number }) => f.flag === 1)
            || eppInfo.files.find((f: { type: string; fileName: string; flag: number }) => f.type === 'EFW')
            || eppInfo.files[0]
          if (mainFile) {
            const mainTab = await buildTabFromPath(dir + '\\' + mainFile.fileName)
            if (mainTab) restoredTabs.push(mainTab)
          }
        }

        if (restoredTabs.length > 0) setOpenProjectFiles(restoredTabs)
        break
      }
      case 'file:save':
        editorRef.current?.save()
        break
      case 'file:saveAll':
        editorRef.current?.saveAll()
        break
      case 'file:closeFile':
        editorRef.current?.closeActiveTab()
        break
      case 'file:closeProject':
        {
          const hasUnsaved = editorRef.current?.hasModifiedTabs?.() ?? false
          if (hasUnsaved) {
            const action = await window.api?.dialog?.confirmSaveBeforeClose('未保存文件')
            if (action === 'cancel') break
            if (action === 'save') {
              editorRef.current?.saveAll()
            }
          }
        }
        editorRef.current?.clearAllTabs()
        setOpenProjectFiles([])
        setProjectTree([])
        setCurrentProjectDir('')
        setSelection(null)
        setSidebarTab('project')
        break
      case 'file:exit':
        await handleAppClose()
        break

      // 编辑菜单
      case 'edit:undo':
      case 'edit:redo':
      case 'edit:cut':
      case 'edit:copy':
      case 'edit:paste':
      case 'edit:delete':
      case 'edit:selectAll':
      case 'edit:find':
      case 'edit:replace':
        editorRef.current?.editorAction(action.split(':')[1])
        break

      // 视图菜单
      case 'view:property':
        setSidebarTab('property')
        break
      case 'view:output':
        setShowOutput(v => !v)
        break
      case 'view:library':
        setSidebarTab('library')
        break
      case 'view:project':
        setSidebarTab('project')
        break

      // 工具菜单
      case 'tools:library':
        setShowLibrary(true)
        break

      // 编译菜单
      case 'build:compile':
        handleCompile()
        break
      case 'build:compile-static':
        handleCompileStatic()
        break
      case 'build:build':
        handleCompile()
        break
      case 'build:run':
        handleCompileRun()
        break

      // 调试菜单
      case 'debug:run':
        handleCompileRun()
        break
      case 'debug:stop':
        handleStop()
        break

      // 插入菜单
      case 'insert:sub':
        editorRef.current?.insertDeclaration()
        break
      case 'insert:localVar':
        editorRef.current?.insertLocalVariable()
        break
      case 'insert:module': {
        const dir = currentProjectDirRef.current
        if (!dir) break
        // 生成不重复的文件名
        const existingFiles = projectTree[0]?.children
          ?.find(c => c.id === '_cat_sources')?.children?.map(c => c.label) || []
        let n = 1
        while (existingFiles.includes('程序集' + n + '.eyc')) n++
        const newFileName = '程序集' + n + '.eyc'
        const assemblyName = '程序集' + n
        const content = '.版本 2\n.程序集 ' + assemblyName + '\n\n.子程序 子程序1\n\n'
        await window.api?.project?.addFile(dir, newFileName, 'EYC', content)
        // 更新项目树：添加新文件到程序集分类
        setProjectTree(prev => prev.map(root => ({
          ...root,
          children: root.children?.map(cat =>
            cat.id === '_cat_sources'
              ? { ...cat, children: [...(cat.children || []), { id: newFileName, label: newFileName, type: 'module' as const, children: extractSubroutineNodes(content, newFileName), expanded: false }] }
              : cat
          )
        })))
        // 打开新文件
        const filePath = dir + '\\' + newFileName
        editorRef.current?.openFile({ id: filePath, label: newFileName, language: 'eyc', value: content, savedValue: content, filePath })
        break
      }
      case 'insert:classModule': {
        const dir = currentProjectDirRef.current
        if (!dir) break
        // 生成不重复的文件名（放在程序集分类下）
        const existingFiles = projectTree[0]?.children
          ?.find(c => c.id === '_cat_sources')?.children?.map(c => c.label) || []
        let n = 1
        while (existingFiles.includes('类模块' + n + '.ecc')) n++
        const newFileName = '类模块' + n + '.ecc'
        const className = '类' + n
        const content =
          '.版本 2\n\n' +
          '.程序集 ' + className + ', , , \n\n' +
          '.子程序 _初始化, , , , 当基于本类的对象被创建后，此方法会被自动调用\n\n\n\n' +
          '.子程序 _销毁, , , , 当基于本类的对象被销毁前，此方法会被自动调用\n\n'
        await window.api?.project?.addFile(dir, newFileName, 'EYC', content)
        // 更新项目树：添加新文件到程序集分类
        setProjectTree(prev => prev.map(root => ({
          ...root,
          children: root.children?.map(cat =>
            cat.id === '_cat_sources'
              ? { ...cat, children: [...(cat.children || []), { id: newFileName, label: newFileName, type: 'module' as const, children: extractSubroutineNodes(content, newFileName), expanded: false }] }
              : cat
          )
        })))
        // 打开新文件（使用 EYC 编辑体验）
        const filePath = dir + '\\' + newFileName
        editorRef.current?.openFile({ id: filePath, label: newFileName, language: 'eyc', value: content, savedValue: content, filePath })
        break
      }
      case 'insert:globalVar':
      {
        const dir = currentProjectDirRef.current
        if (!dir) break
        const existingFiles = projectTree[0]?.children
          ?.find(c => c.id === '_cat_globals')?.children?.map(c => c.label) || []
        const globalFileName = '全局变量.egv'
        const filePath = dir + '\\' + globalFileName

        // 优先使用编辑器中的最新内容（含未保存修改），再回退到磁盘内容
        const editorFiles = editorRef.current?.getEditorFiles()
        const fromEditor = editorFiles?.[globalFileName]
        const fromDisk = fromEditor === undefined ? await window.api?.project?.readFile(filePath) : undefined
        const baseContent = (fromEditor ?? fromDisk ?? '.版本 2\n\n').replace(/\r\n/g, '\n')

        let n = 1
        while (new RegExp('^\\.全局变量\\s+全局变量' + n + '(?:,|\\s|$)', 'm').test(baseContent)) n++
        const varName = '全局变量' + n
        const appendLine = '.全局变量 ' + varName + ', 整数型'
        const content = baseContent.trimEnd() + '\n' + appendLine + '\n\n'

        if (!existingFiles.includes(globalFileName)) {
          await window.api?.project?.addFile(dir, globalFileName, 'EGV', content)
          setProjectTree(prev => prev.map(root => ({
            ...root,
            children: root.children?.map(cat =>
              cat.id === '_cat_globals'
                ? { ...cat, children: [...(cat.children || []), { id: globalFileName, label: globalFileName, type: 'module' as const, children: extractGlobalVarNodes(content, globalFileName), expanded: false }] }
                : cat
            )
          })))
        } else {
          await window.api?.file?.save(filePath, content)
        }

        editorRef.current?.upsertFile({ id: filePath, label: globalFileName, language: 'egv', value: content, savedValue: content, filePath })
        break
      }
      case 'insert:constant':
      {
        const dir = currentProjectDirRef.current
        if (!dir) break
        const existingFiles = projectTree[0]?.children
          ?.find(c => c.id === '_cat_constants')?.children?.map(c => c.label) || []
        const constantFileName = '常量.ecs'
        const filePath = dir + '\\' + constantFileName

        // 优先使用编辑器中的最新内容（含未保存修改），再回退到磁盘内容
        const editorFiles = editorRef.current?.getEditorFiles()
        const fromEditor = editorFiles?.[constantFileName]
        const fromDisk = fromEditor === undefined ? await window.api?.project?.readFile(filePath) : undefined
        const baseContent = (fromEditor ?? fromDisk ?? '.版本 2\n\n').replace(/\r\n/g, '\n')

        let n = 1
        while (new RegExp('^\\.常量\\s+常量' + n + '(?:,|\\s|$)', 'm').test(baseContent)) n++
        const constName = '常量' + n
        const appendLine = '.常量 ' + constName + ', 0'
        const content = baseContent.trimEnd() + '\n' + appendLine + '\n\n'

        if (!existingFiles.includes(constantFileName)) {
          await window.api?.project?.addFile(dir, constantFileName, 'ECS', content)
          setProjectTree(prev => prev.map(root => ({
            ...root,
            children: root.children?.map(cat =>
              cat.id === '_cat_constants'
                ? { ...cat, children: [...(cat.children || []), { id: constantFileName, label: constantFileName, type: 'module' as const, children: extractConstantNodes(content, constantFileName), expanded: false }] }
                : cat
            )
          })))
        } else {
          await window.api?.file?.save(filePath, content)
        }

        editorRef.current?.upsertFile({ id: filePath, label: constantFileName, language: 'ecs', value: content, savedValue: content, filePath })
        break
      }
      case 'insert:dataType':
      {
        const dir = currentProjectDirRef.current
        if (!dir) break
        const existingFiles = projectTree[0]?.children
          ?.find(c => c.id === '_cat_datatypes')?.children?.map(c => c.label) || []
        const dataTypeFileName = '自定义数据类型.edt'
        const filePath = dir + '\\' + dataTypeFileName

        // 优先使用编辑器中的最新内容（含未保存修改），再回退到磁盘内容
        const editorFiles = editorRef.current?.getEditorFiles()
        const fromEditor = editorFiles?.[dataTypeFileName]
        const fromDisk = fromEditor === undefined ? await window.api?.project?.readFile(filePath) : undefined
        const baseContent = (fromEditor ?? fromDisk ?? '.版本 2\n\n').replace(/\r\n/g, '\n')

        let n = 1
        while (new RegExp('^\\.数据类型\\s+数据类型' + n + '(?:,|\\s|$)', 'm').test(baseContent)) n++
        const dataTypeName = '数据类型' + n
        const appendBlock = '.数据类型 ' + dataTypeName + '\n    .成员 成员1, 整数型'
        const content = baseContent.trimEnd() + '\n' + appendBlock + '\n\n'

        if (!existingFiles.includes(dataTypeFileName)) {
          await window.api?.project?.addFile(dir, dataTypeFileName, 'EDT', content)
          setProjectTree(prev => prev.map(root => ({
            ...root,
            children: root.children?.map(cat =>
              cat.id === '_cat_datatypes'
                ? { ...cat, children: [...(cat.children || []), { id: dataTypeFileName, label: dataTypeFileName, type: 'module' as const, children: extractDataTypeNodes(content, dataTypeFileName), expanded: false }] }
                : cat
            )
          })))
        } else {
          await window.api?.file?.save(filePath, content)
        }

        editorRef.current?.upsertFile({ id: filePath, label: dataTypeFileName, language: 'edt', value: content, savedValue: content, filePath })
        break
      }
      case 'insert:dllCmd':
      {
        const dir = currentProjectDirRef.current
        if (!dir) break
        const existingFiles = projectTree[0]?.children
          ?.find(c => c.id === '_cat_dllcmds')?.children?.map(c => c.label) || []
        const dllFileName = 'DLL命令.ell'
        const filePath = dir + '\\' + dllFileName

        // 优先使用编辑器中的最新内容（含未保存修改），再回退到磁盘内容
        const editorFiles = editorRef.current?.getEditorFiles()
        const fromEditor = editorFiles?.[dllFileName]
        const fromDisk = fromEditor === undefined ? await window.api?.project?.readFile(filePath) : undefined
        const baseContent = (fromEditor ?? fromDisk ?? '.版本 2\n\n').replace(/\r\n/g, '\n')

        let n = 1
        while (new RegExp('^\\.DLL命令\\s+DLL命令' + n + '(?:,|\\s|$)', 'm').test(baseContent)) n++
        const dllName = 'DLL命令' + n
        const appendLine = '.DLL命令 ' + dllName + ', , "", ""'
        const content = baseContent.trimEnd() + '\n' + appendLine + '\n\n'

        if (!existingFiles.includes(dllFileName)) {
          await window.api?.project?.addFile(dir, dllFileName, 'ELL', content)
          setProjectTree(prev => prev.map(root => ({
            ...root,
            children: root.children?.map(cat =>
              cat.id === '_cat_dllcmds'
                ? { ...cat, children: [...(cat.children || []), { id: dllFileName, label: dllFileName, type: 'module' as const, children: extractDllCommandNodes(content, dllFileName), expanded: false }] }
                : cat
            )
          })))
        } else {
          await window.api?.file?.save(filePath, content)
        }

        editorRef.current?.upsertFile({ id: filePath, label: dllFileName, language: 'ell', value: content, savedValue: content, filePath })
        break
      }
      case 'insert:window':
      case 'insert:resource':
        break

      // 主题切换
      default:
        if (action.startsWith('theme:')) {
          const themeName = action.substring(6)
          applyTheme(themeName)
        }
        break
    }
  }, [buildProjectTreeFromEpp, extractGlobalVarNodes, extractConstantNodes, extractDataTypeNodes, extractDllCommandNodes, applyTheme, handleCompile, handleCompileStatic, handleCompileRun, handleStop, handleAppClose])

  // 双击资源管理器文件时打开
  const handleOpenFile = useCallback(async (fileId: string, fileName: string, targetLine?: number) => {
    const dir = currentProjectDirRef.current
    if (!dir) return
    const filePath = dir + '\\' + fileName
    const ext = fileName.split('.').pop()?.toLowerCase()

    if (ext === 'efw') {
      const content = await window.api?.project?.readFile(filePath)
      if (!content) return
      const efwData = JSON.parse(content)
      const formData: DesignForm = {
        name: efwData.name || fileName.replace('.efw', ''),
        title: efwData.title || '',
        width: efwData.width || 592,
        height: efwData.height || 384,
        sourceFile: efwData.sourceFile,
        properties: efwData.properties || undefined,
        controls: (efwData.controls || []).map((c: any) => ({
          id: c.id, type: c.type, name: c.name,
          left: c.x ?? c.left ?? 0, top: c.y ?? c.top ?? 0,
          width: c.width ?? 100, height: c.height ?? 30,
          text: c.properties?.['标题'] ?? c.properties?.['内容'] ?? c.properties?.['文本'] ?? c.text ?? c.name ?? '',
          visible: c.visible ?? true, enabled: c.enabled ?? true, properties: c.properties || {},
        }))
      }
      editorRef.current?.openFile({ id: filePath, label: fileName, language: 'efw', value: '', savedValue: JSON.stringify(formData, null, 2), filePath, formData })
    } else if (ext === 'eyc' || ext === 'ecc' || ext === 'egv' || ext === 'ecs' || ext === 'edt' || ext === 'ell') {
      const content = await window.api?.project?.readFile(filePath)
      if (!content) return
      editorRef.current?.openFile({ id: filePath, label: fileName, language: ext === 'ecc' ? 'eyc' : ext, value: content, savedValue: content, filePath })
      if (targetLine && targetLine > 0) {
        setTimeout(() => {
          editorRef.current?.navigateToLine(targetLine)
        }, 80)
      }
    }
  }, [])

  const handleNewProjectConfirm = useCallback(async (info: { name: string; path: string; type: string; platform: string }) => {
    try {
      const result = await window.api?.project?.create(info)
      if (!result) return

      setCurrentProjectDir(result.projectDir)
      if (info.platform) setTargetArch(info.platform)

      // 通过解析 epp 文件获取所有关联文件并构建项目树
      const eppInfo = await window.api?.project?.parseEpp(result.eppPath)
      if (eppInfo) {
        setProjectTree(await buildProjectTreeFromEpp(eppInfo.projectName, eppInfo.files, result.projectDir))
      }

      // 窗口程序：仅打开 efw 窗口文件
      if (info.type === 'windows-app') {
        const efwPath = result.projectDir + '\\_启动窗口.efw'
        const efwContent = await window.api?.project?.readFile(efwPath)
        if (efwContent) {
          const efwData = JSON.parse(efwContent)
          const formData: DesignForm = {
            name: efwData.name || '_启动窗口',
            title: efwData.title || info.name,
            width: efwData.width || 592,
            height: efwData.height || 384,
            sourceFile: efwData.sourceFile,
            properties: efwData.properties || undefined,
            controls: (efwData.controls || []).map((c: any) => ({
              id: c.id,
              type: c.type,
              name: c.name,
              left: c.x ?? c.left ?? 0,
              top: c.y ?? c.top ?? 0,
              width: c.width ?? 100,
              height: c.height ?? 30,
              text: c.properties?.['标题'] ?? c.properties?.['内容'] ?? c.properties?.['文本'] ?? c.text ?? c.name ?? '',
              visible: c.visible ?? true,
              enabled: c.enabled ?? true,
              properties: c.properties || {},
            }))
          }
          setOpenProjectFiles([{
            id: efwPath,
            label: '_启动窗口.efw',
            language: 'efw',
            value: '',
            savedValue: JSON.stringify(formData, null, 2),
            filePath: efwPath,
            formData,
          }])
        }
      }
      // 控制台/DLL：打开 eyc 文件
      else {
        const eycPath = result.projectDir + `\\${info.name}.eyc`
        const eycContent = await window.api?.project?.readFile(eycPath)
        if (eycContent) {
          setOpenProjectFiles([{
            id: eycPath,
            label: `${info.name}.eyc`,
            language: 'eyc',
            value: eycContent,
            savedValue: eycContent,
            filePath: eycPath,
          }])
        }
      }
    } catch (err) {
      console.error('创建项目失败:', err)
    }
  }, [buildProjectTreeFromEpp])

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // 已被子组件处理
      if (e.defaultPrevented) return
      // 弹窗打开时不处理快捷键
      if (showLibrary || showNewProject) return

      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const code = e.code
      const key = e.key

      let action: string | null = null

      // 文件菜单
      if (ctrl && shift && code === 'KeyN') action = 'file:newProject'
      else if (ctrl && shift && code === 'KeyO') action = 'file:openProject'
      else if (ctrl && shift && code === 'KeyS') action = 'file:saveAll'
      else if (ctrl && !shift && code === 'KeyS') action = 'file:save'
      else if (ctrl && !shift && code === 'KeyW') action = 'file:closeFile'
      // 编辑菜单
      else if (ctrl && !shift && code === 'KeyZ') action = 'edit:undo'
      else if (ctrl && !shift && code === 'KeyY') action = 'edit:redo'
      else if (ctrl && !shift && code === 'KeyX') action = 'edit:cut'
      else if (ctrl && !shift && code === 'KeyC') action = 'edit:copy'
      else if (ctrl && !shift && code === 'KeyV') action = 'edit:paste'
      else if (ctrl && !shift && code === 'KeyF') action = 'edit:find'
      else if (ctrl && !shift && code === 'KeyH') action = 'edit:replace'
      // 编译菜单
      else if (ctrl && !shift && key === 'F7') action = 'build:compile'
      else if (!ctrl && !shift && key === 'F7') action = 'build:build'
      // 调试菜单
      else if (!ctrl && !shift && key === 'F5') action = 'build:run'
      else if (!ctrl && shift && key === 'F5') action = 'debug:stop'
      else if (!ctrl && !shift && key === 'F9') action = 'debug:toggleBreakpoint'
      else if (!ctrl && !shift && key === 'F10') action = 'debug:stepOver'
      else if (ctrl && !shift && key === 'F10') action = 'debug:runToCursor'
      else if (!ctrl && !shift && key === 'F11') action = 'debug:stepInto'
      else if (!ctrl && shift && key === 'F11') action = 'debug:stepOut'
      // 帮助
      // 插入菜单
      else if (ctrl && !shift && code === 'KeyL') action = 'insert:localVar'
      else if (!ctrl && !shift && key === 'F1') action = 'help:topics'

      if (action) {
        // 编辑类快捷键在原生输入框中时让浏览器处理
        const tag = (document.activeElement as HTMLElement)?.tagName
        if (action.startsWith('edit:') && action !== 'edit:find' && action !== 'edit:replace'
          && (tag === 'INPUT' || tag === 'TEXTAREA')) return
        // 有浏览器原生文本选中时，让浏览器处理复制/剪切/全选
        if ((action === 'edit:copy' || action === 'edit:cut' || action === 'edit:selectAll') && window.getSelection()?.toString()) return
        e.preventDefault()
        handleMenuAction(action)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleMenuAction, showLibrary, showNewProject])

  return (
    <div className="app">
      <TitleBar onMenuAction={handleMenuAction} onWindowClose={() => { void handleAppClose() }} hasProject={!!currentProjectDir} hasOpenFile={(openProjectFiles?.length ?? 0) > 0} themes={themeList} currentTheme={currentTheme} />
      <Toolbar
        hasControlSelected={multiSelectCount >= 2}
        onAlign={setAlignAction}
        onCompileRun={handleCompileRun}
        onStop={handleStop}
        hasProject={!!currentProjectDir}
        isCompiling={isCompiling}
        isRunning={isRunning}
        arch={targetArch}
        onArchChange={(arch: string) => {
          setTargetArch(arch)
          if (currentProjectDir) window.api?.project?.updatePlatform(currentProjectDir, arch)
        }}
        onNew={() => handleMenuAction('file:newProject')}
        onOpen={() => handleMenuAction('file:openProject')}
        onSave={() => handleMenuAction('file:save')}
        onUndo={() => handleMenuAction('edit:undo')}
        onRedo={() => handleMenuAction('edit:redo')}
      />
      <div className="app-body">
        <Sidebar width={sidebarWidth} onResize={setSidebarWidth} selection={selection} activeTab={sidebarTab} onTabChange={setSidebarTab} onSelectControl={setSelection} onPropertyChange={(kind, ctrlId, prop, val) => editorRef.current?.updateFormProperty(kind, ctrlId, prop, val)} projectTree={projectTree} onOpenFile={handleOpenFile} activeFileId={activeFileId ? activeFileId.replace(/^.*[\\/]/, '') : null} projectDir={currentProjectDir} onEventNavigate={(sel, eventName, eventArgs) => editorRef.current?.navigateToEventSub(sel, eventName, eventArgs)} onLibraryChange={handleLibraryChange} />
        <div className="app-main">
          <Editor
            ref={editorRef}
            onSelectControl={setSelection}
            onSidebarTab={setSidebarTab}
            selection={selection}
            alignAction={alignAction}
            onAlignDone={handleAlignDone}
            onMultiSelectChange={setMultiSelectCount}
            openProjectFiles={openProjectFiles}
            onOpenTabsChange={handleOpenTabsChange}
            onActiveTabChange={setActiveFileId}
            onCommandClick={handleCommandClick}
            onCommandClear={handleCommandClear}
            onProblemsChange={setFileProblems}
            onCursorChange={(line, col) => { setCursorLine(line); setCursorColumn(col) }}
            onDocTypeChange={setDocType}
            projectDir={currentProjectDir}
            onProjectTreeRefresh={refreshProjectTree}
          />
        </div>
      </div>
      {showOutput && (
        <OutputPanel
          height={outputHeight}
          onResize={setOutputHeight}
          onClose={() => setShowOutput(false)}
          messages={outputMessages}
          commandDetail={commandDetail}
          highlightParamIndex={highlightParamIndex}
          problems={[...fileProblems, ...designProblems]}
          forceTab={forceOutputTab}
          onProblemClick={(p) => editorRef.current?.navigateToLine(p.line)}
        />
      )}
      <StatusBar
        onToggleOutput={() => setShowOutput(!showOutput)}
        errorCount={[...fileProblems, ...designProblems].filter(p => p.severity === 'error').length}
        warningCount={[...fileProblems, ...designProblems].filter(p => p.severity === 'warning').length}
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        docType={docType}
      />
      <LibraryDialog open={showLibrary} onClose={() => setShowLibrary(false)} />
      <NewProjectDialog open={showNewProject} onClose={() => setShowNewProject(false)} onConfirm={handleNewProjectConfirm} />
    </div>
  )
}

export default App
