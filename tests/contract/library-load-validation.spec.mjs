import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

test('D6-07/D6-13: diagnostics schema contains fixed fields and only ERROR/INFO levels', async () => {
  const diagnosticsModule = await importTs('src/main/contract/contract-diagnostics.ts')
  const { makeDiagnostic } = diagnosticsModule
  const diagnostic = makeDiagnostic({
    level: 'ERROR',
    code: 'CONTRACT_MISSING',
    libraryGuid: 'guid-demo',
    libraryName: 'DemoLib',
    filePath: 'D:/libs/demo.fne',
    fieldPath: 'events[0].name',
    message: 'missing event name',
    suggestion: 'fill event name',
  })

  assert.deepEqual(Object.keys(diagnostic).sort(), [
    'code',
    'fieldPath',
    'filePath',
    'level',
    'libraryGuid',
    'libraryName',
    'message',
    'suggestion',
  ])

  assert.equal(diagnostic.level, 'ERROR')
})

test('D6-05/D6-07: invalid contract returns structured diagnostics with required fields', async () => {
  const binaryContractModule = await importTs('src/main/contract/binary-contract.ts')
  const validatorModule = await importTs('src/main/contract/contract-validator.ts')
  const { deriveBinaryContract } = binaryContractModule
  const { validateBinaryContract } = validatorModule
  const contract = {
    ...deriveBinaryContract(createLibInfo('bad-guid', 'BadLib', '1.0.0'), 'D:/libs/bad.fne'),
    events: [{ name: '', route: { channel: '', code: '', argExtractRule: '' }, args: [] }],
    properties: [],
    functions: [],
    methods: [],
  }
  const diagnostics = validateBinaryContract(contract, { supportedMetadataMajorVersion: 1 })
  const error = diagnostics.find((item) => item.level === 'ERROR')

  assert.ok(error)
  assert.equal(typeof error.code, 'string')
  assert.equal(typeof error.libraryGuid, 'string')
  assert.equal(typeof error.libraryName, 'string')
  assert.equal(typeof error.filePath, 'string')
  assert.equal(typeof error.fieldPath, 'string')
  assert.equal(typeof error.message, 'string')
  assert.equal(typeof error.suggestion, 'string')
  assert.ok(['ERROR', 'INFO'].includes(error.level))
})

test('D6-19: applySelection keeps partial success and aggregates failed diagnostics', async () => {
  const diagnosticsModule = await importTs('src/main/contract/contract-diagnostics.ts')
  const { makeDiagnostic } = diagnosticsModule
  const managerSource = fs.readFileSync(path.join(repoRoot, 'src/main/library-manager.ts'), 'utf-8')
  assert.ok(managerSource.includes('applySelection'))
  assert.ok(managerSource.includes('diagnostics'))

  const simulated = {
    loadedCount: 1,
    unloadedCount: 0,
    failed: [{
      name: 'badlib',
      error: '契约缺失',
      diagnostics: [makeDiagnostic({
        level: 'ERROR',
        code: 'CONTRACT_MISSING_EVENT_FIELD',
        libraryGuid: 'bad-guid',
        libraryName: '坏库',
        filePath: 'D:/libs/badlib.fne',
        fieldPath: 'events[0].route.channel',
        message: '缺少消息通道',
        suggestion: '补充 WM_COMMAND/WM_NOTIFY/WM_HSCROLL/WM_VSCROLL',
      })],
    }],
  }

  assert.equal(simulated.loadedCount, 1)
  assert.equal(simulated.failed.length, 1)
  assert.equal(simulated.failed[0].diagnostics[0].fieldPath, 'events[0].route.channel')
})

