import { useEffect, useRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

/** A native checkbox (keyboard and screen reader behavior come with it), tinted with the row's category color. */
export function Checkbox({ indeterminate, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return <input ref={ref} type="checkbox" className={cn('h-4 w-4 flex-none cursor-pointer accent-kind disabled:cursor-not-allowed disabled:opacity-45', className)} {...rest} />
}
