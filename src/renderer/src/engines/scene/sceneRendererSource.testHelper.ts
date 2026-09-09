import entry from './SceneRenderer.ts?raw'
import support1 from './sceneRendererSupport1.ts?raw'
import support from './sceneRendererSupport2.ts?raw'

const parts = import.meta.glob<string>('./SceneRenderer*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
})

export const sceneRendererSource = [entry, support1, support, ...Object.values(parts)].join('\n')
