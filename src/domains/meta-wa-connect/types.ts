import "server-only"

export type WaConnectionMode = "embedded_signup" | "manual"
export type WaConnectionStatus =
  | "active"          // fully connected and operational
  | "pending_review"  // connected but app under Meta review (scopes not yet granted)
  | "partial"         // some scopes granted but not all required ones
  | "reconnecting"    // OAuth in progress for existing connection
  | "error"           // token invalid, revoked, or Meta error
  | "disconnected"    // explicitly disconnected

export interface MetaTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number // absent for long-lived tokens
}

export interface MetaTokenDebugInfo {
  app_id: string
  type: string
  application: string
  is_valid: boolean
  scopes: string[]
  expires_at?: number
}

export interface MetaWabaInfo {
  id: string
  name: string
  account_review_status?: string
  country?: string
  currency?: string
}

export interface MetaPhoneNumberInfo {
  id: string                    // phone_number_id
  display_phone_number: string  // E.164
  verified_name?: string
  quality_rating?: string
  status?: string
}

// Parsed from Embedded Signup signed_request callback
export interface EmbeddedSignupData {
  wabaId: string
  phoneNumberId?: string
}

export interface WaConnectResult {
  wabaId: string
  wabaName: string
  phoneNumbers: MetaPhoneNumberInfo[]
  scopes: string[]
  tokenExpiresAt?: Date
  pendingReview: boolean
}

export interface WaConnectError {
  code:
    | "state_invalid"
    | "state_expired"
    | "state_consumed"
    | "org_mismatch"
    | "user_cancelled"
    | "token_exchange_failed"
    | "waba_not_found"
    | "waba_unauthorized"
    | "number_conflict"          // phone linked to different org
    | "missing_required_scopes"
    | "meta_error"
  detail?: string
}
