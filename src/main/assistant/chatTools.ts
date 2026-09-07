import { assistantAction, type ActionName } from '@shared/domain/assistant'
import { isRecord } from '@shared/guards'
import { englishText } from '@shared/i18n'
import type { ChatTool, CloudAnswer } from '@main/ai/cloudChat'
import { actionOfTool, schemaOfFields, toolName } from '@main/mcp/tools'
import { jsonIn } from './reply'

// The manuals a briefing printed, as the tools a chat door calls natively. Not `mcpTools()`: that
// door appends a consent field and says so — true of a client outside, false of the chain.
export function chatToolsFor(names: readonly ActionName[]): readonly ChatTool[] {
  return names.flatMap(name => {
    const action = assistantAction(name)
    return action
      ? [
          {
            name: toolName(name),
            description: englishText(action.descriptionKey),
            parameters: schemaOfFields(action.fields),
          },
        ]
      : []
  })
}

// The text as sent when nothing was called, else the calls folded into the `{say, ask, calls}` the
// FORMAT asks for. Arguments that do not parse read as `null`, which `readReply` refuses as a shape.
export function foldedReply(answer: CloudAnswer): string {
  if (answer.calls.length === 0) return answer.text

  // A `{say, ask}` written beside the calls is read; anything else is the sentence whole. Calls
  // written in that text are dropped: the tools are what this door was told to use.
  const said = jsonIn(answer.text)
  // Trimmed: beside its calls deepseek-chat sends runs of blanks for content (measured 2026-09-06).
  const say = isRecord(said) ? (typeof said.say === 'string' ? said.say : '') : answer.text.trim()
  const ask = isRecord(said) ? (said.ask ?? null) : null
  const calls = answer.calls.map(call => ({
    action: actionOfTool(call.name)?.name ?? call.name,
    input: jsonIn(call.arguments),
  }))
  return JSON.stringify({ say, ask, calls })
}
