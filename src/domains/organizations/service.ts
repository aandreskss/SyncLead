import { createOrganization, slugExists } from "./repository"
import type { Organization } from "@/lib/db/schema"

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = toSlug(base)
  let attempt = 0
  while (await slugExists(slug)) {
    attempt++
    slug = `${toSlug(base)}-${attempt}`
  }
  return slug
}

export async function provisionOrganization(ownerId: string, name: string): Promise<Organization> {
  const slug = await uniqueSlug(name)
  return createOrganization({ ownerId, name, slug })
}
