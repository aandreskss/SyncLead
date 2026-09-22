import { getPlatformConfig } from "@/lib/admin/platform-config"
import { LoginForm } from "./_components/LoginForm"

export default async function LoginPage() {
  const googleEnabled = await getPlatformConfig("googleLoginEnabled", false)
  return <LoginForm googleEnabled={googleEnabled} />
}
