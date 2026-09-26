import { stringify } from 'yaml'
import type { Asset, Scene } from 'shared'

export function formatScene(scene: Scene, index: number, assets: Asset[]): string {
  switch (scene.type) {
    case 'message':
      return scene.text ? `[${index}] message\n${scene.text}` : `[${index}] message`
    case 'image':
      return `[${index}] image ${scene.name}`
    case 'dialogue':
      return [`[${index}] dialogue ${scene.background}`, scene.speaker, scene.caption]
        .filter(Boolean)
        .join('\n')
    case 'video': {
      const prompt = assets.find(
        (asset) => asset.name.toLowerCase() === scene.name.toLowerCase(),
      )?.prompt
      const body = prompt ? stringify(prompt, { indent: 2 }).trim() : ''
      return body
        ? `[${index}] video ${scene.name}\n${body}`
        : `[${index}] video ${scene.name}`
    }
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}
