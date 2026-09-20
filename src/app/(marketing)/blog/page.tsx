import type { Metadata } from "next"
import Link from "next/link"
import { getAllPosts } from "@/lib/blog"

export const metadata: Metadata = {
  title: "Blog — SyncLead",
  description:
    "Artículos sobre gestión de leads de Meta Ads, ventas, Meta Conversions API y estrategias para cerrar más clientes.",
  openGraph: {
    title: "Blog — SyncLead",
    description: "Recursos y guías para anunciantes de Meta Ads que quieren cerrar más ventas.",
    type: "website",
  },
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("es", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateStr))
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-zinc-100 py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 tracking-tight mb-4">Blog</h1>
          <p className="text-zinc-500 text-lg">
            Guías y recursos para anunciantes de Meta Ads que quieren gestionar leads y cerrar más ventas.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="py-14 px-4">
        <div className="mx-auto max-w-3xl">
          {posts.length === 0 ? (
            <p className="text-zinc-500 text-center py-12">Próximamente — el blog está en construcción.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {posts.map((post) => (
                <article key={post.slug} className="py-8 group">
                  <Link href={`/blog/${post.slug}`} className="block">
                    <time className="text-xs text-zinc-400 font-medium">{formatDate(post.date)}</time>
                    <h2 className="mt-2 text-xl font-bold text-zinc-900 group-hover:text-indigo-600 transition-colors leading-snug">
                      {post.title}
                    </h2>
                    <p className="mt-2 text-zinc-500 leading-relaxed">{post.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600">
                      Leer artículo
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
