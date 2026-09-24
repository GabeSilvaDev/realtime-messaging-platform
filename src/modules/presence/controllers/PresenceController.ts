import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import type { IPresenceService } from '../interfaces';
import { presenceService } from '../services';
import { presenceQuerySchema, presenceStatusSchema } from '../validation';

export class PresenceController {
  private readonly presence: Pick<IPresenceService, 'getVisibleStates' | 'setManualStatus'>;

  constructor(presence?: Pick<IPresenceService, 'getVisibleStates' | 'setManualStatus'>) {
    this.presence = presence ?? presenceService;
  }

  /** `GET /api/presence?userIds=a,b` → `{ items: [{ userId, state, lastSeenAt }] }`. */
  async getStates(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = presenceQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const items = await this.presence.getVisibleStates(userId, parsed.data.userIds);

    res.status(HttpStatus.OK).json({ success: true, data: { items } });
  }

  /** `PUT /api/presence/status { status }` → 204 (mesma regra do `presence:set`). */
  async setStatus(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = presenceStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    await this.presence.setManualStatus(userId, parsed.data.status);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const presenceController = new PresenceController();
