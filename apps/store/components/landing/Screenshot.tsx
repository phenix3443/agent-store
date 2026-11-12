import Image from 'next/image'
import { PlateMarks } from '../PlateMarks'

export interface Shot {
  src: string
  width: number
  height: number
}

/**
 * A crop of the dark desktop client set on the light page: a plate-coloured mat and a
 * 1px ink frame keep its edge from bleeding into the paper. No shadow, no radius.
 */
export function Screenshot({
  shot,
  alt,
  marks = false,
  priority = false,
  sizes,
}: {
  shot: Shot
  alt: string
  marks?: boolean
  priority?: boolean
  sizes: string
}) {
  return (
    <figure className={`${marks ? 'plate' : ''} border border-ink bg-plate p-2 sm:p-3`}>
      {marks && <PlateMarks />}
      <Image
        src={shot.src}
        width={shot.width}
        height={shot.height}
        alt={alt}
        sizes={sizes}
        priority={priority}
        // Already cropped and compressed WebP; the optimizer would only re-encode it.
        unoptimized
        className="block h-auto w-full"
      />
    </figure>
  )
}
