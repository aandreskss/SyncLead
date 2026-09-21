"use client"

import { useState, useTransition, useRef } from "react"
import { useSession } from "next-auth/react"
import {
  updateDisplayNameAction,
  updateAvatarUrlAction,
  uploadAvatarAction,
  updateEmailAction,
  updatePasswordAction,
} from "@/domains/account/actions"
import type { MyProfile } from "@/domains/account/actions"
import {
  User,
  Mail,
  Lock,
  ImageIcon,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  X,
  Upload,
  Link as LinkIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/app/ops"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string | null, email: string | null) {
  const src = name || email || "?"
  return src.split(/[\s@]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function Avatar({ name, image, email }: { name: string | null; image: string | null; email: string | null }) {
  const [imgError, setImgError] = useState(false)
  if (image && !imgError) {
    return (
      <img
        src={image}
        alt={name ?? "avatar"}
        onError={() => setImgError(true)}
        className="h-14 w-14 rounded-full object-cover bg-ops-s2 ring-1 ring-ops-bd"
      />
    )
  }
  return (
    <div className="h-14 w-14 rounded-full bg-ops-blue/15 border border-ops-bd flex items-center justify-center text-lg font-semibold text-ops-blue-t select-none">
      {initials(name, email)}
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-ops-tx2" />
          {title}
        </span>
      }
      bodyClassName="space-y-4 border-t border-ops-line p-4"
    >
      {children}
    </Panel>
  )
}

function Feedback({ saved, error }: { saved: boolean; error: string | null }) {
  if (error) {
    return (
      <p className="text-xs text-ops-coral flex items-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        {error}
      </p>
    )
  }
  if (saved) {
    return (
      <p className="text-xs text-ops-green flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Guardado correctamente
      </p>
    )
  }
  return null
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-ops-tx2 transition-colors hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ─── Avatar editor ────────────────────────────────────────────────────────────

type AvatarMode = "idle" | "file" | "url"

function AvatarEditor({
  profile,
  onSaved,
}: {
  profile: MyProfile
  onSaved: (url: string) => void
}) {
  const [mode, setMode] = useState<AvatarMode>("idle")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // file mode
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  // url mode
  const [urlValue, setUrlValue] = useState("")

  function resetState() {
    setMode("idle")
    setError(null)
    setSelectedFile(null)
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
    setUrlValue("")
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Formato no soportado. Usa JPG, PNG o WebP")
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("La imagen no puede exceder 4 MB")
      return
    }
    if (localPreview) URL.revokeObjectURL(localPreview)
    setSelectedFile(file)
    setLocalPreview(URL.createObjectURL(file))
    setError(null)
  }

  function handleUploadFile() {
    if (!selectedFile) return
    const fd = new FormData()
    fd.append("avatar", selectedFile)
    setError(null)
    startTransition(async () => {
      try {
        const r = await uploadAvatarAction(fd)
        if (r.error) { setError(r.error); return }
        onSaved(r.url!)
        resetState()
      } catch {
        setError("Error inesperado al subir la imagen")
      }
    })
  }

  function handleSaveUrl() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await updateAvatarUrlAction(urlValue)
        if (r.error) { setError(r.error); return }
        onSaved(urlValue)
        resetState()
      } catch {
        setError("Error inesperado al guardar")
      }
    })
  }

  if (mode === "file") {
    return (
      <div className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />
        {!selectedFile ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-md border border-dashed border-ops-bd hover:border-ops-blue hover:bg-ops-hover text-ops-tx2 hover:text-ops-tx transition-colors"
          >
            <Upload className="h-6 w-6" />
            <span className="text-xs">Haz clic para seleccionar una imagen</span>
            <span className="text-xs text-ops-tx3">JPG, PNG, WebP · máx. 4 MB</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-md bg-ops-s2 border border-ops-bd">
            <img
              src={localPreview!}
              alt="preview"
              className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ops-tx truncate">{selectedFile.name}</p>
              <p className="text-xs text-ops-tx2">{(selectedFile.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={() => { setSelectedFile(null); if (localPreview) URL.revokeObjectURL(localPreview); setLocalPreview(null) }}
              className="text-ops-tx2 hover:text-ops-tx flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <Feedback saved={false} error={error} />
        <div className="-mx-4 -mb-4 mt-4 flex flex-row-reverse justify-start gap-2 border-t border-ops-line px-4 py-3">
          <button
            onClick={handleUploadFile}
            disabled={pending || !selectedFile}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ops-blue px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {pending ? "Subiendo…" : "Subir foto"}
          </button>
          <button onClick={resetState} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3.5 text-[13px] font-medium text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-sel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (mode === "url") {
    return (
      <div className="space-y-3">
        <div>
          <label htmlFor="acc-avatar-url" className="mb-1.5 block text-xs font-medium text-ops-tx2">URL de la imagen</label>
          <Input
            id="acc-avatar-url"
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://ejemplo.com/mi-foto.jpg"
          />
        </div>
        {urlValue && (
          <img
            src={urlValue}
            alt="preview"
            className="h-12 w-12 rounded-full object-cover bg-ops-s2"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2" }}
          />
        )}
        <Feedback saved={false} error={error} />
        <div className="-mx-4 -mb-4 mt-4 flex flex-row-reverse justify-start gap-2 border-t border-ops-line px-4 py-3">
          <button
            onClick={handleSaveUrl}
            disabled={pending || !urlValue.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ops-blue px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar URL
          </button>
          <button onClick={resetState} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3.5 text-[13px] font-medium text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-sel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  // idle — show change buttons
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setMode("file")}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3.5 text-[13px] font-medium text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-sel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        Subir imagen
      </button>
      <button
        onClick={() => setMode("url")}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3.5 text-[13px] font-medium text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-sel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
      >
        <LinkIcon className="h-3.5 w-3.5" />
        Usar URL
      </button>
      {profile.image && (
        <button
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const r = await updateAvatarUrlAction("")
              if (r.error) { setError(r.error); return }
              onSaved("")
            })
          }}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] text-ops-tx2 transition-colors hover:bg-ops-hover hover:text-ops-coral focus-visible:outline-2 focus-visible:outline-ops-blue disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Quitar foto
        </button>
      )}
      <span className="self-center text-xs text-ops-tx3">JPG, PNG, WebP · máx. 4 MB</span>
      {error && <Feedback saved={false} error={error} />}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountView({ profile }: { profile: MyProfile }) {
  const { update: updateSession } = useSession()

  // ── Avatar ────────────────────────────────────────────────────────────────
  const [savedImage, setSavedImage] = useState(profile.image ?? "")
  const [avatarSaved, setAvatarSaved] = useState(false)

  async function handleAvatarSaved(url: string) {
    setSavedImage(url)
    setAvatarSaved(true)
    await updateSession()
    setTimeout(() => setAvatarSaved(false), 3000)
  }

  // ── Name ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState(profile.name ?? "")
  const [nameEditing, setNameEditing] = useState(false)
  const [namePending, startName] = useTransition()
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  function handleSaveName() {
    setNameError(null)
    setNameSaved(false)
    startName(async () => {
      try {
        const r = await updateDisplayNameAction(name)
        if (r.error) { setNameError(r.error); return }
        setNameSaved(true)
        setNameEditing(false)
        await updateSession()
        setTimeout(() => setNameSaved(false), 3000)
      } catch {
        setNameError("Error inesperado al guardar")
      }
    })
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const [email, setEmail] = useState(profile.email ?? "")
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("")
  const [emailEditing, setEmailEditing] = useState(false)
  const [emailPending, startEmail] = useTransition()
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  function handleSaveEmail() {
    setEmailError(null)
    setEmailSaved(false)
    startEmail(async () => {
      try {
        const r = await updateEmailAction(email, emailCurrentPassword)
        if (r.error) { setEmailError(r.error); return }
        setEmailSaved(true)
        setEmailEditing(false)
        setEmailCurrentPassword("")
        await updateSession()
        setTimeout(() => setEmailSaved(false), 4000)
      } catch {
        setEmailError("Error inesperado al guardar")
      }
    })
  }

  // ── Password ──────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordEditing, setPasswordEditing] = useState(false)
  const [passwordPending, startPassword] = useTransition()
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  function handleSavePassword() {
    setPasswordError(null)
    setPasswordSaved(false)
    if (newPassword !== confirmPassword) {
      setPasswordError("Las contraseñas nuevas no coinciden")
      return
    }
    startPassword(async () => {
      try {
        const r = await updatePasswordAction(currentPassword, newPassword)
        if (r.error) { setPasswordError(r.error); return }
        setPasswordSaved(true)
        setPasswordEditing(false)
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setTimeout(() => setPasswordSaved(false), 3000)
      } catch {
        setPasswordError("Error inesperado al guardar")
      }
    })
  }

  return (
    <div className="space-y-4">

      {/* ── Foto de perfil ─────────────────────────────────────────────── */}
      <SectionCard title="Perfil" icon={ImageIcon}>
        <div className="flex items-center gap-4">
          <Avatar name={profile.name} image={savedImage || null} email={profile.email} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ops-tx truncate">{profile.name ?? "Sin nombre"}</p>
            <p className="text-xs text-ops-tx2 truncate">{profile.email}</p>
          </div>
        </div>
        <AvatarEditor profile={{ ...profile, image: savedImage || null }} onSaved={handleAvatarSaved} />
        {avatarSaved && <Feedback saved error={null} />}
      </SectionCard>

      {/* ── Nombre ──────────────────────────────────────────────────────── */}
      <SectionCard title="Nombre" icon={User}>
        {nameEditing ? (
          <div className="space-y-3">
            <label htmlFor="acc-name" className="block text-xs font-medium text-ops-tx2">Nombre completo</label>
            <Input
              id="acc-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre completo"
              maxLength={100}
            />
            <Feedback saved={nameSaved} error={nameError} />
            <div className="-mx-4 -mb-4 mt-4 flex flex-row-reverse justify-start gap-2 border-t border-ops-line px-4 py-3">
              <button
                onClick={handleSaveName}
                disabled={namePending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ops-blue px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
              >
                {namePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
              <button
                onClick={() => { setNameEditing(false); setName(profile.name ?? ""); setNameError(null) }}
                disabled={namePending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3.5 text-[13px] font-medium text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-sel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-ops-tx">
              {profile.name ?? <span className="text-ops-tx2 italic">Sin nombre</span>}
            </p>
            <button
              onClick={() => setNameEditing(true)}
              className="rounded text-[13px] font-medium text-ops-blue-t transition-colors hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue"
            >
              Editar
            </button>
          </div>
        )}
        {!nameEditing && nameSaved && <Feedback saved={nameSaved} error={null} />}
      </SectionCard>

      {/* ── Email ────────────────────────────────────────────────────────── */}
      <SectionCard title="Correo electrónico" icon={Mail}>
        {emailEditing ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="acc-email" className="mb-1.5 block text-xs font-medium text-ops-tx2">Nuevo correo</label>
              <Input
                id="acc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nuevo@correo.com"
              />
            </div>
            <div>
              <label htmlFor="acc-email-pw" className="mb-1.5 block text-xs font-medium text-ops-tx2">Contraseña actual (para confirmar)</label>
              <PasswordInput
                id="acc-email-pw"
                value={emailCurrentPassword}
                onChange={setEmailCurrentPassword}
                placeholder="Tu contraseña actual"
              />
            </div>
            <Feedback saved={emailSaved} error={emailError} />
            <div className="-mx-4 -mb-4 mt-4 flex flex-row-reverse justify-start gap-2 border-t border-ops-line px-4 py-3">
              <button
                onClick={handleSaveEmail}
                disabled={emailPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ops-blue px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
              >
                {emailPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
              <button
                onClick={() => { setEmailEditing(false); setEmail(profile.email ?? ""); setEmailCurrentPassword(""); setEmailError(null) }}
                disabled={emailPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3.5 text-[13px] font-medium text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-sel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-ops-tx">{profile.email}</p>
            {profile.hasPassword && (
              <button
                onClick={() => setEmailEditing(true)}
                className="rounded text-[13px] font-medium text-ops-blue-t transition-colors hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue"
              >
                Cambiar
              </button>
            )}
          </div>
        )}
        {!emailEditing && emailSaved && (
          <div className="space-y-1">
            <Feedback saved={emailSaved} error={null} />
            <p className="text-xs text-ops-tx2">Vuelve a iniciar sesión para ver el email actualizado.</p>
          </div>
        )}
        {!profile.hasPassword && (
          <p className="text-xs text-ops-tx3">Tu cuenta usa Google — el email lo gestiona Google.</p>
        )}
      </SectionCard>

      {/* ── Contraseña ──────────────────────────────────────────────────── */}
      {profile.hasPassword && (
        <SectionCard title="Contraseña" icon={Lock}>
          {passwordEditing ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="acc-pw-cur" className="mb-1.5 block text-xs font-medium text-ops-tx2">Contraseña actual</label>
                <PasswordInput
                  id="acc-pw-cur"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Contraseña actual"
                />
              </div>
              <div>
                <label htmlFor="acc-pw-new" className="mb-1.5 block text-xs font-medium text-ops-tx2">Nueva contraseña</label>
                <PasswordInput
                  id="acc-pw-new"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label htmlFor="acc-pw-conf" className="mb-1.5 block text-xs font-medium text-ops-tx2">Confirmar nueva contraseña</label>
                <PasswordInput
                  id="acc-pw-conf"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repite la nueva contraseña"
                />
              </div>
              <Feedback saved={passwordSaved} error={passwordError} />
              <div className="-mx-4 -mb-4 mt-4 flex flex-row-reverse justify-start gap-2 border-t border-ops-line px-4 py-3">
                <button
                  onClick={handleSavePassword}
                  disabled={passwordPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ops-blue px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
                >
                  {passwordPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Cambiar contraseña
                </button>
                <button
                  onClick={() => {
                    setPasswordEditing(false)
                    setCurrentPassword("")
                    setNewPassword("")
                    setConfirmPassword("")
                    setPasswordError(null)
                  }}
                  disabled={passwordPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3.5 text-[13px] font-medium text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-sel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ops-tx2">••••••••</p>
              <button
                onClick={() => setPasswordEditing(true)}
                className="rounded text-[13px] font-medium text-ops-blue-t transition-colors hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue"
              >
                Cambiar
              </button>
            </div>
          )}
          {!passwordEditing && passwordSaved && <Feedback saved={passwordSaved} error={null} />}
        </SectionCard>
      )}
    </div>
  )
}
