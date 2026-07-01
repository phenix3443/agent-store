export function TitleBar() {
  return (
    <div className="relative flex h-10 shrink-0 items-center border-b border-store-border bg-store-chrome px-4">
      <div className="flex gap-2">
        <span className="h-3 w-3 rounded-full bg-store-red" />
        <span className="h-3 w-3 rounded-full bg-store-amber" />
        <span className="h-3 w-3 rounded-full bg-store-green" />
      </div>
      <p className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold text-store-text-2">
        Agent Store CLI
      </p>
    </div>
  )
}
