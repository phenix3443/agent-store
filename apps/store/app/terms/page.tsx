import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { LegalDocument, type LegalDocumentContent } from '@/components/LegalDocument'

const CONTACT_EMAIL = 'agent-store@panghuli.tech'

const ZH: LegalDocumentContent = {
  title: '服务条款',
  updatedLabel: '最后更新',
  updated: '2026 年 7 月 22 日',
  sections: [
    {
      title: '接受条款',
      body: '访问 agent-store.panghuli.tech、使用 Agent Store 桌面客户端或命令行工具，即表示你同意本条款。若你不同意，请勿使用本服务。',
    },
    {
      title: '运营方与联系',
      body: '本服务以 Agent Store 品牌运营。客户支持、法律通知、取消与退款请求统一通过本页所列联系邮箱提交。正式付费销售启用前，运营者须在 Waffo 商户资料和适用交易文件中提供一致的法定身份、地址与适用法律信息。',
    },
    {
      title: '服务说明',
      body: 'Agent Store 是面向 Claude Code、Codex 等 AI 编码工具的软件与在线目录，用于发现、安装和管理 Skill、MCP 服务器及模型 Provider，并提供桌面客户端、命令行工具和本地代理。用户自行选择并支付上游模型服务，Agent Store 不提供或转售模型算力。',
    },
    {
      title: '账号与安全',
      bullets: [
        '你可以通过 GitHub 或 Google 登录，并对账号下的活动负责。',
        '你应保护登录凭证及自行填写的 API Key，不得冒用他人身份或未经授权使用他人账号。',
        '当前没有自助删除账号入口；账号与关联数据删除请求通过联系邮箱人工核验和处理。',
      ],
    },
    {
      title: '方案、价格与税费',
      bullets: [
        'Free：USD 0，无到期时间。',
        'Pro Monthly：USD 9.99/月，自动续费；登录用户可获得可选的 14 天试用。',
        'Pro Yearly：USD 99.00/年，自动续费；登录用户可获得可选的 14 天试用。',
        'Pro Lifetime：USD 199.00，一次性购买当前说明的本地 Pro 功能，不自动续费。',
        '结账价格以 USD 显示并包含适用税费；结账页展示的最终金额和交易条款优先。',
      ],
    },
    {
      title: '付款、交付与试用',
      bullets: [
        '付费权益通过电子方式交付，不涉及实体商品。经验证的付款事件处理后，系统为对应账号启用权益。',
        'Waffo 是计划采用的支付服务商和 Merchant of Record。商户审核已通过，生产模式权限已开放；店铺当前仍启用测试模式，不会产生真实交易。在生产产品、结账、webhook 和密钥配置完成并切换为生产模式前，生产收费不启用。',
        '如试用在结束前未取消，月付或年付方案将按结账时选择的周期自动开始收费。试用资格可能受账号和历史试用情况限制。',
      ],
    },
    {
      title: '续费、取消与退款',
      bullets: [
        '月付和年付方案会自动续费。请在下一计费日之前通过结账或付款邮件提供的方式取消；若该入口不可用，请通过联系邮箱提交人工取消请求。',
        '取消后，已付订阅通常保留至当前计费周期结束；终身方案不续费。',
        '退款请求通过联系邮箱提交并进行身份和订单核验。是否可退款以适用法律、结账时披露的政策及 Waffo 实际处理规则为准；本条款不承诺固定退款窗口。',
      ],
    },
    {
      title: '可接受使用',
      bullets: [
        '不得发布或传播恶意代码、违法内容或侵犯知识产权的资源。',
        '不得未经授权访问、干扰或破坏本服务及其基础设施。',
        '不得利用本地代理或 Provider 配置违反上游服务条款或适用法律。',
      ],
    },
    {
      title: '第三方资源与服务',
      body: '目录中的部分 Skill、MCP 和 Provider 由第三方发布，相关许可和条款由各发布者提供。你应在安装前自行审查。上游模型、身份认证和支付服务也受其各自条款约束。',
    },
    {
      title: '暂停与终止',
      body: '如账号违反本条款、产生安全风险或法律要求我们采取行动，我们可以限制或终止访问。服务停止或账号终止时，付费权益的处理仍受适用法律、结账披露及退款规则约束。',
    },
    {
      title: '免责声明与责任限制',
      body: '在适用法律允许的范围内，本服务按“现状”和“现有”提供，不保证持续、无错误或适合特定目的；我们不对第三方资源或上游服务负责。任何责任限制均不排除适用法律不允许排除的责任。',
    },
    {
      title: '条款变更',
      body: '我们可能更新本条款，并修改本页的最后更新日期。重大变更将通过网站、产品内通知或其他合理方式告知；法律要求另行同意时，我们会请求同意。',
    },
    { title: '联系我们', contact: true },
  ],
}

