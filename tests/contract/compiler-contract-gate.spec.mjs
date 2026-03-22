import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

test('D6-06: compileProject hard-fails before codegen when loaded diagnostics contain ERROR', () => {
  const source = readSource('src/main/compiler.ts')
  const compileStart = source.indexOf('export async function compileProject')
  const gateIndex = source.indexOf('const gate = evaluateCompileContractGate()')
  const parseProjectIndex = source.indexOf('// 查找 .epp 文件')
  const codegenIndex = source.indexOf('generateMainC(project, tempDir, editorFiles, linkMode)')

  assert.ok(compileStart >= 0, 'compileProject should exist')
  assert.ok(gateIndex > compileStart, 'compile gate should be inside compileProject')
  assert.ok(gateIndex < parseProjectIndex, 'compile gate must run before project parse/codegen path')
  assert.ok(gateIndex < codegenIndex, 'compile gate must run before generateMainC')
  assert.ok(source.includes('success: false'))
})

test('D6-07/D6-13: failure diagnostics keep fixed schema and level only ERROR/INFO', async () => {
  const { makeDiagnostic } = await importTs('src/main/contract/contract-diagnostics.ts')
  const diagnostics = [
    makeDiagnostic({
      level: 'ERROR',
      code: 'CONTRACT_MISSING_EVENT_FIELD',
      libraryGuid: 'guid-error',
      libraryName: 'BrokenLib',
      filePath: 'D:/libs/broken.fne',
      fieldPath: 'events[0].route.channel',
      message: '缺少消息通道',
      suggestion: '补充 WM_COMMAND/WM_NOTIFY/WM_HSCROLL/WM_VSCROLL',
    }),
    makeDiagnostic({
      level: 'INFO',
      code: 'CONTRACT_HINT',
      libraryGuid: 'guid-info',
      libraryName: 'HintLib',
      filePath: 'D:/libs/hint.fne',
      fieldPath: 'contract',
      message: 'metadata checked',
      suggestion: 'no action required',
    }),
  ]

  for (const item of diagnostics) {
    assert.deepEqual(Object.keys(item).sort(), [
      'code',
      'fieldPath',
      'filePath',
      'level',
      'libraryGuid',
      'libraryName',
      'message',
      'suggestion',
    ])
    assert.ok(['ERROR', 'INFO'].includes(item.level))
    assert.equal(typeof item.code, 'string')
    assert.equal(typeof item.libraryGuid, 'string')
    assert.equal(typeof item.libraryName, 'string')
    assert.equal(typeof item.filePath, 'string')
    assert.equal(typeof item.fieldPath, 'string')
    assert.equal(typeof item.message, 'string')
    assert.equal(typeof item.suggestion, 'string')
  }
})

test('D6-08/D6-11: sidecar protocol JSON cannot be compile gate truth or pass condition', () => {
  const source = readSource('src/main/compiler.ts')
  const compileStart = source.indexOf('export async function compileProject')
  const parseProjectIndex = source.indexOf('// 查找 .epp 文件')
  const compilePreamble = source.slice(compileStart, parseProjectIndex)

  assert.ok(compilePreamble.includes('evaluateCompileContractGate'))
  assert.ok(!compilePreamble.includes('loadEventBindingProtocols'))
  assert.ok(source.includes('function loadEventBindingProtocols()'))
  assert.ok(source.includes('.events.json'))
  assert.ok(source.includes('.protocol.json'))
  assert.ok(source.includes('.compile-protocol.json'))
})

test('diagnostic snapshot: library-manager exposes loaded contract diagnostics for compile gate', () => {
  const managerSource = readSource('src/main/library-manager.ts')
  const compilerSource = readSource('src/main/compiler.ts')
  assert.ok(managerSource.includes('getLoadedContractDiagnostics()'))
  assert.ok(managerSource.includes('loadedContractDiagnostics'))
  assert.ok(managerSource.includes('validateBinaryContract'))
  assert.ok(compilerSource.includes('libraryManager.getLoadedContractDiagnostics'))
  assert.ok(compilerSource.includes('libraryGuid'))
  assert.ok(compilerSource.includes('libraryName'))
  assert.ok(compilerSource.includes('filePath'))
})

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
}

async function importTs(relativePath) {
  const target = path.join(repoRoot, relativePath)
  return import(pathToFileURL(target).href)
}
