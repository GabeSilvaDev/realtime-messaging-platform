import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import type { ISearchService } from '../interfaces';
import { searchService } from '../services/SearchService';
import { searchMessagesQuerySchema } from '../validation';

export class SearchController {
  private readonly search: ISearchService;

  constructor(search?: ISearchService) {
    this.search = search ?? searchService;
  }

  /**
   * `GET /api/search/messages?q=&conversationId=&senderId=&from=&to=&limit=` →
   * `{ items, total, facets: { conversations }, tookMs }`.
   */
  async searchMessages(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = searchMessagesQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const result = await this.search.searchMessages(userId, parsed.data);

    res.status(HttpStatus.OK).json({ success: true, data: result });
  }
}

export const searchController = new SearchController();
