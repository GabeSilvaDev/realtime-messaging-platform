export { AuthService, authService } from './services/AuthService';
export { TokenService } from './services/TokenService';
export { PasswordService } from './services/PasswordService';

export { AuthController, authController } from './controllers';

export { authRoutes } from './routes';

export { authenticate, optionalAuth, asyncHandler } from './middlewares';

export {
  AuthException,
  InvalidCredentialsException,
  InvalidTokenException,
  UserNotFoundException,
  EmailAlreadyExistsException,
  UsernameAlreadyExistsException,
  InvalidPasswordException,
  SamePasswordException,
  UnauthorizedException,
  ValidationException,
} from './exceptions';

export type {
  TokenPayload,
  DecodedToken,
  TokenPair,
  RefreshTokenAttributes,
  RefreshTokenCreation,
  AuthContext,
  AuthEventData,
  RegisterDTO,
  LoginDTO,
  AuthResponseDTO,
  RefreshResponseDTO,
  ForgotPasswordDTO,
  ResetPasswordDTO,
  ChangePasswordDTO,
} from './types';
export { TokenType } from './types';

export {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './validation/auth.schemas';
export type {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from './validation/auth.schemas';

export {
  AUTH_CONSTANTS,
  PASSWORD_RESET_PREFIX,
  PASSWORD_RESET_TTL,
} from './constants/auth.constants';
