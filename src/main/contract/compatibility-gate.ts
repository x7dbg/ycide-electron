import type { ContractDiagnostic } from './contract-diagnostics.ts'
import { makeDiagnostic } from './contract-diagnostics.ts'

export interface CompatibilityLibraryInput {
  libraryGuid: string
  libraryName: string
  filePath: string
  sourceType?: 'builtin' | 'migrated' | 'third-party'
  metadataMajorVersion: number
  requiredCompilerVersion?: string
  requiredFeatures?: string[]
}

export interface CompatibilityRuntimeInput {
  compilerVersion: string
  supportedMetadataMajorVersion: number
  supportedFeatures: string[]
}

export type RepairChecklistGroup = Record<string, Record<string, Record<string, ContractDiagnostic[]>>>

export function evaluateLibraryCompatibility(
  libraries: CompatibilityLibraryInput[],
  runtime: CompatibilityRuntimeInput
): ContractDiagnostic[] {
  const diagnostics: ContractDiagnostic[] = []
  const supportedFeatures = new Set(runtime.supportedFeatures || [])
  for (const library of libraries) {
    if (library.metadataMajorVersion > runtime.supportedMetadataMajorVersion) {
      diagnostics.push(makeDiagnostic({
        level: 'ERROR',
        code: 'COMPAT-201',
        category: 'metadata',
        libraryGuid: library.libraryGuid,
        libraryName: library.libraryName,
        filePath: library.filePath,
        fieldPath: 'compatibility.metadataMajorVersion',
        message: `Metadata compatibility mismatch: current metadata support=${runtime.supportedMetadataMajorVersion}, required metadata=${library.metadataMajorVersion}`,
        suggestion: '升级编译器或更换兼容的支持库版本',
      }))
    }

    if (library.requiredCompilerVersion && compareSemver(runtime.compilerVersion, library.requiredCompilerVersion) < 0) {
      diagnostics.push(makeDiagnostic({
        level: 'ERROR',
        code: 'COMPAT-101',
        category: 'version',
        libraryGuid: library.libraryGuid,
        libraryName: library.libraryName,
        filePath: library.filePath,
        fieldPath: 'compatibility.requiredCompilerVersion',
        message: `Compiler version mismatch: current=${runtime.compilerVersion}, required=${library.requiredCompilerVersion}`,
        suggestion: '升级编译器版本以满足支持库要求',
      }))
    }

    const requiredFeatures = library.requiredFeatures || []
    for (const feature of requiredFeatures) {
      if (supportedFeatures.has(feature)) continue
      diagnostics.push(makeDiagnostic({
        level: 'ERROR',
        code: 'COMPAT-151',
        category: 'feature',
        libraryGuid: library.libraryGuid,
        libraryName: library.libraryName,
        filePath: library.filePath,
        fieldPath: `compatibility.requiredFeatures.${feature}`,
        message: `Feature mismatch: current features=[${runtime.supportedFeatures.join(', ')}], required feature=${feature}`,
        suggestion: '启用或实现缺失特性后重试编译',
      }))
    }
  }
  return sortDiagnosticsStableByLibrary(diagnostics)
}

export function sortDiagnosticsStableByLibrary(diagnostics: ContractDiagnostic[]): ContractDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const byLibrary = a.libraryName.localeCompare(b.libraryName)
    if (byLibrary !== 0) return byLibrary
    const byCode = a.code.localeCompare(b.code)
    if (byCode !== 0) return byCode
    return a.fieldPath.localeCompare(b.fieldPath)
  })
}

export function groupRepairChecklistByLibraryCategoryField(diagnostics: ContractDiagnostic[]): RepairChecklistGroup {
  const grouped: RepairChecklistGroup = {}
  for (const diagnostic of diagnostics) {
    const library = diagnostic.libraryName || '<unknown-library>'
    const category = diagnostic.category || 'general'
    const fieldPath = diagnostic.fieldPath || '<unknown-field>'
    if (!grouped[library]) grouped[library] = {}
    if (!grouped[library][category]) grouped[library][category] = {}
    if (!grouped[library][category][fieldPath]) grouped[library][category][fieldPath] = []
    grouped[library][category][fieldPath].push({ ...diagnostic })
  }
  return grouped
}

function compareSemver(current: string, required: string): number {
  const a = parseSemverParts(current)
  const b = parseSemverParts(required)
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1
    if (a[i] < b[i]) return -1
  }
  return 0
}

function parseSemverParts(value: string): [number, number, number] {
  const parts = (value || '').split('.').map((item) => {
    const parsed = Number(item)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return Math.floor(parsed)
  })
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}

