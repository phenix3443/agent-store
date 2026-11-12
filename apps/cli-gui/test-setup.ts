import { GlobalRegistrator } from '@happy-dom/global-registrator'
import '@testing-library/jest-dom'

GlobalRegistrator.register()

// Bun prints a failing matcher's values with Bun.inspect, which walks a happy-dom node into
// its whole window: one failed toBe on an element wrote ~1 GB and grew the process to ~5 GB
// (2026-11-12). Print nodes as a short tag instead.
Object.defineProperty(Node.prototype, Bun.inspect.custom, {
  value(this: Node) {
    const html = (this as Element).outerHTML ?? this.nodeName
    return html.length > 200 ? `${html.slice(0, 200)}…` : html
  },
})
