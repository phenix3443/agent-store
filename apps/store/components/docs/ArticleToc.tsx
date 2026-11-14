'use client'

import { useEffect, useState } from 'react'

export function ArticleToc({ label, items }: { label: string; items: { id: string; title: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id)
      },
      // The band just under the sticky nav bar.
      { rootMargin: '-90px 0px -65% 0px' }
    )
    for (const { id } of items) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label={label} className="art-toc">
      <b>{label}</b>
      {items.map(({ id, title }) => (
        <a key={id} href={`#${id}`} aria-current={id === current ? 'location' : undefined}>
          {title}
        </a>
      ))}
    </nav>
  )
}
