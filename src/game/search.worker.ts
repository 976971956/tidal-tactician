import { recommend } from './search'
import type { State } from './model'

self.onmessage = ({ data }: MessageEvent<{ state: State; depth: number }>) => {
  self.postMessage(recommend(data.state, data.depth))
}
