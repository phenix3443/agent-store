'use client'

import Link from 'next/link'
import * as Accordion from '@radix-ui/react-accordion'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

export const FAQ_KEYS = ['agents', 'noApp', 'os', 'price', 'update', 'unsigned'] as const

export function Faq() {
  const t = useTranslations('site.client.faq')

  return (
    <Accordion.Root type="multiple" defaultValue={[FAQ_KEYS[0]]} className="border-b border-line">
      {FAQ_KEYS.map((key) => (
        <Accordion.Item key={key} value={key} className="border-t border-line">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-5 px-0.5 py-5 text-left text-[17px] font-semibold focus-visible:outline-offset-[-2px]">
              {t(`${key}.q`)}
              <Plus
                size={20}
                aria-hidden
                className="shrink-0 text-fg-3 transition-transform duration-200 group-data-[state=open]:rotate-45 group-data-[state=open]:text-fg"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="px-0.5 pb-[22px]">
            <p className="max-w-[68ch] text-fg-2">
              {t.rich(`${key}.a`, {
                link: (chunks) => (
                  <Link href="/download#first-run" className="link text-fg">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
