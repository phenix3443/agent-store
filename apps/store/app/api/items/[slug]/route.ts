import { NextRequest, NextResponse } from 'next/server'
import { getItemBySlug } from '@/lib/queries/items'

interface Params {
  params: { slug: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { data, error } = await getItemBySlug(params.slug)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ item: data })
}
