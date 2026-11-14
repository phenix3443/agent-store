export function SubscriptionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4">
      <section className="card grid gap-3">
        <span className="sk h-5 w-28" />
        <span className="sk h-10 w-48" />
        <span className="sk h-4 w-64 max-w-full" />
        <span className="sk mt-2 h-9 w-32" />
      </section>
      <section className="card grid gap-3">
        <span className="sk h-5 w-24" />
        <span className="sk h-4 w-full" />
        <span className="sk h-4 w-5/6" />
      </section>
    </div>
  )
}
