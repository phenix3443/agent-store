import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Renders trusted markdown (e.g. a package's SKILL.md) with the store's styling.
// react-markdown escapes raw HTML by default, so this is XSS-safe.
export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="max-w-[70ch] text-sm leading-[22px] text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mb-1.5 mt-6 text-[17px] font-medium leading-6 first:mt-0" {...p} />,
          h2: (p) => <h4 className="mb-1.5 mt-6 text-base font-medium leading-6" {...p} />,
          h3: (p) => <h5 className="mb-1 mt-5 text-sm font-semibold" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5" {...p} />,
          li: (p) => <li className="my-1" {...p} />,
          a: (p) => <a className="underline decoration-line-strong hover:decoration-ink" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          code: (p) => <code className="bg-fill px-1 py-0.5 font-mono text-[13px]" {...p} />,
          pre: (p) => (
            <pre className="my-3 overflow-x-auto border border-line bg-paper p-3 text-[13px] [&_code]:bg-transparent [&_code]:p-0" {...p} />
          ),
          blockquote: (p) => <blockquote className="my-3 pl-4 text-ink-2" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
