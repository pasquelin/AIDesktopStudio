import { answersAfter, type AskedQuestion } from '@shared/domain/assistantAsk'
import { Checkbox } from '@/components/Checkbox'
import { Radio } from '@/components/Radio'
import { rowSkin } from '@/components/styles'
import { cn } from '@/helpers/cn'

export type AssistantConversationChoiceListProps = {
  /** The question itself: `many` is what decides between a box and a radio. */
  asked: AskedQuestion
  chosen: readonly string[]
  onChange: (chosen: readonly string[]) => void
  /** Ties the radios of ONE question together: unnamed, a pick clears the question above. */
  named: string
}

/**
 * The answers as a scrollable column, ticked rather than pressed — the ONE form a card offers.
 *
 * 🛑 Measured on screen: four folder paths laid out as buttons wrapped into a staircase, and
 * nothing in a row of look-alike buttons said whether one answer was allowed or several. A box
 * or a radio says it before anything is pressed, and says it the same way on every card.
 */
export function AssistantConversationChoiceList({
  asked,
  chosen,
  onChange,
  named,
}: AssistantConversationChoiceListProps) {
  const many = asked.many === true

  return (
    <ul className="border-border max-h-56 overflow-y-auto rounded-(--radius-sc-sm) border p-1">
      {asked.choices.map(choice => {
        const picked = chosen.includes(choice)

        return (
          <li key={choice}>
            {/* The whole line answers, not the box alone: a path is what one aims at. */}
            <label
              // The attribute travels with the skin, on the SAME element: `rowSkin` paints the
              // background, `data-selected` is what lifts the words that sit on it.
              data-selected={picked || undefined}
              className={cn(rowSkin(picked), 'flex cursor-pointer items-start gap-2 px-2 py-1')}
            >
              {many ? (
                <Checkbox
                  checked={picked}
                  onChange={() => onChange(answersAfter(asked, chosen, choice))}
                />
              ) : (
                <Radio
                  name={named}
                  checked={picked}
                  onChange={() => onChange(answersAfter(asked, chosen, choice))}
                />
              )}
              {/* `break-all`: an absolute path holds no space to break at, and it is the case
                  this list was drawn for. */}
              <span className="text-text text-xs break-all">{choice}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}
