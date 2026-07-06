'use client'

interface DocSection {
  num: string
  title: string
  body: string
  code?: string
}

const DOCS: DocSection[] = [
  {
    num: '01',
    title: '什么是 Agent Store',
    body: 'Agent Store 是面向 Claude Code / Codex 等 AI 编码工具的注册中心与本地客户端。你可以在这里发现并一键安装三类资源：技能(Skill)、MCP 服务器、以及模型供应商(Provider)。安装的资源会同步到本机的 CLI 客户端统一管理。',
  },
  {
    num: '02',
    title: '安装 CLI',
    body: '通过 npm 安装命令行客户端，随后 login 即可跨设备同步已安装的资源。',
    code: '$ npm i -g agent-store\n$ agent-store login',
  },
  {
    num: '03',
    title: '添加资源',
    body: '在商店里点「安装」，或用命令直接添加。技能会复制到 skills 目录，MCP 会写入客户端的 MCP 配置，Provider 则登记为一份可编辑的接入配置。',
    code: '$ agent-store add <id>\n$ agent-store list',
  },
  {
    num: '04',
    title: 'local 本地代理',
    body: 'local 是内置的 Provider：把 Claude Code / Codex 的 API 地址指向 local 的监听端口(默认 http://127.0.0.1:18100)，请求会按各上游 Provider 的 Level 顺序转发，失败自动降级，并支持模型映射与用量计量。',
  },
  {
    num: '05',
    title: '优先级(Level)与降级',
    body: '每个 Provider 配置有一个 Level(1–10，数字越小越优先)。同一次请求先尝试 Level 最小的候选，遇网络错误或 5xx 自动切到下一个，从而在多家上游之间实现无感容灾。',
  },
  {
    num: '06',
    title: '发布你的资源',
    body: '登录后点顶部「发布」，选择类型(技能 / MCP / 供应商)并填写元信息即可提交审核。审核期间资源以「审核中」状态显示在你的主页，通过后对所有用户可见。',
  },
]

export default function DocsPage() {
  function scrollTo(num: string) {
    const container = document.getElementById('docs-scroll')
    const el = document.getElementById(`docsec-${num}`)
    if (container && el) {
      container.scrollTop += el.getBoundingClientRect().top - container.getBoundingClientRect().top - 16
    }
  }

  return (
    <div className="flex h-[calc(100vh-61px)] min-h-0 bg-store-content">
      {/* left nav */}
      <div className="w-[236px] flex-shrink-0 overflow-y-auto border-r border-store-border px-3.5 py-7">
        <div className="px-2.5 pb-3 text-[11px] font-bold uppercase tracking-wide text-store-text-3">指南</div>
        <div className="flex flex-col gap-0.5">
          {DOCS.map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => scrollTo(s.num)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-store-panel-2"
            >
              <span className="shrink-0 font-mono text-[11px] font-bold text-store-accent">{s.num}</span>
              <span className="truncate text-[13px] text-store-text-2">{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div id="docs-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-10 pb-16 pt-10">
          <div className="text-3xl font-extrabold tracking-tight text-store-text">开始使用 Agent Store</div>
          <div className="mt-2.5 text-sm leading-relaxed text-store-text-2">
            发现、安装并管理面向 Claude Code / Codex 的技能、MCP 与模型供应商。
          </div>
          {DOCS.map((s) => (
            <div key={s.num} id={`docsec-${s.num}`} className="mt-[34px] border-t border-store-border pt-7">
              <div className="mb-3 flex items-center gap-[11px]">
                <span className="font-mono text-xs font-extrabold text-store-accent">{s.num}</span>
                <span className="text-[19px] font-bold tracking-tight text-store-text">{s.title}</span>
              </div>
              <div className="text-sm leading-[1.75] text-store-text-2">{s.body}</div>
              {s.code && (
                <div className="mt-3.5 whitespace-pre-wrap rounded-[11px] border border-store-border bg-store-term-bg px-4 py-3.5 font-mono text-[12.5px] leading-[1.8] text-[#c7c7d0]">
                  {s.code}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
