import { BigLogo } from './BigLogo'

export function AuthStatus({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="page-hero">
      <div role="status" aria-live="polite" className="gate">
        <BigLogo />
        <h1 className="h2">{title}</h1>
        {children}
      </div>
    </section>
  )
}
