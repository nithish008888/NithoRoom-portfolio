/**
 * Hash routes are the source of truth for "where am I" so that browser Back,
 * reloads and shared links all work:
 *   #/            desk overview
 *   #/work        notepad lifted
 *   #/work/<id>   notepad + that project's tape in the VCR
 *   #/about       old computer
 *   #/resume      résumé printout
 *   #/contact     contact card
 *   #/music       CD player
 *   #/tv          zoomed television
 * Before the visitor enters the room the route is remembered and applied on entry.
 */
import { projectById } from '../content/site'
import { useStore, type View } from './store'

const VIEWS: View[] = ['overview', 'work', 'about', 'resume', 'contact', 'music', 'tv']

export type Route = { view: View; project: string | null }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const view = (VIEWS as string[]).includes(parts[0] ?? '') ? (parts[0] as View) : 'overview'
  const project = view === 'work' && projectById(parts[1]) ? parts[1]! : null
  return { view, project }
}

export function formatRoute({ view, project }: Route): string {
  if (view === 'overview') return '#/'
  if (view === 'work' && project) return `#/work/${project}`
  return `#/${view}`
}

let pending: Route | null = null

function apply(route: Route) {
  const s = useStore.getState()
  if (s.phase !== 'entered') {
    pending = route
    return
  }
  // the tape stays in the VCR when the notepad is put down; only an explicit project change swaps it
  const project = route.view === 'work' ? route.project ?? s.project : s.project
  s.set({ view: route.view, project })
}

/** Navigate (pushes a history entry unless replace). */
export function go(view: View, project: string | null = null, opts: { replace?: boolean } = {}) {
  const route = { view, project: view === 'work' ? project : null }
  const hash = formatRoute(route)
  if (location.hash !== hash) {
    if (opts.replace) history.replaceState(null, '', hash)
    else history.pushState(null, '', hash)
  }
  if (view === 'work' && project) {
    const s = useStore.getState()
    if (s.phase === 'entered') {
      s.set({ view, project })
      return
    }
  }
  apply(route)
}

export function backToDesk() {
  go('overview')
}

export function initRouter() {
  const initial = parseHash(location.hash)
  pending = initial
  window.addEventListener('popstate', () => apply(parseHash(location.hash)))
  window.addEventListener('hashchange', () => apply(parseHash(location.hash)))
}

/** Called when the visitor enters the room: applies the deep link (if any). */
export function consumePendingRoute(): Route {
  const r = pending ?? { view: 'overview', project: null }
  pending = null
  return r
}
