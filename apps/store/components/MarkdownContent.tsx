import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Renders trusted markdown (e.g. a package's SKILL.md) with the store's styling.
// react-markdown escapes raw HTML by default, so this is XSS-safe.
export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="text-[13.5px] leading-relaxed text-store-text-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="mb-2 mt-6 text-lg font-semibold text-store-text" {...p} />,
          h2: (p) => <h3 className="mb-2 mt-5 text-base font-semibold text-store-text" {...p} />,
          h3: (p) => <h4 className="mb-1.5 mt-4 text-sm font-semibold text-store-text-2" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5" {...p} />,
          li: (p) => <li className="my-1" {...p} />,
          a: (p) => <a className="text-store-accent underline-offset-2 hover:underline" {...p} />,
          strong: (p) => <strong className="font-semibold text-store-text" {...p} />,
          code: (p) => <code className="rounded bg-store-panel-2 px-1 py-0.5 font-mono text-[12px] text-store-text" {...p} />,
          pre: (p) => (
            <pre className="my-3 overflow-x-auto rounded-lg border border-store-border bg-store-content p-3 text-[12px]" {...p} />
          ),
          blockquote: (p) => <blockquote className="my-2 border-l-2 border-store-border-strong pl-3 text-store-text-3" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
