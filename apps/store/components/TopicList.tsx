import type { TopicSummary } from '@as/types'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

/** Topic index rows: title, the topic's own description, and how many packages it holds. */
export function TopicList({ topics, label }: { topics: TopicSummary[]; label: string }) {
  const t = useTranslations('site.topics')
  return (
    <ul aria-label={label}>
      {topics.map((topic) => (
        <li key={topic.slug} className="border-b border-line">
          <Link
            href={`/topics/${topic.slug}`}
            className="group grid gap-x-10 gap-y-2 py-6 transition-colors hover:bg-sel md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_auto] md:items-baseline md:px-3"
          >
            <span className="text-[22px] leading-7 tracking-[-0.015em] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4 sm:text-[28px] sm:leading-8">
              {topic.title}
            </span>
            <span className="max-w-[62ch] text-[15px] leading-6 text-ink-2">{topic.description}</span>
            <span className="font-mono text-sm text-ink-2 md:text-right">{t('count', { count: topic.packageCount })}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
