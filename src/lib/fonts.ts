import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/caveat/600.css'
import '@fontsource/caveat/700.css'
import '@fontsource/vt323/400.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/catamaran/800.css'
import '@fontsource/catamaran/900.css'

export const F = {
  wide: '"Archivo Variable", "Archivo", "Arial Black", sans-serif',
  hand: '"Caveat", "Segoe Print", cursive',
  term: '"VT323", "Lucida Console", monospace',
  type: '"Courier Prime", "Courier New", monospace',
  tamil: '"Catamaran", "Nirmala UI", sans-serif',
}

/** Resolves once the web fonts used inside canvases are ready (canvas text needs them loaded). */
export const fontsReady: Promise<void> = (async () => {
  try {
    await Promise.all([
      document.fonts.load(`900 40px ${F.wide}`),
      document.fonts.load(`600 40px ${F.hand}`),
      document.fonts.load(`700 40px ${F.hand}`),
      document.fonts.load(`40px ${F.term}`),
      document.fonts.load(`40px ${F.type}`),
      document.fonts.load(`700 40px ${F.type}`),
      document.fonts.load(`900 40px ${F.tamil}`, 'மழை'),
    ])
  } catch {
    /* fall back to system fonts */
  }
})()
