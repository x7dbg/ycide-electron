export type ContractErrorLevel = 'ERROR' | 'INFO'

export interface ContractDiagnostic {
  level: ContractErrorLevel
  code: string
  libraryGuid: string
  libraryName: string
  filePath: string
  fieldPath: string
  message: string
  suggestion: string
}

export function makeFieldPath(basePath: string, ...segments: Array<string | number>): string {
  let path = basePath
  for (const segment of segments) {
    if (typeof segment === 'number') {
      path += `[${segment}]`
      continue
    }
    path += path ? `.${segment}` : segment
  }
  return path
}

export function makeDiagnostic(input: ContractDiagnostic): ContractDiagnostic {
  return {
    level: input.level,
    code: input.code,
    libraryGuid: input.libraryGuid,
    libraryName: input.libraryName,
    filePath: input.filePath,
    fieldPath: input.fieldPath,
    message: input.message,
    suggestion: input.suggestion,
  }
}
