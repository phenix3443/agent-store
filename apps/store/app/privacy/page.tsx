import type { Metadata } from 'next'
import { LegalPage, type LegalSection } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: '隐私政策',
  description: 'Agent Store 隐私政策：我们收集哪些信息、如何使用与保护，以及你的权利。',
}

const UPDATED = '2026-11-14'


const SECTIONS: LegalSection[] = [
  {
    title: '引言',
    body: '本隐私政策说明 Agent Store（“我们”）在你访问 agent-store.panghuli.tech 网站及使用桌面客户端时，如何收集、使用与保护你的信息。使用本服务即表示你同意本政策所述的处理方式。',
  },
  {
    title: '我们收集的信息',
    bullets: [
      '账号信息：当你通过 GitHub 或 Google 登录时，我们从对应身份提供方获取你的邮箱、用户名与头像，用于创建和标识你的账号。',
      '订阅与支付信息：当你订阅 Pro 时，支付由第三方商户 Waffo（Merchant of Record）处理；我们不接触也不存储你的银行卡等完整支付凭证，仅保存订阅状态与关联邮箱。',
      '收藏：登录后在商店里收藏的条目（目录中的条目编号）和收藏时间，保存在你的账号下，只有你本人可见；删除账号时一并删除。',
      '使用数据：为提供和改进服务，我们可能记录基础的访问与操作日志（如页面访问、安装的资源），不含敏感内容。',
      '本地数据：桌面客户端在你本机保存已安装的资源与供应商配置（含你自行填写的 API Key）；这些数据仅存于本地，不会上传。',
      '本机安装状态：桌面客户端运行时，在本机地址 127.0.0.1 上回答本网站页面「这些条目是否已安装」，只回答本站页面，不回答其他网站。网页在你的浏览器里直接询问本机，结果只用来在页面上显示「已安装」，不发送到我们的服务器。',
    ],
  },
  {
    title: '信息如何使用',
    bullets: [
      '提供并维护服务，包括登录认证、资源安装与订阅管理。',
      '保障安全、排查故障与防止滥用。',
      '在法律要求时履行合规义务。',
    ],
  },
  {
    title: '第三方服务',
    body: '我们依赖以下服务商处理部分数据，各自遵循其隐私政策：',
    bullets: [
      'GitHub、Google —— 第三方登录（OAuth），仅在你选择用其登录时获取上述基本资料。',
      'Waffo —— 订阅支付处理（Merchant of Record）。',
      'ClawHub、腾讯 SkillHub、SkillsMP —— 商店搜索的补充查询。本站结果不足、且你点击「发送并查找」后，我们的服务器把搜索词发给这些技能目录，实际查询的站点以搜索页的提示为准。只发送搜索词，不发送你的账号、Cookie 或 IP 地址；我们只保存搜索词的 SHA-256 摘要用于缓存，不保存原文。',
    ],
  },
  {
    title: '数据存储与安全',
    body: '我们采取合理的技术与管理措施保护你的信息，数据存储于受访问控制保护的托管服务中。请注意，任何通过互联网的传输或存储都无法保证绝对安全。',
  },
  {
    title: '你的权利',
    body: '你可以随时访问、更正或删除你的账号信息。如需删除账号及关联数据，或对本政策有疑问，请通过下方邮箱联系我们。',
  },
  {
    title: 'Cookie',
    body: '我们使用必要的 Cookie 维持登录会话与保障基本功能，不用于跨站广告追踪。',
  },
  {
    title: '政策变更',
    body: '我们可能不时更新本政策，更新后会修改本页顶部的“最后更新”日期。重大变更将通过合理方式通知。',
  },
  {
    title: '联系我们',
    body: '如对本隐私政策有任何疑问，请联系：support@panghuli.tech',
  },
]

export default function PrivacyPage() {
  return <LegalPage title="隐私政策" updated={UPDATED} sections={SECTIONS} other="terms" />
}
