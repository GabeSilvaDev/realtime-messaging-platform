import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { CHAT_CONSTANTS } from '../constants';

export class ConversationNotFoundException extends AppError {
  constructor(message = 'Conversa não encontrada') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class ParticipantNotFoundException extends AppError {
  constructor(message = 'Participante não encontrado') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class MessageNotFoundException extends AppError {
  constructor(message = 'Mensagem não encontrada') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class UsersNotFoundException extends AppError {
  constructor(missingIds: string[]) {
    super(
      'Usuário(s) não encontrado(s)',
      HttpStatus.NOT_FOUND,
      ErrorCode.USER_NOT_FOUND,
      true,
      missingIds.map((id) => ({ field: 'userId', message: id, code: ErrorCode.USER_NOT_FOUND }))
    );
  }
}

export class CannotConverseWithSelfException extends AppError {
  constructor(message = 'Você não pode iniciar uma conversa consigo mesmo') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class ConversationBlockedException extends AppError {
  constructor(message = 'Não é possível conversar com este usuário') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.USER_BLOCKED);
  }
}

export class NotConversationAdminException extends AppError {
  constructor(message = 'Apenas administradores do grupo podem realizar esta ação') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}

export class GroupOnlyOperationException extends AppError {
  constructor(message = 'Operação disponível apenas para grupos') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);
  }
}

export class GroupParticipantLimitException extends AppError {
  constructor(max: number = CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS) {
    super(
      `Um grupo pode ter no máximo ${String(max)} participantes`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class InvalidMentionsException extends AppError {
  constructor(message = 'Menções devem referenciar participantes da conversa') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class ClientMessageIdConflictException extends AppError {
  constructor(message = 'clientMessageId já usado em outra conversa') {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }
}

export class NotMessageAuthorException extends AppError {
  constructor(message = 'Apenas o autor pode apagar a mensagem') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}
