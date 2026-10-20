import { lazy, Suspense, useState } from 'react'
import { hasWebGL2, wantsReading } from './lib/device'
import { ReadingView } from './reading/ReadingView'
import { Overlay } from './ui/Overlay'

const Experience = lazy(() => import('./scene/Experience').then((m) => ({ default: m.Experience })))

export function App() {
  const [mode] = useState<'room' | 'reading' | 'fallback'>(() => (wantsReading() ? 'reading' : hasWebGL2() ? 'room' : 'fallback'))
  if (mode !== 'room') return <ReadingView fallback={mode === 'fallback'} />
  return (
    <>
      <Suspense fallback={null}>
        <Experience />
      </Suspense>
      <Overlay />
    </>
  )
}
