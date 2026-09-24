jest.mock('@/modules/presence/services', () => ({ presenceService: {} }));

import type { Request, Response } from 'express';
import { PresenceController } from '@/modules/presence/controllers/PresenceController';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: ANA, email: 'ana@example.com', username: 'ana' },
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function createRes(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('PresenceController', () => {
  let presence: { getVisibleStates: jest.Mock; setManualStatus: jest.Mock };
  let controller: PresenceController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    presence = { getVisibleStates: jest.fn(), setManualStatus: jest.fn() };
    controller = new PresenceController(presence);
    res = createRes();
  });

  it('usa o presenceService padrão quando nenhum é injetado', () => {
    expect(new PresenceController()).toBeInstanceOf(PresenceController);
  });

  describe('getStates', () => {
    it('responde { items } com os estados visíveis para quem pergunta', async () => {
      const items = [{ userId: BOB, state: 'online', lastSeenAt: null }];
      presence.getVisibleStates.mockResolvedValue(items);

      await controller.getStates(createReq({ query: { userIds: `${BOB}` } }), res);

      expect(presence.getVisibleStates).toHaveBeenCalledWith(ANA, [BOB]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { items } });
    });

    it('userIds inválido → 400 sem consultar', async () => {
      await controller.getStates(createReq({ query: { userIds: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(presence.getVisibleStates).not.toHaveBeenCalled();
    });

    it('sem usuário autenticado lança UnauthorizedError', async () => {
      await expect(controller.getStates(createReq({ user: undefined }), res)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  describe('setStatus', () => {
    it('grava o status manual e responde 204', async () => {
      presence.setManualStatus.mockResolvedValue({ state: 'away', changed: true });

      await controller.setStatus(createReq({ body: { status: 'away' } }), res);

      expect(presence.setManualStatus).toHaveBeenCalledWith(ANA, 'away');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('status inválido → 400', async () => {
      await controller.setStatus(createReq({ body: { status: 'offline' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(presence.setManualStatus).not.toHaveBeenCalled();
    });
  });
});