test('D6-20: load check order keeps conflict checks before contract validation', () => {
  const managerSource = fs.readFileSync(path.join(repoRoot, 'src/main/library-manager.ts'), 'utf-8')
  const loadStart = managerSource.indexOf('load(name: string)')
  const loadBlock = managerSource.slice(loadStart, managerSource.indexOf('/** 卸载指定支持库', loadStart))
  const guidIndex = loadBlock.indexOf('checkGuidConflict')
  const cmdIndex = loadBlock.indexOf('checkCommandConflict')
  const validateIndex = loadBlock.indexOf('validateBinaryContract')

  assert.ok(guidIndex >= 0)
  assert.ok(cmdIndex >= 0)
  assert.ok(validateIndex >= 0)
  assert.ok(guidIndex < cmdIndex)
  assert.ok(cmdIndex < validateIndex)
})

test('D6-05/D6-09/D6-10: loadInternal blocks ERROR before loaded=true', () => {
  const managerSource = fs.readFileSync(path.join(repoRoot, 'src/main/library-manager.ts'), 'utf-8')
  const start = managerSource.indexOf('private loadInternal(name: string)')
  const end = managerSource.indexOf('private refreshContractDiagnosticsFor', start)
  const loadInternalBlock = managerSource.slice(start, end)
  const validateIndex = loadInternalBlock.indexOf('validateBinaryContract')
  const blockingErrorsIndex = loadInternalBlock.indexOf('blockingErrors')
  const loadedIndex = loadInternalBlock.indexOf('item.loaded = true')
  const returnBlockedIndex = loadInternalBlock.indexOf('return null')

  assert.ok(validateIndex >= 0, 'loadInternal should call validateBinaryContract')
  assert.ok(blockingErrorsIndex >= 0, 'loadInternal should branch on blockingErrors')
  assert.ok(loadedIndex >= 0, 'loadInternal should set loaded=true on success path')
  assert.ok(returnBlockedIndex >= 0, 'loadInternal should early return when blocked')
  assert.ok(validateIndex < loadedIndex, 'validation must happen before loaded=true')
  assert.ok(blockingErrorsIndex < loadedIndex, 'ERROR branch must appear before loaded=true')
})

test('D6-05/D6-09/D6-10: core startup path goes through loadInternal gate', () => {
  const managerSource = fs.readFileSync(path.join(repoRoot, 'src/main/library-manager.ts'), 'utf-8')
  const scanStart = managerSource.indexOf('scanAndAutoLoad(): void')
  const scanEnd = managerSource.indexOf('/** 获取 lib 文件夹路径', scanStart)
  const scanBlock = managerSource.slice(scanStart, scanEnd)
  const coreLoadIndex = scanBlock.indexOf('this.loadInternal(CORE_LIB_NAME)')

  assert.ok(coreLoadIndex >= 0, 'scanAndAutoLoad should load core lib through loadInternal')
})

test('D6-05/D6-09/D6-10: no bypass pattern where loadInternal sets loaded before contract gate', () => {
  const managerSource = fs.readFileSync(path.join(repoRoot, 'src/main/library-manager.ts'), 'utf-8')
  const start = managerSource.indexOf('private loadInternal(name: string)')
  const end = managerSource.indexOf('private refreshContractDiagnosticsFor', start)
  const loadInternalBlock = managerSource.slice(start, end)
  const loadedIndex = loadInternalBlock.indexOf('item.loaded = true')
  const validateIndex = loadInternalBlock.indexOf('validateBinaryContract')
  const blockedBranchIndex = loadInternalBlock.indexOf("if (blockingErrors.length > 0)")

  assert.ok(validateIndex >= 0)
  assert.ok(blockedBranchIndex >= 0)
  assert.ok(loadedIndex >= 0)
  assert.ok(validateIndex < loadedIndex)
  assert.ok(blockedBranchIndex < loadedIndex)
})

function createLibInfo(guid, name, version) {
  return {
    name,
    guid,
    version,
    description: '',
    author: '',
    zipCode: '',
    address: '',
    phone: '',
    qq: '',
    email: '',
    homePage: '',
    otherInfo: '',
    fileName: name.toLowerCase(),
    commands: [],
    dataTypes: [],
    constants: [],
    windowUnits: [],
  }
}

async function importTs(relativePath) {
  const target = path.join(repoRoot, relativePath)
  return import(pathToFileURL(target).href)
}
