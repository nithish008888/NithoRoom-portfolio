import { useEffect, useState } from 'react'

/** Shown if the GPU drops the WebGL context (driver reset, memory pressure). */
export function LostNotice() {
  const [lost, setLost] = useState(false)
  useEffect(() => {
    const on = () => setLost(true)
    document.body.addEventListener('room-lost', on)
    return () => document.body.removeEventListener('room-lost', on)
  }, [])
  if (!lost) return null
  return (
    <div className="lost" role="alertdialog" aria-labelledby="lost-h">
      <h2 id="lost-h">The 3D room stopped</h2>
      <p>Your graphics driver reset the page&rsquo;s WebGL context.</p>
      <p>
        <button className="pill pill-solid" onClick={() => location.reload()}>
          Reload the room
        </button>{' '}
        <a className="pill" href="?reading">
          Reading version
        </a>
      </p>
    </div>
  )
}
