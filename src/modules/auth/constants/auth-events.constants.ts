export enum AuthEventType {
  REGISTER = 'auth:register',
  LOGIN = 'auth:login',
  LOGIN_FAILED = 'auth:login_failed',
  LOGOUT = 'auth:logout',
  TOKEN_REFRESH = 'auth:token_refresh',
  PASSWORD_RESET_REQUEST = 'auth:password_reset_request',
  PASSWORD_RESET = 'auth:password_reset',
  PASSWORD_CHANGE = 'auth:password_change',
}
