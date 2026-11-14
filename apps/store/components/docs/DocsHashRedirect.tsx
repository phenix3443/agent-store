'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { articleFor } from '@/lib/docs'

// Links from before the docs were split into articles point at /docs#<section>.
export function DocsHashRedirect() {
  const router = useRouter()
  useEffect(() => {
    const id = window.location.hash.slice(1)
    const article = id && articleFor(id)
    if (article) router.replace(`/docs/${article}#${id}`)
  }, [router])
  return null
}
