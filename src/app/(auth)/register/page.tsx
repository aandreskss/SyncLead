import { getPlatformConfig } from "@/lib/admin/platform-config"
import { RegisterForm } from "./_components/RegisterForm"

export default async function RegisterPage() {
  const googleEnabled = await getPlatformConfig("googleLoginEnabled", false)
  return <RegisterForm googleEnabled={googleEnabled} />
}
