export class AuthError extends Error {
  constructor(message = "Sesión requerida") {
    super(message)
    this.name = "AuthError"
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Sin acceso") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends Error {
  constructor(message = "No encontrado") {
    super(message)
    this.name = "NotFoundError"
  }
}
