import type { Item } from './items'

/** A topic as listed on the index: one card per topic. */
export interface TopicSummary {
  slug: string
  title: string
  description: string
  /** Packages in the topic that are currently published. */
  packageCount: number
}

export interface TopicRef {
  slug: string
  title: string
}

/** A curated, ordered group of packages for one kind of work (from the registry's topic/). */
export interface Topic {
  slug: string
  title: string
  description: string
  intro: string
  /** What an agent can do with these packages installed. */
  capabilities: string[]
  /** In the topic's order; packages that are no longer published are left out. */
  packages: Item[]
  related: TopicRef[]
}
