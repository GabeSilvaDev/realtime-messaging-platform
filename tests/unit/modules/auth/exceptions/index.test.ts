import {
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
} from '@/modules/auth/exceptions';

describe('auth/exceptions index', () => {
  it('deve exportar AuthException', () => {
    expect(AuthException).toBeDefined();
    expect(new AuthException('erro')).toBeInstanceOf(AuthException);
  });

  it('deve exportar InvalidCredentialsException', () => {
    expect(InvalidCredentialsException).toBeDefined();
    expect(new InvalidCredentialsException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar InvalidTokenException', () => {
    expect(InvalidTokenException).toBeDefined();
    expect(new InvalidTokenException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar UserNotFoundException', () => {
    expect(UserNotFoundException).toBeDefined();
    expect(new UserNotFoundException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar EmailAlreadyExistsException', () => {
    expect(EmailAlreadyExistsException).toBeDefined();
    expect(new EmailAlreadyExistsException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar UsernameAlreadyExistsException', () => {
    expect(UsernameAlreadyExistsException).toBeDefined();
    expect(new UsernameAlreadyExistsException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar InvalidPasswordException', () => {
    expect(InvalidPasswordException).toBeDefined();
    expect(new InvalidPasswordException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar SamePasswordException', () => {
    expect(SamePasswordException).toBeDefined();
    expect(new SamePasswordException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar UnauthorizedException', () => {
    expect(UnauthorizedException).toBeDefined();
    expect(new UnauthorizedException()).toBeInstanceOf(AuthException);
  });

  it('deve exportar ValidationException', () => {
    expect(ValidationException).toBeDefined();
    expect(new ValidationException()).toBeInstanceOf(ValidationException);
  });
});
