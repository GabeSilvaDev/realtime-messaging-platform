import { TypingService } from '@/modules/realtime/services/TypingService';

const CONVERSATION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('TypingService', () => {
  let service: TypingService;
  let onExpire: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new TypingService(3000);
    onExpire = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('usa TTL de 3s por padrão', () => {
    const defaultService = new TypingService();

    defaultService.start('s1', CONVERSATION_1, onExpire);
    jest.advanceTimersByTime(2999);
    expect(onExpire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('start retorna true só na ativação; os seguintes apenas renovam o timer', () => {
    expect(service.start('s1', CONVERSATION_1, onExpire)).toBe(true);
    jest.advanceTimersByTime(2000);
    expect(service.start('s1', CONVERSATION_1, onExpire)).toBe(false);
    jest.advanceTimersByTime(2000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(service.isActive('s1', CONVERSATION_1)).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(service.isActive('s1', CONVERSATION_1)).toBe(false);
    expect(service.activeCount).toBe(0);
  });

  it('expiração libera o par e um novo start volta a ativar', () => {
    service.start('s1', CONVERSATION_1, onExpire);
    jest.advanceTimersByTime(3000);

    expect(service.start('s1', CONVERSATION_1, onExpire)).toBe(true);
  });

  it('stop encerra (retorna true) sem chamar onExpire; stop repetido ou desconhecido retorna false', () => {
    service.start('s1', CONVERSATION_1, onExpire);

    expect(service.stop('s1', CONVERSATION_1)).toBe(true);
    expect(service.stop('s1', CONVERSATION_1)).toBe(false);
    expect(service.stop('desconhecido', CONVERSATION_1)).toBe(false);

    jest.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('stop de outra conversa do mesmo socket não afeta a ativa', () => {
    service.start('s1', CONVERSATION_1, onExpire);

    expect(service.stop('s1', CONVERSATION_2)).toBe(false);
    expect(service.isActive('s1', CONVERSATION_1)).toBe(true);
    expect(service.activeCount).toBe(1);
  });

  it('pares (socket, conversa) são independentes', () => {
    const other = jest.fn();
    service.start('s1', CONVERSATION_1, onExpire);
    service.start('s1', CONVERSATION_2, other);
    service.start('s2', CONVERSATION_1, other);

    expect(service.activeCount).toBe(3);
    service.stop('s1', CONVERSATION_1);
    jest.advanceTimersByTime(3000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(2);
  });

  it('stopAll encerra tudo do socket e devolve as conversas que estavam ativas', () => {
    service.start('s1', CONVERSATION_1, onExpire);
    service.start('s1', CONVERSATION_2, onExpire);
    service.start('s2', CONVERSATION_1, onExpire);

    expect(service.stopAll('s1')).toEqual([CONVERSATION_1, CONVERSATION_2]);
    expect(service.stopAll('s1')).toEqual([]);
    expect(service.activeCount).toBe(1);

    jest.advanceTimersByTime(3000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
