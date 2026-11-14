import { CopyButton } from '@/components/marketing/CopyButton'

// Trailing "# …" comments are drawn dimmer; a "#" line on its own is a heading comment.
function Line({ text }: { text: string }) {
  const m = /^(.*?\S)?(\s*#.*)$/.exec(text)
  if (!m) return <>{text}</>
  return (
    <>
      {m[1] ?? ''}
      <span className="text-fg-3">{m[2]}</span>
    </>
  )
}

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const lines = code.split('\n')
  return (
    <div className="code-block relative">
      <pre className="!pr-[84px]">
        <code>
          {lines.map((l, i) => (
            <span key={i}>
              <Line text={l} />
              {i < lines.length - 1 && '\n'}
            </span>
          ))}
        </code>
      </pre>
      <CopyButton text={code} label={label} className="!absolute right-2 top-2 !min-h-[30px] !px-2.5 !text-[12.5px]" />
    </div>
  )
}
