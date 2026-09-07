import { WINDOW_HELP } from '@/components/windowStyles'

/** The words of a slide. The mark stands in `WelcomeMasthead`: it belongs to the window. */
export function WelcomeCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <h1 className="mb-2 text-lg font-semibold tracking-tight">{title}</h1>
      {/* Capped by `WINDOW_HELP`: on the wide sheet the sentence ran the whole width. */}
      <p className={WINDOW_HELP}>{body}</p>
    </div>
  )
}
