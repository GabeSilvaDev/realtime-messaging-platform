import {
  CannotConverseWithSelfException,
  ClientMessageIdConflictException,
  ConversationBlockedException,
  ConversationNotFoundException,
  GroupOnlyOperationException,
  GroupParticipantLimitException,
  InvalidMentionsException,
  MessageNotFoundException,
  NotConversationAdminException,
  NotMessageAuthorException,
  ParticipantNotFoundException,
  UsersNotFoundException,
} from '@/modules/chat/errors';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

describe('chat errors', () => {
  it.each([
    [
      new ConversationNotFoundException(),
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Conversa não encontrada',
    ],
    [
      new ParticipantNotFoundException(),
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Participante não encontrado',
    ],
    [
      new MessageNotFoundException(),
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Mensagem não encontrada',
    ],
    [
      new CannotConverseWithSelfException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Você não pode iniciar uma conversa consigo mesmo',
    ],
    [
      new ConversationBlockedException(),
      HttpStatus.FORBIDDEN,
      ErrorCode.USER_BLOCKED,
      'Não é possível conversar com este usuário',
    ],
    [
      new NotConversationAdminException(),
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      'Apenas administradores do grupo podem realizar esta ação',
    ],
    [
      new GroupOnlyOperationException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.BAD_REQUEST,
      'Operação disponível apenas para grupos',
    ],
    [
      new GroupParticipantLimitException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Um grupo pode ter no máximo 256 participantes',
    ],
    [
      new InvalidMentionsException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Menções devem referenciar participantes da conversa',
    ],
    [
      new NotMessageAuthorException(),
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      'Apenas o autor pode apagar a mensagem',
    ],
    [
      new ClientMessageIdConflictException(),
      HttpStatus.CONFLICT,
      ErrorCode.CONFLICT,
      'clientMessageId já usado em outra conversa',
    ],
  ])('%p deve ter status, código e mensagem padrão', (error, status, code, message) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
  });

  it('deve aceitar mensagens personalizadas', () => {
    expect(new ConversationNotFoundException('x').message).toBe('x');
    expect(new ParticipantNotFoundException('x').message).toBe('x');
    expect(new MessageNotFoundException('x').message).toBe('x');
    expect(new CannotConverseWithSelfException('x').message).toBe('x');
    expect(new ConversationBlockedException('x').message).toBe('x');
    expect(new NotConversationAdminException('x').message).toBe('x');
    expect(new GroupOnlyOperationException('x').message).toBe('x');
    expect(new InvalidMentionsException('x').message).toBe('x');
    expect(new NotMessageAuthorException('x').message).toBe('x');
    expect(new ClientMessageIdConflictException('x').message).toBe('x');
    expect(new GroupParticipantLimitException(10).message).toBe(
      'Um grupo pode ter no máximo 10 participantes'
    );
  });

  it('UsersNotFoundException deve listar os ids ausentes em details (404)', () => {
    const error = new UsersNotFoundException(['id-1', 'id-2']);

    expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(error.code).toBe(ErrorCode.USER_NOT_FOUND);
    expect(error.message).toBe('Usuário(s) não encontrado(s)');
    expect(error.details).toEqual([
      { field: 'userId', message: 'id-1', code: ErrorCode.USER_NOT_FOUND },
      { field: 'userId', message: 'id-2', code: ErrorCode.USER_NOT_FOUND },
    ]);
  });
});
