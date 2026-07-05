export function TitleBar() {
  return (
    <div className="relative flex h-[44px] shrink-0 items-center border-b border-store-border bg-store-chrome px-4">
      <div className="flex gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: '#ff5f57' }} />
        <span className="h-3 w-3 rounded-full" style={{ background: '#febc2e' }} />
        <span className="h-3 w-3 rounded-full" style={{ background: '#28c840' }} />
      </div>
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
          <path d="M9 2l5.5 3v8L9 16l-5.5-3V5z" stroke="var(--text-3)" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        <p className="text-xs font-semibold text-store-text-2">Agent Store CLI</p>
      </div>
    </div>
  )
}
