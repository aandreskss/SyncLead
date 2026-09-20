import type { Metadata } from "next"
import { JsonLd } from "@/components/marketing/JsonLd"
import { Hero } from "@/components/landing/Hero"
import { AnalyticsSection, BeforeAfter, CapiSection, Faq, FAQS, FinalCta, Features, FunnelSection, HowItWorks, Pricing, Product, Trust } from "@/components/landing/Sections"

export const metadata: Metadata = {
  title: "SyncLead — CRM de leads para Meta Ads",
  description:
    "Captura leads de Facebook e Instagram en tiempo real, asígnalos a tu equipo de WhatsApp, gestiona etapas en kanban y notifica conversiones a Meta automáticamente.",
  openGraph: {
    title: "SyncLead — CRM de leads para Meta Ads",
    description:
      "Captura, organiza y convierte leads de Meta Ads en tiempo real. Kanban, WhatsApp, Meta CAPI y dashboard de rendimiento en un solo lugar.",
    type: "website",
    locale: "es_ES",
  },
  alternates: { canonical: "/" },
  twitter: { card: "summary_large_image" },
}

const softwareAppLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SyncLead",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "CRM de leads para anunciantes de Meta Ads. Captura leads en tiempo real, gestiona etapas en kanban, asigna a WhatsApp y notifica conversiones con Meta CAPI.",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://synclead.app",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
}

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
}

export default function HomePage() {
  return (
    <div className="sg-app bg-sg-bg text-sg-ink">
      <JsonLd data={softwareAppLd} />
      <JsonLd data={faqLd} />
      <Hero />
      <BeforeAfter />
      <HowItWorks />
      <Product />
      <Features />
      <CapiSection />
      <FunnelSection />
      <AnalyticsSection />
      <Trust />
      <Pricing />
      <Faq />
      <FinalCta />
    </div>
  )
}
