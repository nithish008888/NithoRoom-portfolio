/** Minimal event bus (sound cues, cross-component nudges). */
export type EventName =
  | 'tape:lift'
  | 'tape:insert'
  | 'tape:eject'
  | 'tape:drop'
  | 'vcr:door'
  | 'tv:static'
  | 'tv:play'
  | 'notepad:lift'
  | 'notepad:down'
  | 'paper'
  | 'ui:click'
  | 'key'
  | 'cd:button'
  | 'cutfade'
  | 'switch'
  | 'lamp:click'
  | 'tube:tink'
  | 'thunder'

const map = new Map<EventName, Set<(d?: unknown) => void>>()

export function emit(name: EventName, data?: unknown) {
  map.get(name)?.forEach((fn) => fn(data))
}

export function on(name: EventName, fn: (d?: unknown) => void) {
  let s = map.get(name)
  if (!s) map.set(name, (s = new Set()))
  s.add(fn)
  return () => s!.delete(fn)
}
