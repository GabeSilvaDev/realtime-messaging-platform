jest.mock('@/shared/database/sequelize', () => ({ __esModule: true, default: {} }));
jest.mock('@/modules/chat/models/Conversation', () => ({ __esModule: true, default: {} }));
jest.mock('@/modules/chat/models/Participant', () => ({ __esModule: true, default: {} }));

import * as repositories from '@/modules/chat/repositories';

describe('chat repositories index', () => {
  it('deve exportar classes e singletons', () => {
    expect(repositories.ConversationRepository).toBeDefined();
    expect(repositories.conversationRepository).toBeInstanceOf(repositories.ConversationRepository);
    expect(repositories.ParticipantRepository).toBeDefined();
    expect(repositories.participantRepository).toBeInstanceOf(repositories.ParticipantRepository);
  });
});
