import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://synclead.app"
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/features", "/pricing", "/blog"],
        disallow: ["/dashboard", "/api/", "/onboarding", "/verify-email"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
