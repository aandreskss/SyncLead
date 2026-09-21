"use client"

import { useState, useTransition } from "react"
import { useSession } from "next-auth/react"
import {
  updateDisplayNameAction,
  updateAvatarUrlAction,
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountView({ profile }: { profile: MyProfile }) {
  const { update: updateSession } = useSession()

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

  // ── Avatar ────────────────────────────────────────────────────────────────
  const [imageUrl, setImageUrl] = useState(profile.image ?? "")
  const [avatarEditing, setAvatarEditing] = useState(false)
  const [avatarPending, startAvatar] = useTransition()
  const [avatarSaved, setAvatarSaved] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState(profile.image ?? "")

  function handleSaveAvatar() {
    setAvatarError(null)
    setAvatarSaved(false)
    startAvatar(async () => {
      try {
        const r = await updateAvatarUrlAction(imageUrl)
        if (r.error) { setAvatarError(r.error); return }
        setPreviewImage(imageUrl)
        setAvatarSaved(true)
        setAvatarEditing(false)
        await updateSession()
        setTimeout(() => setAvatarSaved(false), 3000)
      } catch {
        setAvatarError("Error inesperado al guardar")
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
          <Avatar name={profile.name} image={previewImage || null} email={profile.email} />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-zinc-200">{profile.name ?? "Sin nombre"}</p>
            <p className="text-xs text-zinc-500">{profile.email}</p>
            {!avatarEditing && (
              <button
                onClick={() => setAvatarEditing(true)}
                className="mt-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Cambiar foto
              </button>
            )}
          </div>
        </div>

        {avatarEditing && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">URL de la imagen</label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://ejemplo.com/mi-foto.jpg"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <p className="text-xs text-zinc-600 mt-1">Pega el enlace directo a una imagen (JPG, PNG, etc.)</p>
            </div>
            {imageUrl && (
              <div className="flex items-center gap-3">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="h-10 w-10 rounded-full object-cover bg-zinc-800"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3" }}
                />
                <span className="text-xs text-zinc-500">Vista previa</span>
                <button
                  onClick={() => setImageUrl("")}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <X className="h-3 w-3" />Quitar foto
                </button>
              </div>
            )}
            <Feedback saved={avatarSaved} error={avatarError} />
            <div className="flex gap-2">
              <button
                onClick={handleSaveAvatar}
                disabled={avatarPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {avatarPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
              <button
                onClick={() => { setAvatarEditing(false); setImageUrl(previewImage); setAvatarError(null) }}
                disabled={avatarPending}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {!avatarEditing && avatarSaved && (
          <Feedback saved={avatarSaved} error={null} />
        )}
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
            <p className="text-sm text-zinc-200">{profile.name ?? <span className="text-zinc-500 italic">Sin nombre</span>}</p>
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
