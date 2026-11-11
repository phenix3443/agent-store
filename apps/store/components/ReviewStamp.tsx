import { useId } from 'react'

interface ReviewStampProps {
  label: string
  /** The word set in the middle of the seal, e.g. 已审. */
  word: string
  className?: string
}

const RING_TEXT = 'REVIEWED · AGENT STORE · REVIEWED · AGENT STORE · '

export function ReviewStamp({ label, word, className = '' }: ReviewStampProps) {
  const ringId = useId()
  return (
    <svg viewBox="0 0 148 148" role="img" aria-label={label} className={`stamp ${className}`}>
      <defs>
        <path id={ringId} d="M74 74m-56 0a56 56 0 1 1 112 0a56 56 0 1 1-112 0" />
      </defs>
      <circle cx="74" cy="74" r="74" fill="var(--stamp-bg)" />
      <circle cx="74" cy="74" r="42" fill="none" stroke="var(--stamp-ink)" strokeWidth=".8" />
      <g className="stamp-ring">
        <text fontFamily="var(--font-mono), monospace" fontSize="10" fill="var(--stamp-ink)">
          <textPath href={`#${ringId}`} textLength="346" lengthAdjust="spacing">
            {RING_TEXT}
          </textPath>
        </text>
      </g>
      <text
        x="74"
        y="83"
        textAnchor="middle"
        fontSize={word.length > 3 ? 15 : 25}
        fontWeight="500"
        fill="var(--stamp-ink)"
      >
        {word}
      </text>
    </svg>
  )
}

/** The small seal used in list rows. */
export function ReviewChop({ char }: { char: string }) {
  return (
    <span
      aria-hidden
      className="chop grid h-6 w-6 shrink-0 -rotate-[10deg] place-items-center rounded-full text-[13px] font-medium leading-none"
    >
      {char}
    </span>
  )
}
