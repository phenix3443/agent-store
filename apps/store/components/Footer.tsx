import Link from 'next/link'
import { getLocale } from 'next-intl/server'

const CONTACT_EMAIL = 'agent-store@panghuli.tech'

export async function Footer() {
  const locale = await getLocale()
  const isChinese = locale === 'zh'

  return (
    <footer className="border-t border-store-border bg-store-win">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <div className="text-sm font-bold text-store-text">Agent Store</div>
          <div className="mt-1 text-xs text-store-text-3">© 2026 Agent Store</div>
        </div>
        <nav
          aria-label={isChinese ? '法律与联系信息' : 'Legal and contact information'}
          className="flex flex-wrap gap-x-6 gap-y-3 text-[13px]"
        >
          <Link href="/terms" className="text-store-text-2 hover:text-store-text">
            {isChinese ? '服务条款' : 'Terms of Service'}
          </Link>
          <Link href="/privacy" className="text-store-text-2 hover:text-store-text">
            {isChinese ? '隐私政策' : 'Privacy Policy'}
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-store-text-2 hover:text-store-text">
            {CONTACT_EMAIL}
          </a>
        </nav>
      </div>
    </footer>
  )
}
