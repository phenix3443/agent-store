import type { Metadata } from 'next'
import { LegalPage, type LegalSection } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: '服务条款',
  description: 'Agent Store 服务条款：使用本服务的规则、账号、订阅与免责声明。',
}

const UPDATED = '2026-07-13'


const SECTIONS: LegalSection[] = [
  {
    title: '接受条款',
    body: '欢迎使用 Agent Store。访问 agent-store.panghuli.tech 网站或使用桌面客户端，即表示你同意受本服务条款约束。若你不同意，请勿使用本服务。',
  },
  {
    title: '服务说明',
    body: 'Agent Store 是面向 Claude Code / Codex 等 AI 编码工具的资源商店与本地管理客户端，用于发现、安装与管理技能（Skill）、MCP 服务器与模型供应商（Provider），并提供内置的本地代理。',
  },
  {
    title: '账号',
    bullets: [
      '你可通过 GitHub 或 Google 登录创建账号，并对账号下的活动负责。',
      '请妥善保管你的登录凭证与自行填写的 API Key；因你自身泄露导致的损失由你承担。',
      '你承诺提供真实信息，且不冒用他人身份。',
    ],
  },
  {
    title: '订阅与付款',
    bullets: [
      'Pro 订阅由第三方商户 Waffo（Merchant of Record）代为收款与开票，付款即视为同意其相应条款。',
      '除法律强制规定或另有说明外，已支付的订阅费用不予退还。',
      '订阅在到期前自动续费，你可随时在到期前取消，取消后可继续使用至当前计费周期结束。',
    ],
  },
  {
    title: '可接受使用',
    body: '你同意不将本服务用于任何违法或侵害他人权益的目的，包括但不限于：',
    bullets: [
      '发布、传播含恶意代码或侵犯知识产权的资源。',
      '试图未经授权访问、干扰或破坏本服务或其基础设施。',
      '滥用本地代理或供应商配置从事违反上游服务条款的行为。',
    ],
  },
  {
    title: '第三方资源与内容',
    body: '商店中的部分技能、MCP 与供应商由第三方发布。我们对第三方内容的准确性、合法性与可用性不作担保；你在安装和使用前应自行评估风险。',
  },
  {
    title: '知识产权',
    body: 'Agent Store 的名称、标识、界面与原创内容归我们所有。第三方资源的知识产权归其各自作者所有。',
  },
  {
    title: '免责声明',
    body: '本服务按“现状”与“现有”提供，不附带任何明示或默示的担保。我们不保证服务不中断、无错误或完全安全。',
  },
  {
    title: '责任限制',
    body: '在适用法律允许的最大范围内，我们对因使用或无法使用本服务而产生的任何间接、附带或后果性损失不承担责任。',
  },
  {
    title: '条款变更',
    body: '我们可能不时更新本条款，更新后会修改本页顶部的“最后更新”日期。你在变更生效后继续使用本服务，即视为接受修订后的条款。',
  },
  {
    title: '联系我们',
    body: '如对本条款有任何疑问，请联系：support@panghuli.tech',
  },
]

export default function TermsPage() {
  return <LegalPage title="服务条款" updated={UPDATED} sections={SECTIONS} />
}
