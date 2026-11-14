import { Toaster as SonnerToaster, toast } from 'sonner'

export { toast }

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      offset={38}
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'as-pop flex w-full max-w-[min(480px,calc(100vw-32px))] items-center gap-2.5 rounded-box border border-line-strong bg-popover px-3.5 py-2.5 text-[13px] text-fg shadow-[0_20px_60px_rgba(0,0,0,0.6)]',
          icon: 'text-provider [&_svg]:h-[15px] [&_svg]:w-[15px]',
          error: '[&_[data-icon]]:text-bad',
          actionButton: 'ml-auto font-semibold text-fg underline underline-offset-[3px]',
          description: 'text-fg-2',
        },
      }}
    />
  )
}
