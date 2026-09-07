import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : execFileSync('git', ['ls-files', '*.ts', '*.tsx'], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean)
const findings = []

for (const filename of files) {
  if (!existsSync(filename)) continue
  const source = readFileSync(filename, 'utf8')
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true)
  const visit = node => {
    if (
      ts.isAsExpression(node) &&
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === 'const'
    ) {
      const position = tree.getLineAndCharacterOfPosition(node.getStart(tree))
      findings.push(`${filename}:${position.line + 1}:${position.character + 1} No \`as const\``)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join('\n')}\n`)
  process.exitCode = 1
}
