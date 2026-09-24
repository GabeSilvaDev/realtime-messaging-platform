jest.mock('@/modules/chat/controllers/ConversationController', () => ({
  conversationController: {
    createDirect: jest.fn(),
    createGroup: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    rename: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    leave: jest.fn(),
    addMembers: jest.fn(),
    removeMember: jest.fn(),
  },
}));

jest.mock('@/modules/chat/controllers/MessageController', () => ({
  messageController: {
    list: jest.fn(),
    send: jest.fn(),
    delete: jest.fn(),
    markRead: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn(),
  asyncHandler: (fn: unknown): unknown => fn,
}));

import type { Router } from 'express';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { conversationController } from '@/modules/chat/controllers/ConversationController';
import { messageController } from '@/modules/chat/controllers/MessageController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((conversationRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

const ROUTES = [
  ['POST', '/direct', conversationController, 'createDirect'],
  ['POST', '/group', conversationController, 'createGroup'],
  ['GET', '/', conversationController, 'list'],
  ['GET', '/:id', conversationController, 'get'],
  ['PATCH', '/:id', conversationController, 'rename'],
  ['POST', '/:id/archive', conversationController, 'archive'],
  ['DELETE', '/:id/archive', conversationController, 'unarchive'],
  ['POST', '/:id/leave', conversationController, 'leave'],
  ['POST', '/:id/members', conversationController, 'addMembers'],
  ['DELETE', '/:id/members/:userId', conversationController, 'removeMember'],
  ['GET', '/:id/messages', messageController, 'list'],
  ['POST', '/:id/messages', messageController, 'send'],
  ['DELETE', '/:id/messages/:messageId', messageController, 'delete'],
  ['POST', '/:id/read', messageController, 'markRead'],
] as const;

describe('conversation.routes', () => {
  it('deve definir exatamente as 14 rotas do chat', () => {
    expect(getRoutes().map(({ method, path }) => `${method} ${path}`)).toEqual(
      ROUTES.map(([method, path]) => `${method} ${path}`)
    );
  });

  it('deve declarar /direct e /group antes de /:id', () => {
    const paths = getRoutes().map((r) => r.path);
    const firstParam = paths.indexOf('/:id');
    expect(paths.indexOf('/direct')).toBeLessThan(firstParam);
    expect(paths.indexOf('/group')).toBeLessThan(firstParam);
  });

  it('deve proteger todas as rotas com authenticate', () => {
    for (const { layer } of getRoutes()) {
      expect(layer.route!.stack[0]!.handle).toBe(authenticate);
    }
  });

  it.each(ROUTES)('%s %s deve chamar o controller', async (method, path, controller, handler) => {
    const route = getRoutes().find((r) => r.method === method && r.path === path)!;
    const handle = route.layer.route!.stack[1]!.handle;
    const req = {};
    const res = {};

    await handle(req, res);

    expect((controller as unknown as Record<string, jest.Mock>)[handler]).toHaveBeenCalledWith(
      req,
      res
    );
  });
});
