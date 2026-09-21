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
        className="h-20 w-20 rounded-full object-cover bg-zinc-800 ring-2 ring-zinc-700"
      />
    )
  }
  return (
    <div className="h-20 w-20 rounded-full bg-indigo-600/20 border-2 border-indigo-500/30 flex items-center justify-center text-2xl font-semibold text-indigo-300 select-none">
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-300">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Feedback({ saved, error }: { saved: boolean; error: string | null }) {
  if (error) {
    return (
      <p className="text-xs text-red-400 flex items-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        {error}
      </p>
    )
  }
  if (saved) {
    return (
      <p className="text-xs text-emerald-400 flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Guardado correctamente
      </p>
    )
  }
  return null
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
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
            className="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-zinc-700 hover:border-indigo-500/60 hover:bg-indigo-500/5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Upload className="h-6 w-6" />
            <span className="text-xs">Haz clic para seleccionar una imagen</span>
            <span className="text-xs text-zinc-600">JPG, PNG, WebP · máx. 4 MB</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/60">
            <img
              src={localPreview!}
              alt="preview"
              className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-300 truncate">{selectedFile.name}</p>
              <p className="text-xs text-zinc-500">{(selectedFile.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={() => { setSelectedFile(null); if (localPreview) URL.revokeObjectURL(localPreview); setLocalPreview(null) }}
              className="text-zinc-500 hover:text-zinc-300 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <Feedback saved={false} error={error} />
        <div className="flex gap-2">
          <button
            onClick={handleUploadFile}
            disabled={pending || !selectedFile}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {pending ? "Subiendo…" : "Subir foto"}
          </button>
          <button onClick={resetState} disabled={pending} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors">
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
          <label className="text-xs text-zinc-500 block mb-1">URL de la imagen</label>
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://ejemplo.com/mi-foto.jpg"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        {urlValue && (
          <img
            src={urlValue}
            alt="preview"
            className="h-12 w-12 rounded-full object-cover bg-zinc-800"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2" }}
          />
        )}
        <Feedback saved={false} error={error} />
        <div className="flex gap-2">
          <button
            onClick={handleSaveUrl}
            disabled={pending || !urlValue.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar URL
          </button>
          <button onClick={resetState} disabled={pending} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors">
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
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 transition-colors"
      >
        <Upload className="h-3.5 w-3.5" />
        Subir imagen
      </button>
      <button
        onClick={() => setMode("url")}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
          Quitar foto
        </button>
      )}
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
      <SectionCard title="Foto de perfil" icon={ImageIcon}>
        <div className="flex items-center gap-4">
          <Avatar name={profile.name} image={savedImage || null} email={profile.email} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{profile.name ?? "Sin nombre"}</p>
            <p className="text-xs text-zinc-500 truncate">{profile.email}</p>
          </div>
        </div>
        <AvatarEditor profile={{ ...profile, image: savedImage || null }} onSaved={handleAvatarSaved} />
        {avatarSaved && <Feedback saved error={null} />}
      </SectionCard>

      {/* ── Nombre ──────────────────────────────────────────────────────── */}
      <SectionCard title="Nombre de perfil" icon={User}>
        {nameEditing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre completo"
              maxLength={100}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <Feedback saved={nameSaved} error={nameError} />
            <div className="flex gap-2">
              <button
                onClick={handleSaveName}
                disabled={namePending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {namePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
              <button
                onClick={() => { setNameEditing(false); setName(profile.name ?? ""); setNameError(null) }}
                disabled={namePending}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-200">
              {profile.name ?? <span className="text-zinc-500 italic">Sin nombre</span>}
            </p>
            <button
              onClick={() => setNameEditing(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
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
              <label className="text-xs text-zinc-500 block mb-1">Nuevo correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nuevo@correo.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Contraseña actual (para confirmar)</label>
              <PasswordInput
                value={emailCurrentPassword}
                onChange={setEmailCurrentPassword}
                placeholder="Tu contraseña actual"
              />
            </div>
            <Feedback saved={emailSaved} error={emailError} />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEmail}
                disabled={emailPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {emailPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
              <button
                onClick={() => { setEmailEditing(false); setEmail(profile.email ?? ""); setEmailCurrentPassword(""); setEmailError(null) }}
                disabled={emailPending}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-200">{profile.email}</p>
            {profile.hasPassword && (
              <button
                onClick={() => setEmailEditing(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Cambiar
              </button>
            )}
          </div>
        )}
        {!emailEditing && emailSaved && (
          <div className="space-y-1">
            <Feedback saved={emailSaved} error={null} />
            <p className="text-xs text-zinc-500">Vuelve a iniciar sesión para ver el email actualizado.</p>
          </div>
        )}
        {!profile.hasPassword && (
          <p className="text-xs text-zinc-600">Tu cuenta usa Google — el email lo gestiona Google.</p>
        )}
      </SectionCard>

      {/* ── Contraseña ──────────────────────────────────────────────────── */}
      {profile.hasPassword && (
        <SectionCard title="Contraseña" icon={Lock}>
          {passwordEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Contraseña actual</label>
                <PasswordInput
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Contraseña actual"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Nueva contraseña</label>
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Confirmar nueva contraseña</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repite la nueva contraseña"
                />
              </div>
              <Feedback saved={passwordSaved} error={passwordError} />
              <div className="flex gap-2">
                <button
                  onClick={handleSavePassword}
                  disabled={passwordPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
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
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">••••••••</p>
              <button
                onClick={() => setPasswordEditing(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
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
