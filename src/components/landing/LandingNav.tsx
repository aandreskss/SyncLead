"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Menu, X } from "lucide-react"
import { Logo } from "./Logo"

const LINKS = [
  { label: "Producto", href: "/#producto" },
  { label: "Cómo funciona", href: "/#como-funciona" },
  { label: "Funciones", href: "/#funciones" },
  { label: "Seguridad", href: "/#seguridad" },
  { label: "Precios", href: "/#precios" },
]

export function LandingNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <header
      className={`sg-app sticky top-0 z-40 w-full border-b text-sg-ink transition-colors duration-[var(--sg-dur-standard)] ${
        scrolled || open ? "sg-glass border-sg-border" : "border-transparent bg-sg-bg"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-sg-muted transition-colors hover:text-sg-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-sg-muted transition-colors hover:text-sg-ink sm:inline-flex"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="sg-press inline-flex min-h-10 items-center rounded-lg bg-sg-accent px-4 text-sm font-semibold text-sg-on-accent transition-shadow hover:shadow-sg-glow"
          >
            Comenzar ahora
          </Link>
          <button
            ref={btnRef}
            type="button"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-sg-ink hover:bg-sg-s3 md:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" aria-label="Menú móvil" className="sg-rise border-t border-sg-border px-4 pb-5 pt-2 md:hidden">
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-sg-border text-base font-medium text-sg-ink"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center text-base font-medium text-sg-muted"
              >
                Iniciar sesión
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}
