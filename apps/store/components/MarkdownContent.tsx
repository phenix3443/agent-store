import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

// READMEs come from third parties and often wrap their header in HTML
// (`<div align="center"><img …>`). rehype-raw parses that HTML and
// rehype-sanitize, which must run after it, cuts it down to GitHub's own
// allow-list, so scripts, event handlers and javascript: URLs never render.
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize]

// Relative image paths point into the package's repository, which this page
// cannot resolve; a broken image is worse than none.
const isAbsolute = (src: unknown) => typeof src === 'string' && /^https?:\/\//i.test(src)

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="max-w-[70ch] text-sm leading-[22px] text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={REHYPE_PLUGINS}
        components={{
          h1: (p) => <h3 className="mb-1.5 mt-6 text-base font-semibold leading-6 first:mt-0" {...p} />,
          h2: (p) => <h4 className="mb-1.5 mt-6 text-base font-medium leading-6" {...p} />,
          h3: (p) => <h5 className="mb-1 mt-5 text-sm font-semibold" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5" {...p} />,
          li: (p) => <li className="my-1" {...p} />,
          a: (p) => <a className="underline decoration-line-strong hover:decoration-ink" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          img: ({ node: _node, alt, ...p }) =>
            isAbsolute(p.src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img {...p} alt={alt ?? ''} loading="lazy" className="inline-block h-auto max-w-full align-middle" />
            ) : null,
          code: (p) => <code className="bg-fill px-1 py-0.5 font-mono text-[13px]" {...p} />,
          pre: (p) => (
            <pre className="my-3 overflow-x-auto border border-line bg-paper p-3 text-[13px] [&_code]:bg-transparent [&_code]:p-0" {...p} />
          ),
          blockquote: (p) => <blockquote className="my-3 border-l border-line pl-4 text-ink-2" {...p} />,
          table: (p) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-ink px-2 py-1.5 text-left font-medium" {...p} />,
          td: (p) => <td className="border-b border-line px-2 py-1.5 align-top" {...p} />,
          hr: () => <hr className="my-5 border-line" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
