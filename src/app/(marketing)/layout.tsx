import Link from "next/link"

function Nav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-base font-bold text-zinc-900 tracking-tight">SyncLead</span>
        </Link>

        {/* Nav links — hidden on small screens */}
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/features" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors font-medium">
            Funciones
          </Link>
          <Link href="/pricing" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors font-medium">
            Precios
          </Link>
          <Link href="/blog" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors font-medium">
            Blog
          </Link>
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:inline-flex text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-base font-bold text-zinc-900">SyncLead</span>
            </Link>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
              CRM diseñado para anunciantes de Meta Ads. Captura leads, gestiona ventas y notifica conversiones a Facebook — automáticamente.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Producto</p>
            <ul className="space-y-3">
              {[
                { label: "Funciones", href: "/features" },
                { label: "Precios", href: "/pricing" },
                { label: "Blog", href: "/blog" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Cuenta</p>
            <ul className="space-y-3">
              {[
                { label: "Registrarse", href: "/register" },
                { label: "Iniciar sesión", href: "/login" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">© {year} SyncLead. Todos los derechos reservados.</p>
          <p className="text-xs text-zinc-400">Hecho con ♥ para anunciantes de Meta Ads</p>
        </div>
      </div>
    </footer>
  )
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
