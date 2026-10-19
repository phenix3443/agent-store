import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { LegalDocument, type LegalDocumentContent } from '@/components/LegalDocument'

const CONTACT_EMAIL = 'agent-store@panghuli.tech'

const ZH: LegalDocumentContent = {
  title: '隐私政策',
  updatedLabel: '最后更新',
  updated: '2026 年 7 月 22 日',
  sections: [
    {
      title: '适用范围',
      body: '本政策说明 Agent Store 在你访问 agent-store.panghuli.tech、登录账号、发布或评价资源、购买付费权益及使用桌面客户端时处理的信息。不同处理活动依据履行服务、安全运营、法律义务或适用法律要求的同意进行。',
    },
    {
      title: '云端账号与内容数据',
      bullets: [
        '账号数据：选择 GitHub 或 Google 登录时，Neon Auth 处理身份标识，并可能提供邮箱、用户名和头像。',
        '目录与发布数据：资源名称、说明、版本、分类、兼容性、标签、发布者资料及发布记录。',
        '评价数据：内部用户 ID、作者名、评分、评价正文及创建和更新时间。',
        '安全与运营数据：Cloudflare 及应用基础设施处理请求元数据、IP 地址、设备或浏览器信息、时间、路径、状态码及诊断日志。',
      ],
    },
    {
      title: '支付与订阅数据',
      bullets: [
        'Waffo 负责结账并处理支付凭证。Agent Store 不存储完整银行卡号。',
        'Agent Store 保存 Waffo 订单 ID、买家邮箱、内部 buyer identity、方案、订阅状态、产品名、store ID、test/prod 模式、事件时间及 webhook delivery ID 和事件类型。',
        '这些数据用于创建和恢复付费权益、处理重复或乱序事件、提供客户支持及满足交易记录义务。',
      ],
    },
    {
      title: '本地客户端数据',
      bullets: [
        '已安装资源、Provider 配置及你填写的 API Key 保存在你的设备。当前代码没有把这些配置上传到 Agent Store 云端进行同步。',
        '本地 SQLite 用量记录包含时间、provider、目标工具、模型、输入与输出 token、缓存 token、估算成本、状态码、延迟、流式和 fallback 标志。',
        '请求明细在写入新记录时清理超过 30 天的数据；按日汇总目前没有固定自动删除期限。导出文件由你在本机创建和管理。',
        '模型请求由你配置的上游 Provider 处理；Agent Store 本地代理不把请求内容上传到 Agent Store 云端。上游 Provider 的处理受其自身政策约束。',
      ],
    },
    {
      title: '网站分析与性能',
      body: '网站加载 Vercel Analytics 与 Speed Insights，用于汇总页面访问、设备和浏览器类别、地区及性能指标。Cloudflare 同时提供网站和 API 托管、安全防护与请求日志。我们不使用这些工具进行跨站广告画像。',
    },
    {
      title: '处理目的',
      bullets: [
        '认证用户、提供目录、发布、评价、下载和本地客户端功能。',
        '创建、核对和恢复订阅或买断权益，并处理支持、取消和退款请求。',
        '衡量网站性能、排查故障、保护服务并防止滥用。',
        '遵守适用法律、会计、税务、争议和执法要求。',
      ],
    },
    {
      title: '服务提供商',
      bullets: [
        'Neon：Neon Auth、Postgres 数据库和相关托管；生产业务数据库位于美国 us-east-1。',
        'Cloudflare：网站与 API 托管、网络、安全防护、日志及 Email Routing。',
        'Vercel：Analytics 与 Speed Insights 网站分析和性能遥测。',
        'GitHub、Google：仅在你选择相应 OAuth 登录时提供身份认证。',
        'Waffo：计划用于结账、支付处理、交易记录、退款和 Merchant of Record 服务。商户审核已通过，生产模式权限已开放；店铺当前仍启用测试模式，真实收费须等待生产产品、webhook、密钥和结账配置完成并显式切换模式。',
      ],
    },
    {
      title: '存储位置与跨境处理',
      body: 'Neon 生产业务数据库位于美国 us-east-1。Cloudflare、Vercel、GitHub、Google 和 Waffo 可能在你所在国家或地区之外处理数据。我们依赖服务商提供的安全措施和适用的数据传输机制；具体法律基础取决于运营主体和用户所在地，须在目标市场上线前确认。',
    },
    {
      title: '保留与删除',
      body: '本地请求明细按上述 30 天规则清理。账号、评价、订阅、webhook 和托管日志目前没有统一固定保留期限；我们仅在提供服务、处理交易与争议、维护安全或履行法律义务所需期间保留。删除请求经人工核验后，会在适用法律和技术能力允许的范围内处理 Neon Auth 与相关业务记录；依法必须保留的交易或安全记录可能继续保存。',
    },
    {
      title: 'Cookie 与本地存储',
      body: '网站使用登录会话所需 Cookie、语言和界面偏好 Cookie，以及浏览器本地存储来维持功能。Vercel 与 Cloudflare 可能处理分析、安全和性能所需的标识或请求信息。我们不使用跨站广告 Cookie。',
    },
    {
      title: '你的选择与权利',
      body: '你可以请求访问、更正、导出或删除与账号关联的数据，也可以就处理提出问题。请从账号关联邮箱联系下方地址；为防止未经授权的披露或删除，我们会进行人工身份核验。具体权利和例外取决于适用法律。',
    },
    {
      title: '儿童',
      body: 'Agent Store 面向软件开发者，不以儿童为目标。若你认为儿童未经适当授权向我们提供了个人信息，请联系我们处理。',
    },
    {
      title: '政策变更',
      body: '我们可能更新本政策并修改最后更新日期。重大变更将通过网站、产品内通知或其他合理方式告知；适用法律要求同意时，我们会请求同意。',
    },
    { title: '联系我们', contact: true },
  ],
}

