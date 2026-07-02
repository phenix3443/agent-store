import { NextRequest, NextResponse } from 'next/server'
import { getPublisherBySlug, getPublisherItems } from '@/lib/queries/publishers'

interface Params {
  params: { slug: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const [publisherResult, itemsResult] = await Promise.all([
    getPublisherBySlug(params.slug),
    getPublisherItems(params.slug),
  ])

  if (publisherResult.error) {
    return NextResponse.json({ error: 'Failed to fetch publisher' }, { status: 500 })
  }

  if (!publisherResult.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    publisher: publisherResult.data,
    items: itemsResult.data,
  })
}
