'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

export const FAQ_KEYS = ['config', 'keys', 'relay', 'uninstall', 'unsigned'] as const

export function Faq() {
  const t = useTranslations('site.home.faq')

  return (
    <Accordion.Root type="multiple" className="border-t border-ink">
      {FAQ_KEYS.map((key) => (
        <Accordion.Item key={key} value={key} className="border-b border-line">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 py-5 text-left text-[17px] leading-[26px] focus-visible:outline-offset-[-2px] sm:text-lg">
              {t(`${key}.q`)}
              <Plus
                size={18}
                aria-hidden
                className="shrink-0 text-ink-2 transition-transform duration-150 group-data-[state=open]:rotate-45"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="pb-6">
            <p className="max-w-[68ch] text-[15px] leading-[26px] text-ink-2">{t(`${key}.a`)}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
