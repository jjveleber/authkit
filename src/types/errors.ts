/**
 * Custom authentication error with HTTP status code
 */
export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}

/**
 * Factory methods for common auth errors
 */
export const AuthErrors = {
  unauthorized(message = 'Unauthorized'): AuthError {
    return new AuthError(401, message);
  },

  forbidden(message = 'Forbidden'): AuthError {
    return new AuthError(403, message);
  },

  notFound(message = 'Not found'): AuthError {
    return new AuthError(404, message);
  },

  conflict(message = 'Conflict'): AuthError {
    return new AuthError(409, message);
  },

  badRequest(message = 'Bad request'): AuthError {
    return new AuthError(400, message);
  },
};
