import { createClient } from '@/lib/supabase/server'

interface DashboardItemRow {
  id: string
  slug: string
  name: string
  category: string
  status: string
  version: string
  created_at: string
  publishers: Array<{ name: string }> | null
}

interface DashboardItem {
  id: string
  slug: string
  name: string
  category: string
  status: string
  version: string
  created_at: string
  publisher: { name: string } | null
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const githubUsername = user?.user_metadata['user_name'] as string | undefined
  if (!githubUsername) {
    return (
      <main className="py-8">
        <h1 className="text-2xl font-semibold text-ray-fg mb-4">Dashboard</h1>
        <div className="flex h-32 items-center justify-center rounded-xl border border-ray-border bg-ray-surface-1">
          <p className="text-ray-fg-muted">
            GitHub username not found in your profile. Please sign out and sign in again.
          </p>
        </div>
      </main>
    )
  }

  // Fetch items submitted by this user (status any, including pending/rejected)
  const { data: myItems } = await supabase
    .from('items')
    .select('id, slug, name, category, status, version, created_at, publishers!inner(name)')
    .eq('publishers.slug', githubUsername)
    .order('created_at', { ascending: false })

  const items: DashboardItem[] = ((myItems ?? []) as DashboardItemRow[]).map(item => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    category: item.category,
    status: item.status,
    version: item.version,
    created_at: item.created_at,
    publisher: item.publishers?.[0] ?? null,
  }))

  const statusLabel: Record<string, string> = {
    published: '✓ Published',
    pending: '⏳ Under review',
    rejected: '✗ Rejected',
  }

  return (
    <main className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ray-fg">Dashboard</h1>
        <a
          href="/submit"
          className="rounded-lg bg-ray-accent px-4 py-2 text-sm font-medium text-ray-surface-0 hover:opacity-90"
        >
          Submit item
        </a>
      </div>

      <h2 className="mb-3 text-sm font-medium text-ray-fg-secondary uppercase tracking-wider">
        Your submissions
      </h2>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-ray-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ray-border bg-ray-surface-1">
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Name</th>
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Category</th>
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Version</th>
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-ray-border last:border-0 bg-ray-surface-2">
                  <td className="px-4 py-3 text-ray-fg">{item.name}</td>
                  <td className="px-4 py-3 text-ray-fg-secondary">{item.category}</td>
                  <td className="px-4 py-3 text-ray-fg-secondary">{item.version}</td>
                  <td className="px-4 py-3 text-ray-fg-secondary">
                    {statusLabel[item.status] ?? item.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-xl border border-ray-border bg-ray-surface-1">
          <p className="text-ray-fg-muted">No submissions yet.</p>
        </div>
      )}
    </main>
  )
}
