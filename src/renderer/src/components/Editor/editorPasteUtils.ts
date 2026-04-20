import { parseLines } from './eycBlocks'

export function findInsertAtForPastedSubs(lines: string[], cursorLine: number): number {
  if (cursorLine < 0 || cursorLine >= lines.length) return lines.length

  const parsed = parseLines(lines.join('\n'))
  let ownerSubLine = -1
  for (let i = Math.min(cursorLine, parsed.length - 1); i >= 0; i--) {
    if (parsed[i].type === 'sub') {
      ownerSubLine = i
      break
    }
  }

  if (ownerSubLine < 0) return lines.length

  for (let i = ownerSubLine + 1; i < parsed.length; i++) {
    if (parsed[i].type === 'sub') return i
  }

  return lines.length
}

export interface MultiLinePasteResult {
  nextText: string
  insertAt: number
  pastedLineCount: number
}

export function buildMultiLinePasteResult(params: {
  currentText: string
  clipText: string
  cursorLine: number
  sanitizePastedText: (clipText: string, currentText: string) => string
}): MultiLinePasteResult | null {
  const { currentText, clipText, cursorLine, sanitizePastedText } = params
  if (!clipText) return null

  const pastedLines = sanitizePastedText(clipText, currentText)
    .split('\n')
    .map(l => l.replace(/\r$/, ''))
  if (pastedLines.length === 0) return null

  const lines = currentText.split('\n')
  const pastedHasSub = parseLines(pastedLines.join('\n')).some(ln => ln.type === 'sub')

  let insertAt = lines.length
  if (pastedHasSub) {
    insertAt = findInsertAtForPastedSubs(lines, cursorLine)
  } else if (cursorLine >= 0) {
    // 与手工输入保持一致：粘贴在光标所在行生效，原行向下平移
    insertAt = Math.min(cursorLine, lines.length)
  }

  // 若粘贴内容不含子程序头，按光标行缩进整体平移，
  // 使嵌套流程块内粘贴时能够与上下文保持一致的缩进层级。
  let adjustedLines = pastedLines
  if (!pastedHasSub && cursorLine >= 0 && cursorLine < lines.length) {
    const baseLine = lines[cursorLine] ?? ''
    const baseIndent = baseLine.length - baseLine.trimStart().length
    if (baseIndent > 0) {
      const pad = ' '.repeat(baseIndent)
      adjustedLines = pastedLines.map(l => (l.length === 0 ? l : pad + l))
    }
  }

  const nextLines = [...lines]
  nextLines.splice(insertAt, 0, ...adjustedLines)

  return {
    nextText: nextLines.join('\n'),
    insertAt,
    pastedLineCount: adjustedLines.length,
  }
}
