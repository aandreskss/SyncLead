import Link from "next/link"
import { LandingNav } from "@/components/landing/LandingNav"
import { Logo } from "@/components/landing/Logo"

function Footer() {
  const year = new Date().getFullYear()
  const cols = [
    {
      title: "Producto",
      links: [
        { label: "Cómo funciona", href: "/#producto" },
        { label: "Funciones", href: "/features" },
        { label: "Precios", href: "/#precios" },
        { label: "Preguntas frecuentes", href: "/#faq" },
      ],
    },
    {
      title: "Recursos",
      links: [{ label: "Blog", href: "/blog" }],
    },
    {
      title: "Cuenta",
      links: [
        { label: "Crear cuenta", href: "/register" },
        { label: "Iniciar sesión", href: "/login" },
      ],
    },
  ]
  return (
    <footer className="sg-app border-t border-sg-border bg-sg-bg text-sg-ink">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-sg-muted">
              CRM para anunciantes de Meta Ads: captura, seguimiento comercial y conversiones enviadas de vuelta a Meta, en un solo lugar.
            </p>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-sg-subtle">{c.title}</p>
              <ul className="space-y-1">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="inline-flex min-h-8 items-center text-sm text-sg-muted transition-colors hover:text-sg-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-sg-border pt-6 sm:flex-row">
          <p className="text-xs text-sg-subtle">© {year} SyncLead. Todos los derechos reservados.</p>
          <p className="text-xs text-sg-subtle">Diseñado para anunciantes de Meta Ads</p>
        </div>
      </div>
    </footer>
  )
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNav />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
