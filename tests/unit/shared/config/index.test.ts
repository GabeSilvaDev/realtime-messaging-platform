import { getAvatarPath, getImagePath, uploadConfig } from '@/shared/config';
import type { Config, ImageSize, UploadConfig } from '@/shared/config';

describe('shared/config index', () => {
  it('deve exportar getAvatarPath e getImagePath funcionais', () => {
    expect(typeof getAvatarPath).toBe('function');
    expect(typeof getImagePath).toBe('function');
    expect(getAvatarPath('user-1.webp')).toContain('user-1.webp');
    expect(typeof getImagePath()).toBe('string');
  });

  it('deve exportar uploadConfig', () => {
    expect(uploadConfig).toBeDefined();
    expect(uploadConfig.storage).toBeDefined();
  });

  it('deve permitir usar os tipos re-exportados (Config, ImageSize, UploadConfig)', () => {
    const size: ImageSize = { name: 'thumb', width: 100, height: 100, fit: 'cover' };
    const config: Partial<Config> = {};
    const upload: Partial<UploadConfig> = uploadConfig;
    expect(size.name).toBe('thumb');
    expect(config).toEqual({});
    expect(upload.storage).toBeDefined();
  });
});
