import type { Object3D } from 'three'

/** Named objects from room.glb, filled in by <Room/> once the model is parsed. */
export const registry = {
  objects: new Map<string, Object3D>(),
  get<T extends Object3D = Object3D>(name: string): T | undefined {
    return this.objects.get(name) as T | undefined
  },
}