const EN: LegalDocumentContent = {
  title: 'Terms of Service',
  updatedLabel: 'Last updated',
  updated: 'July 22, 2026',
  sections: [
    {
      title: 'Acceptance',
      body: 'By accessing agent-store.panghuli.tech or using the Agent Store desktop or command-line software, you agree to these Terms. Do not use the service if you do not agree.',
    },
    {
      title: 'Operator and contact',
      body: 'The service operates publicly under the Agent Store brand. Customer support, legal notices, cancellation requests, and refund requests use the contact email on this page. Before paid production sales begin, the operator must provide consistent legal identity, address, and governing-law information in the Waffo merchant profile and applicable transaction documents.',
    },
    {
      title: 'Service',
      body: 'Agent Store is software and an online catalog for users of AI coding tools such as Claude Code and Codex. It helps users discover, install, and manage skills, MCP servers, and model providers through desktop and command-line clients and a local relay. Users select and pay their upstream model providers; Agent Store does not provide or resell model compute.',
    },
    {
      title: 'Accounts and security',
      bullets: [
        'You may sign in with GitHub or Google and are responsible for activity under your account.',
        'Protect your credentials and API keys, and do not impersonate others or use another account without authorization.',
        'Self-service account deletion is not currently available. Account and associated-data deletion requests are manually verified and processed through the contact email.',
      ],
    },
    {
      title: 'Plans, prices, and taxes',
      bullets: [
        'Free: USD 0 with no expiration.',
        'Pro Monthly: USD 9.99 per month, automatically renewing, with an optional 14-day trial for signed-in users.',
        'Pro Yearly: USD 99.00 per year, automatically renewing, with an optional 14-day trial for signed-in users.',
        'Pro Lifetime: USD 199.00 as a one-time purchase for the currently described local Pro features; it does not renew.',
        'Checkout prices are displayed in USD and include applicable taxes. The final amount and transaction terms shown at checkout control.',
      ],
    },
    {
      title: 'Payment, delivery, and trials',
      bullets: [
        'Paid access is delivered electronically; there are no physical goods. Entitlement is activated for the associated account after a verified payment event is processed.',
        'Waffo is the intended payment provider and Merchant of Record. The Waffo merchant review is complete and production-mode access is available, but the store remains in test mode and cannot create real transactions. Production charging remains disabled until production products, checkout, webhooks, and credentials are configured and the store is explicitly switched to production mode.',
        'Unless canceled before it ends, a trial converts to the monthly or yearly billing interval selected at checkout. Trial eligibility may be limited by account and prior trial history.',
      ],
    },
    {
      title: 'Renewal, cancellation, and refunds',
      bullets: [
        'Monthly and yearly plans automatically renew. Cancel before the next billing date using a method provided by checkout or the payment receipt; if unavailable, send a manual cancellation request to the contact email.',
        'After cancellation, paid subscription access generally continues through the current billing period. Lifetime purchases do not renew.',
        'Submit refund requests through the contact email for identity and order verification. Eligibility depends on applicable law, the policy disclosed at checkout, and Waffo processing rules; these Terms do not promise a fixed refund window.',
      ],
    },
    {
      title: 'Acceptable use',
      bullets: [
        'Do not publish or distribute malicious, unlawful, or intellectual-property-infringing resources.',
        'Do not access, interfere with, or damage the service or its infrastructure without authorization.',
        'Do not use the local relay or provider configuration to violate upstream terms or applicable law.',
      ],
    },
    {
      title: 'Third-party resources and services',
      body: 'Some catalog resources are published by third parties under their own licenses and terms. Review them before installation. Upstream model, authentication, and payment services are also governed by their own terms.',
    },
    {
      title: 'Suspension and termination',
      body: 'We may restrict or terminate access for a Terms violation, a security risk, or a legal requirement. Treatment of paid access after service or account termination remains subject to applicable law, checkout disclosures, and refund rules.',
    },
    {
      title: 'Disclaimers and limitation of liability',
      body: 'To the extent permitted by applicable law, the service is provided “as is” and “as available,” without a promise that it will be uninterrupted, error-free, or suitable for a particular purpose. We are not responsible for third-party resources or upstream services. Nothing excludes liability that cannot legally be excluded.',
    },
    {
      title: 'Changes',
      body: 'We may update these Terms and the last-updated date. Material changes will be communicated through the site, the product, or another reasonable channel. We will request consent when applicable law requires it.',
    },
    { title: 'Contact', contact: true },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const document = (await getLocale()) === 'zh' ? ZH : EN
  return {
    title: document.title,
    description: document === ZH
      ? 'Agent Store 服务条款：产品、账号、定价、试用、续费、取消和退款。'
      : 'Agent Store Terms of Service covering products, accounts, pricing, trials, renewals, cancellation, and refunds.',
  }
}

export default function TermsPage() {
  return <LegalDocument chinese={ZH} english={EN} contactEmail={CONTACT_EMAIL} />
}
