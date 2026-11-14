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
    <div className="max-w-[70ch] text-[15px] leading-[1.65] text-fg-2 [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={REHYPE_PLUGINS}
        components={{
          h1: (p) => <h3 className="mb-2 mt-[22px] text-lg font-bold leading-7 text-fg first:mt-0" {...p} />,
          h2: (p) => <h4 className="mb-1.5 mt-[18px] text-[15.5px] font-bold leading-6 text-fg" {...p} />,
          h3: (p) => <h5 className="mb-1 mt-4 text-sm font-bold text-fg" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5" {...p} />,
          li: (p) => <li className="my-1" {...p} />,
          a: (p) => <a className="link" {...p} />,
          strong: (p) => <strong className="font-semibold text-fg" {...p} />,
          img: ({ node: _node, alt, ...p }) =>
            isAbsolute(p.src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img {...p} alt={alt ?? ''} loading="lazy" className="inline-block h-auto max-w-full align-middle" />
            ) : null,
          code: (p) => <code className="rounded-[5px] bg-panel-3 px-[5px] py-px font-mono text-[13px]" {...p} />,
          pre: (p) => (
            <pre className="my-2.5 overflow-x-auto rounded-control border border-line bg-code px-3.5 py-3 text-[13px] text-fg [&_code]:bg-transparent [&_code]:p-0" {...p} />
          ),
          blockquote: (p) => <blockquote className="my-3 border-l-2 border-line-strong pl-4" {...p} />,
          table: (p) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-line-strong px-2 py-1.5 text-left font-semibold text-fg" {...p} />,
          td: (p) => <td className="border-b border-line px-2 py-1.5 align-top" {...p} />,
          hr: () => <hr className="my-5 border-line" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
