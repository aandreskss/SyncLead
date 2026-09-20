import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { MDXRemote } from "next-mdx-remote/rsc"
import { getAllPosts, getPostBySlug } from "@/lib/blog"
import { JsonLd } from "@/components/marketing/JsonLd"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: "Artículo no encontrado — SyncLead" }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://synclead.app"
  return {
    title: `${post.title} — Blog SyncLead`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      url: `${base}/blog/${post.slug}`,
    },
    twitter: { card: "summary_large_image" },
  }
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("es", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateStr))
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://synclead.app"

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Organization", name: "SyncLead", url: base },
    publisher: {
      "@type": "Organization",
      name: "SyncLead",
      url: base,
      logo: { "@type": "ImageObject", url: `${base}/opengraph-image` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${base}/blog/${post.slug}` },
  }

  return (
    <>
      <JsonLd data={articleLd} />

      <div className="bg-white">
        {/* Header */}
        <section className="border-b border-zinc-100 py-12 sm:py-16 px-4">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Blog
            </Link>

            <time className="text-sm text-zinc-400 font-medium">{formatDate(post.date)}</time>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold text-zinc-900 tracking-tight leading-snug">
              {post.title}
            </h1>
            <p className="mt-4 text-zinc-500 text-lg leading-relaxed">{post.description}</p>
          </div>
        </section>

        {/* Content */}
        <section className="py-12 px-4">
          <div className="mx-auto max-w-3xl">
            <div className="prose prose-zinc prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-zinc-900 prose-li:text-zinc-700">
              <MDXRemote source={post.content} />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-100 bg-zinc-50 py-14 px-4">
          <div className="mx-auto max-w-2xl text-center">
            <div className="rounded-2xl bg-indigo-600 px-8 py-10">
              <h2 className="text-2xl font-bold text-white mb-3">¿Quieres gestionar tus leads de Meta Ads?</h2>
              <p className="text-indigo-200 mb-6">
                Crea tu cuenta gratis y conecta tu primera campaña en 10 minutos.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                Empezar gratis
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
