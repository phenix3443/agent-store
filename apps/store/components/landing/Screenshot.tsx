import Image from 'next/image'
import { PlateMarks } from '../PlateMarks'

export interface Shot {
  src: string
  width: number
  height: number
}

/**
 * A crop of the desktop client on a mat with a 1px frame, so its edge stays visible
 * against the page ground.
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