const EN: LegalDocumentContent = {
  title: 'Privacy Policy',
  updatedLabel: 'Last updated',
  updated: 'July 22, 2026',
  sections: [
    {
      title: 'Scope',
      body: 'This Policy explains how Agent Store handles information when you visit agent-store.panghuli.tech, sign in, publish or review resources, purchase paid access, or use the desktop client. Processing supports service delivery, security and operations, legal obligations, or consent where applicable law requires it.',
    },
    {
      title: 'Cloud account and content data',
      bullets: [
        'Account data: when you choose GitHub or Google sign-in, Neon Auth processes identity identifiers and may receive your email, username, and avatar.',
        'Catalog and publishing data: resource names, descriptions, versions, categories, compatibility, tags, publisher profiles, and publishing records.',
        'Review data: internal user ID, author name, rating, review body, and created and updated timestamps.',
        'Security and operations data: Cloudflare and application infrastructure process request metadata, IP address, device or browser information, time, path, status code, and diagnostic logs.',
      ],
    },
    {
      title: 'Payment and subscription data',
      bullets: [
        'Waffo handles checkout and payment credentials. Agent Store does not store full payment-card numbers.',
        'Agent Store stores the Waffo order ID, buyer email, internal buyer identity, plan, subscription status, product name, store ID, test/prod mode, event timestamp, webhook delivery ID, and event type.',
        'We use these records to create and restore paid access, handle duplicate or out-of-order events, provide support, and meet transaction-record obligations.',
      ],
    },
    {
      title: 'Local client data',
      bullets: [
        'Installed resources, provider configuration, and API keys you enter remain on your device. Current code does not upload this configuration to Agent Store for cloud synchronization.',
        'The local SQLite usage log includes time, provider, target tool, model, input and output token counts, cache token counts, estimated cost, status code, latency, streaming, and fallback flags.',
        'Detailed request records older than 30 days are pruned when new records are written. Daily rollups currently have no fixed automatic deletion period. You create and control exported files locally.',
        'Model requests are handled by the upstream provider you configure. The Agent Store local relay does not upload request content to the Agent Store cloud; upstream provider policies apply.',
      ],
    },
    {
      title: 'Web analytics and performance',
      body: 'The site loads Vercel Analytics and Speed Insights to aggregate page visits, device and browser categories, region, and performance metrics. Cloudflare provides site and API hosting, security, and request logging. We do not use these tools for cross-site advertising profiles.',
    },
    {
      title: 'Purposes',
      bullets: [
        'Authenticate users and provide catalog, publishing, review, download, and local-client features.',
        'Create, verify, and restore subscription or lifetime access and handle support, cancellation, and refund requests.',
        'Measure site performance, troubleshoot, protect the service, and prevent abuse.',
        'Comply with applicable legal, accounting, tax, dispute, and enforcement obligations.',
      ],
    },
    {
      title: 'Service providers',
      bullets: [
        'Neon: Neon Auth, Postgres, and related hosting; the production business database is in the United States, us-east-1.',
        'Cloudflare: site and API hosting, networking, security, logs, and Email Routing.',
        'Vercel: Analytics and Speed Insights web analytics and performance telemetry.',
        'GitHub and Google: identity authentication only when you choose the corresponding OAuth sign-in.',
        'Waffo: intended checkout, payment processing, transaction records, refunds, and Merchant of Record services. The Waffo merchant review is complete and production-mode access is available, but the store remains in test mode. Real charging requires completed production product, webhook, credential, and checkout configuration plus an explicit mode switch.',
      ],
    },
    {
      title: 'Storage and international processing',
      body: 'The production Neon business database is in the United States, us-east-1. Cloudflare, Vercel, GitHub, Google, and Waffo may process data outside your country or region. We rely on provider safeguards and applicable transfer mechanisms. The precise legal basis depends on the operator and user locations and must be confirmed before launch in each target market.',
    },
    {
      title: 'Retention and deletion',
      body: 'Local request details follow the 30-day rule above. Account, review, subscription, webhook, and hosted-log records do not currently share one fixed retention period. We retain them only as needed to provide the service, handle transactions and disputes, maintain security, or meet legal obligations. After a manual identity check, a deletion request is applied to Neon Auth and related business records where applicable law and technical capability allow; transaction or security records may be retained when legally required.',
    },
    {
      title: 'Cookies and local storage',
      body: 'The site uses cookies required for sign-in sessions, language and interface preferences, and browser local storage needed for product functions. Vercel and Cloudflare may process identifiers or request information for analytics, security, and performance. We do not use cross-site advertising cookies.',
    },
    {
      title: 'Your choices and rights',
      body: 'You may request access, correction, export, or deletion of account-associated data or ask questions about processing. Contact the address below from the email associated with your account. We use a manual identity check to prevent unauthorized disclosure or deletion. Available rights and exceptions depend on applicable law.',
    },
    {
      title: 'Children',
      body: 'Agent Store is intended for software developers and is not directed to children. Contact us if you believe a child provided personal information without appropriate authorization.',
    },
    {
      title: 'Changes',
      body: 'We may update this Policy and its last-updated date. Material changes will be communicated through the site, the product, or another reasonable channel. We will request consent when applicable law requires it.',
    },
    { title: 'Contact', contact: true },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const document = (await getLocale()) === 'zh' ? ZH : EN
  return {
    title: document.title,
    description: document === ZH
      ? 'Agent Store 隐私政策：数据类别、用途、服务提供商、保留与用户权利。'
      : 'Agent Store Privacy Policy covering data categories, purposes, service providers, retention, and user rights.',
  }
}

export default function PrivacyPage() {
  return <LegalDocument chinese={ZH} english={EN} contactEmail={CONTACT_EMAIL} />
}
