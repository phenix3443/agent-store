import { getPublisherWithItems } from '@/lib/catalog'
import { InterceptedPublisher } from '@/components/InterceptedPublisher'

interface InterceptedPublisherProps {
  params: { name: string }
}

export default async function InterceptedPublisherDrawer({ params }: InterceptedPublisherProps) {
  const result = await getPublisherWithItems(params.name)

  if (!result) return null

  return <InterceptedPublisher publisher={result.publisher} items={result.items} />
}
