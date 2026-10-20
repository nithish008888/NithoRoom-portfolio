import { Bloom, BrightnessContrast, ChromaticAberration, EffectComposer, HueSaturation, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useMemo } from 'react'
import { Vector2 } from 'three'
import { useStore } from '../state/store'

/** Restrained post: a little bloom for lamps/neon/VFD, film grain, vignette, faint edge fringing. */
export function Effects() {
  const lowPower = useStore((s) => s.lowPower)
  const ca = useMemo(() => new Vector2(0.00055, 0.00035), [])
  if (lowPower) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.32} luminanceThreshold={1.05} luminanceSmoothing={0.3} radius={0.55} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <HueSaturation saturation={0.08} />
        <Vignette offset={0.3} darkness={0.36} />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.42} luminanceThreshold={1.0} luminanceSmoothing={0.28} radius={0.6} />
      <ChromaticAberration offset={ca} radialModulation modulationOffset={0.45} blendFunction={BlendFunction.NORMAL} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      {/* AgX is gentle with saturated warm highlights; give the colour back a little */}
      <HueSaturation saturation={0.08} />
      <BrightnessContrast brightness={0.01} contrast={-0.02} />
      <Vignette offset={0.3} darkness={0.36} />
      <Noise premultiply opacity={0.28} />
    </EffectComposer>
  )
}
