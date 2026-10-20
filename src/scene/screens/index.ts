import { NotepadPage } from './notepad'
import { TVScreen } from './tv'
import { VFD } from './vfd'

/** Canvas-backed surfaces shared by the 3D scene and the DOM overlays. */
export const screens = {
  tv: new TVScreen(),
  vfd: new VFD(),
  notepad: new NotepadPage(),
}
