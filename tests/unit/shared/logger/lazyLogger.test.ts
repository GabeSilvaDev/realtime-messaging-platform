jest.mock('@/shared/logger/models/Log.model', () => ({
  LogModel: {},
}));

type LoggerIndexModule = typeof import('@/shared/logger');

const ORIGINAL_ENV = { ...process.env };

// Cada chamada carrega um registro de módulos novo: o `loggerInstance` do
// Logger.ts começa null e o singleton Logger.instance também.
const loadIsolated = (): LoggerIndexModule => {
  let mod: LoggerIndexModule | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<LoggerIndexModule>('@/shared/logger');
  });
  return mod as LoggerIndexModule;
};

describe('logger (proxy lazy exportado por @/shared/logger)', () => {
  let loaded: LoggerIndexModule | undefined;

  afterEach(() => {
    loaded?.Logger.resetInstance();
    loaded = undefined;
    process.env = { ...ORIGINAL_ENV };
  });

  it('inicializa o logger no primeiro acesso usando NODE_ENV', () => {
    process.env.NODE_ENV = 'staging';
    loaded = loadIsolated();

    expect(loaded.isLoggerInitialized()).toBe(false);

    const info = loaded.logger.info;

    expect(typeof info).toBe('function');
    expect(loaded.isLoggerInitialized()).toBe(true);
    const real = loaded.getLogger() as unknown as { options: Record<string, unknown> };
    expect(real.options).toEqual(
      expect.objectContaining({
        service: 'rtm-platform',
        environment: 'staging',
        minLevel: loaded.LogLevel.DEBUG,
        category: loaded.LogCategory.SYSTEM,
        enableConsole: true,
        enableMongo: false,
      })
    );
  });

  it('usa "development" quando NODE_ENV não está definido', () => {
    delete process.env.NODE_ENV;
    loaded = loadIsolated();

    void loaded.logger.info;

    const real = loaded.getLogger() as unknown as { options: Record<string, unknown> };
    expect(real.options.environment).toBe('development');
  });

  it('não reinicializa quando o logger já foi inicializado', () => {
    loaded = loadIsolated();
    const existing = loaded.initLogger({
      service: 'ja-inicializado',
      environment: 'test',
      enableConsole: false,
      enableMongo: false,
    });

    const child = loaded.logger.child('Ctx');

    expect(loaded.getLogger()).toBe(existing);
    expect(child).toBeInstanceOf(loaded.Logger);
    expect((existing as unknown as { options: { service: string } }).options.service).toBe(
      'ja-inicializado'
    );
  });

  it('faz bind dos métodos ao logger real', () => {
    loaded = loadIsolated();
    loaded.initLogger({
      service: 'bind-test',
      environment: 'test',
      enableConsole: false,
      enableMongo: false,
    });
    const real = loaded.getLogger();
    const setCategorySpy = jest.spyOn(real, 'setCategory');

    const { setCategory } = loaded.logger;
    setCategory(loaded.LogCategory.HTTP);

    expect(setCategorySpy).toHaveBeenCalledWith(loaded.LogCategory.HTTP);
    expect(setCategorySpy.mock.contexts[0]).toBe(real);
  });

  it('retorna propriedades não-função sem bind', () => {
    loaded = loadIsolated();
    loaded.initLogger({
      service: 'prop-test',
      environment: 'test',
      enableConsole: false,
      enableMongo: false,
    });

    const options = (loaded.logger as unknown as { options: { service: string } }).options;

    expect(options.service).toBe('prop-test');
  });

  it('reexporta LogModel', () => {
    loaded = loadIsolated();

    expect(loaded.LogModel).toBeDefined();
  });
});
