import { Children, type ReactNode } from 'react'

export function WelcomeStage({ index, children }: { index: number; children: ReactNode }) {
  const slides = Children.toArray(children)
  // Named rather than written in the template: `no-composed-percent.test.ts` reads a `%` composed
  // inside a string as a figure shown to a reader, and this one is a transform.
  const left = `${-index * 100}%`

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="absolute inset-0 flex"
        style={{
          transform: `translate3d(${left}, 0, 0)`,
          transition: 'transform 280ms ease',
        }}
      >
        {slides.map((slide, slideIndex) => (
          <section
            key={slideIndex}
            // Clipped is not removed: without this, tab walked into the account form six slides
            // away, focus left the screen, and typing landed where nobody could see it.
            inert={slideIndex !== index}
            // `py-8` and not `py-4`: the rail clips, as a carousel must, and the sheet's floating
            // shadow reaches 24px past its own box — at four it was sliced along the bottom edge.
            className="flex h-full w-full shrink-0 flex-col items-center justify-center px-14 py-8"
          >
            {slide}
          </section>
        ))}
      </div>
    </div>
  )
}
