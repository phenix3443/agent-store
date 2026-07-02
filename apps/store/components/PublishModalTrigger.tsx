'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PublishModal } from './PublishModal'

export function PublishModalTrigger() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const open = searchParams.get('publish') === '1'

  function close() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('publish')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return <PublishModal open={open} onOpenChange={(next) => { if (!next) close() }} />
}
