import {
  slugify,
  truncate,
  capitalize,
  capitalizeWords,
  maskEmail,
  maskPhone,
  stripHtml,
  escapeHtml,
  generateRandomString,
  timeAgo,
  formatISODate,
  formatDate,
  formatDateTime,
  isExpired,
  addTime,
  generateUUID,
  generateToken,
  generateShortId,
  hashString,
  pick,
  omit,
  deepClone,
  isEmpty,
  flatten,
  chunk,
  groupBy,
  unique,
  uniqueBy,
  shuffle,
  last,
  first,
  sleep,
  retry,
  withTimeout,
  debounce,
  throttle,
  clamp,
  randomInt,
  formatNumber,
  formatBytes,
  buildQueryString,
  parseQueryString,
  joinUrl,
  isDefined,
  isString,
  isNumber,
  isValidDate,
  isPlainObject,
} from '@/shared/utils/helpers';

describe('Helpers', () => {
  describe('String Utils', () => {
    describe('slugify', () => {
      it('should convert text to slug', () => {
        expect(slugify('Hello World')).toBe('hello-world');
      });

      it('should remove accents', () => {
        expect(slugify('Café com Leite')).toBe('cafe-com-leite');
      });

      it('should remove special characters', () => {
        expect(slugify('Hello! @World#')).toBe('hello-world');
      });

      it('should trim and collapse multiple spaces', () => {
        expect(slugify('  Hello   World  ')).toBe('hello-world');
      });

      it('should remove leading and trailing dashes', () => {
        expect(slugify('---hello---world---')).toBe('hello-world');
      });
    });

    describe('truncate', () => {
      it('should truncate long strings', () => {
        expect(truncate('Hello World', 8)).toBe('Hello...');
      });

      it('should not truncate short strings', () => {
        expect(truncate('Hello', 10)).toBe('Hello');
      });

      it('should use custom suffix', () => {
        expect(truncate('Hello World', 9, '…')).toBe('Hello Wo…');
      });
    });

    describe('capitalize', () => {
      it('should capitalize first letter', () => {
        expect(capitalize('hello')).toBe('Hello');
      });

      it('should lowercase the rest', () => {
        expect(capitalize('HELLO')).toBe('Hello');
      });

      it('should handle empty string', () => {
        expect(capitalize('')).toBe('');
      });
    });

    describe('capitalizeWords', () => {
      it('should capitalize first letter of each word', () => {
        expect(capitalizeWords('hello world')).toBe('Hello World');
      });
    });

    describe('maskEmail', () => {
      it('should mask email address', () => {
        expect(maskEmail('john.doe@example.com')).toBe('jo***@example.com');
      });

      it('should handle short local parts', () => {
        expect(maskEmail('j@example.com')).toBe('j***@example.com');
      });

      it('should return original if invalid', () => {
        expect(maskEmail('invalid')).toBe('invalid');
      });
    });

    describe('maskPhone', () => {
      it('should mask phone number', () => {
        expect(maskPhone('1234567890')).toBe('12****7890');
      });

      it('should return original if too short', () => {
        expect(maskPhone('1234567')).toBe('1234567');
      });
    });

    describe('stripHtml', () => {
      it('should remove HTML tags', () => {
        expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
      });
    });

    describe('escapeHtml', () => {
      it('should escape HTML special characters', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
          '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
        );
      });

      it('should escape ampersand', () => {
        expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
      });

      it('should escape single quotes', () => {
        expect(escapeHtml("it's")).toBe('it&#39;s');
      });

      it('should return original string when no special characters', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
      });
    });

    describe('generateRandomString', () => {
      it('should generate string of specified length', () => {
        expect(generateRandomString(16)).toHaveLength(16);
      });

      it('should generate different strings', () => {
        expect(generateRandomString(16)).not.toBe(generateRandomString(16));
      });
    });
  });

  describe('Date Utils', () => {
    describe('timeAgo', () => {
      it('should return "just now" for recent dates', () => {
        expect(timeAgo(new Date())).toBe('just now');
      });

      it('should return seconds ago', () => {
        const date = new Date(Date.now() - 30000);
        expect(timeAgo(date)).toBe('30 seconds ago');
      });

      it('should return singular form', () => {
        const date = new Date(Date.now() - 60000);
        expect(timeAgo(date)).toBe('1 minute ago');
      });

      it('should return minutes ago', () => {
        const date = new Date(Date.now() - 300000);
        expect(timeAgo(date)).toBe('5 minutes ago');
      });

      it('should return hours ago', () => {
        const date = new Date(Date.now() - 7200000);
        expect(timeAgo(date)).toBe('2 hours ago');
      });

      it('should return days ago', () => {
        const date = new Date(Date.now() - 172800000);
        expect(timeAgo(date)).toBe('2 days ago');
      });
    });

    describe('formatISODate', () => {
      it('should format date to ISO without milliseconds', () => {
        const date = new Date('2024-01-15T12:00:00.123Z');
        expect(formatISODate(date)).toBe('2024-01-15T12:00:00Z');
      });
    });

    describe('formatDate', () => {
      it('should format date with default options', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = formatDate(date);
        expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
      });

      it('should format date with custom locale', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = formatDate(date, 'pt-BR');
        expect(result).toBeDefined();
      });

      it('should format date with custom options', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = formatDate(date, 'en-US', { month: 'long' });
        expect(result).toContain('January');
      });
    });

    describe('formatDateTime', () => {
      it('should format date and time', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = formatDateTime(date);
        expect(result).toBeDefined();
      });

      it('should accept custom options', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = formatDateTime(date, 'en-US', { weekday: 'long' });
        expect(result).toContain('Monday');
      });
    });

    describe('isExpired', () => {
      it('should return true for past dates', () => {
        expect(isExpired(new Date(Date.now() - 1000))).toBe(true);
      });

      it('should return false for future dates', () => {
        expect(isExpired(new Date(Date.now() + 10000))).toBe(false);
      });
    });

    describe('addTime', () => {
      it('should add seconds', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 30, 'second');
        expect(result.getUTCSeconds()).toBe(30);
      });

      it('should add minutes', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 30, 'minute');
        expect(result.getUTCMinutes()).toBe(30);
      });

      it('should add hours', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 2, 'hour');
        expect(result.getUTCHours()).toBe(14);
      });

      it('should add days', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 5, 'day');
        expect(result.getUTCDate()).toBe(20);
      });

      it('should add weeks', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 2, 'week');
        expect(result.getUTCDate()).toBe(29);
      });

      it('should add months', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 2, 'month');
        expect(result.getUTCMonth()).toBe(2);
      });

      it('should add years', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 2, 'year');
        expect(result.getUTCFullYear()).toBe(2026);
      });

      it('should handle unknown unit gracefully', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = addTime(date, 5, 'unknown' as 'day');
        expect(result.getTime()).toBe(date.getTime());
      });
    });
  });

  describe('Token/Hash Utils', () => {
    describe('generateUUID', () => {
      it('should generate valid UUID', () => {
        const uuid = generateUUID();
        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });
    });

    describe('generateToken', () => {
      it('should generate token of default length', () => {
        expect(generateToken()).toHaveLength(64);
      });

      it('should generate token of specified length', () => {
        expect(generateToken(16)).toHaveLength(32);
      });
    });

    describe('generateShortId', () => {
      it('should generate short id of default length', () => {
        expect(generateShortId()).toHaveLength(8);
      });

      it('should generate short id of specified length', () => {
        expect(generateShortId(12)).toHaveLength(12);
      });

      it('should contain only alphanumeric characters', () => {
        expect(generateShortId(20)).toMatch(/^[A-Za-z0-9]+$/);
      });
    });

    describe('hashString', () => {
      it('should hash string with sha256', () => {
        const hash = hashString('hello');
        expect(hash).toHaveLength(64);
      });

      it('should hash with custom algorithm', () => {
        const hash = hashString('hello', 'md5');
        expect(hash).toHaveLength(32);
      });

      it('should produce consistent hashes', () => {
        expect(hashString('test')).toBe(hashString('test'));
      });
    });
  });

  describe('Object Utils', () => {
    describe('pick', () => {
      it('should pick specified keys', () => {
        const obj = { a: 1, b: 2, c: 3 };
        expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
      });

      it('should ignore non-existent keys', () => {
        const obj = { a: 1, b: 2 };
        expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 });
      });
    });

    describe('omit', () => {
      it('should omit specified keys', () => {
        const obj = { a: 1, b: 2, c: 3 };
        expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
      });
    });

    describe('deepClone', () => {
      it('should create deep copy', () => {
        const obj = { a: { b: { c: 1 } } };
        const clone = deepClone(obj);

        expect(clone).toEqual(obj);
        expect(clone).not.toBe(obj);
        expect(clone.a).not.toBe(obj.a);
      });
    });

    describe('isEmpty', () => {
      it('should return true for null', () => {
        expect(isEmpty(null)).toBe(true);
      });

      it('should return true for undefined', () => {
        expect(isEmpty(undefined)).toBe(true);
      });

      it('should return true for empty object', () => {
        expect(isEmpty({})).toBe(true);
      });

      it('should return false for non-empty object', () => {
        expect(isEmpty({ a: 1 })).toBe(false);
      });
    });

    describe('flatten', () => {
      it('should flatten nested objects', () => {
        const obj = { a: { b: { c: 1 } }, d: 2 };
        expect(flatten(obj)).toEqual({ 'a.b.c': 1, d: 2 });
      });

      it('should use custom separator', () => {
        const obj = { a: { b: 1 } };
        expect(flatten(obj, '', '_')).toEqual({ a_b: 1 });
      });

      it('should handle arrays as values', () => {
        const obj = { a: [1, 2, 3] };
        expect(flatten(obj)).toEqual({ a: [1, 2, 3] });
      });
    });
  });

  describe('Array Utils', () => {
    describe('chunk', () => {
      it('should split array into chunks', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      });

      it('should handle empty array', () => {
        expect(chunk([], 2)).toEqual([]);
      });
    });

    describe('groupBy', () => {
      it('should group by key', () => {
        const arr = [
          { type: 'a', value: 1 },
          { type: 'b', value: 2 },
          { type: 'a', value: 3 },
        ];
        const grouped = groupBy(arr, 'type');
        expect(grouped['a']).toHaveLength(2);
        expect(grouped['b']).toHaveLength(1);
      });
    });

    describe('unique', () => {
      it('should remove duplicates', () => {
        expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
      });
    });

    describe('uniqueBy', () => {
      it('should remove duplicates by key', () => {
        const arr = [
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
          { id: 1, name: 'c' },
        ];
        expect(uniqueBy(arr, 'id')).toHaveLength(2);
      });
    });

    describe('shuffle', () => {
      it('should return array of same length', () => {
        const arr = [1, 2, 3, 4, 5];
        expect(shuffle(arr)).toHaveLength(5);
      });

      it('should contain same elements', () => {
        const arr = [1, 2, 3, 4, 5];
        const shuffled = shuffle(arr);
        expect(shuffled.sort()).toEqual(arr.sort());
      });
    });

    describe('last', () => {
      it('should return last element', () => {
        expect(last([1, 2, 3])).toBe(3);
      });

      it('should return undefined for empty array', () => {
        expect(last([])).toBeUndefined();
      });
    });

    describe('first', () => {
      it('should return first element', () => {
        expect(first([1, 2, 3])).toBe(1);
      });

      it('should return undefined for empty array', () => {
        expect(first([])).toBeUndefined();
      });
    });
  });

  describe('Async Utils', () => {
    describe('sleep', () => {
      it('should return a promise', () => {
        const result = sleep(1);
        expect(result).toBeInstanceOf(Promise);
      });
    });

    describe('retry', () => {
      it('should succeed on first try', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        const result = await retry(fn, 3, 1);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should retry on failure and succeed', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');
        const result = await retry(fn, 3, 1, 1);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should throw after max attempts', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fail'));
        await expect(retry(fn, 2, 1, 1)).rejects.toThrow('fail');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should work with single attempt (no retries)', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        const result = await retry(fn, 1, 1);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should throw immediately with single attempt on failure', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fail'));
        await expect(retry(fn, 1, 1)).rejects.toThrow('fail');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should use default parameters', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        const result = await retry(fn);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should apply backoff multiplier on retries', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('fail1'))
          .mockRejectedValueOnce(new Error('fail2'))
          .mockResolvedValue('success');
        const result = await retry(fn, 4, 1, 2);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });

    describe('withTimeout', () => {
      it('should resolve before timeout', async () => {
        const promise = Promise.resolve('success');
        const result = await withTimeout(promise, 1000);
        expect(result).toBe('success');
      });

      it('should propagate rejections', async () => {
        const promise = Promise.reject(new Error('original error'));
        await expect(withTimeout(promise, 1000)).rejects.toThrow('original error');
      });

      it('should reject on timeout', async () => {
        jest.useFakeTimers();
        const promise = new Promise<string>(() => {});
        const timeoutPromise = withTimeout(promise, 100);
        
        jest.advanceTimersByTime(100);
        
        await expect(timeoutPromise).rejects.toThrow('timed out');
        jest.useRealTimers();
      });
    });

    describe('debounce', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should delay function execution', () => {
        const fn = jest.fn();
        const debounced = debounce(fn, 100);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        jest.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should reset delay on subsequent calls', () => {
        const fn = jest.fn();
        const debounced = debounce(fn, 100);

        debounced();
        jest.advanceTimersByTime(50);
        debounced();
        jest.advanceTimersByTime(50);
        expect(fn).not.toHaveBeenCalled();

        jest.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('throttle', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should execute immediately', () => {
        const fn = jest.fn();
        const throttled = throttle(fn, 100);

        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should throttle subsequent calls', () => {
        const fn = jest.fn();
        const throttled = throttle(fn, 100);

        throttled();
        throttled();
        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should allow call after throttle period', () => {
        const fn = jest.fn();
        const throttled = throttle(fn, 100);

        throttled();
        expect(fn).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(100);
        throttled();
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Number Utils', () => {
    describe('clamp', () => {
      it('should clamp value between min and max', () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
      });
    });

    describe('randomInt', () => {
      it('should generate random integer in range', () => {
        for (let i = 0; i < 100; i++) {
          const result = randomInt(1, 10);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(10);
        }
      });
    });

    describe('formatNumber', () => {
      it('should format number with locale', () => {
        expect(formatNumber(1000000)).toBe('1,000,000');
      });
    });

    describe('formatBytes', () => {
      it('should return 0 Bytes for 0', () => {
        expect(formatBytes(0)).toBe('0 Bytes');
      });

      it('should format bytes', () => {
        expect(formatBytes(1024)).toBe('1 KB');
      });

      it('should format megabytes', () => {
        expect(formatBytes(1048576)).toBe('1 MB');
      });

      it('should respect decimal places', () => {
        expect(formatBytes(1536, 1)).toBe('1.5 KB');
      });
    });
  });

  describe('URL Utils', () => {
    describe('buildQueryString', () => {
      it('should build query string', () => {
        expect(buildQueryString({ a: 1, b: 'test' })).toBe('a=1&b=test');
      });

      it('should filter out empty values', () => {
        expect(buildQueryString({ a: 1, b: '', c: null, d: undefined })).toBe('a=1');
      });

      it('should encode special characters', () => {
        expect(buildQueryString({ q: 'hello world' })).toBe('q=hello%20world');
      });
    });

    describe('parseQueryString', () => {
      it('should parse query string', () => {
        expect(parseQueryString('a=1&b=test')).toEqual({ a: '1', b: 'test' });
      });

      it('should handle URL-encoded values', () => {
        expect(parseQueryString('q=hello%20world')).toEqual({ q: 'hello world' });
      });
    });

    describe('joinUrl', () => {
      it('should join URL parts', () => {
        expect(joinUrl('https://api.com', 'v1', 'users')).toBe('https://api.com/v1/users');
      });

      it('should handle trailing slashes', () => {
        expect(joinUrl('https://api.com/', '/v1/', '/users/')).toBe(
          'https://api.com/v1/users'
        );
      });

      it('should filter empty parts', () => {
        expect(joinUrl('https://api.com', '', 'users')).toBe('https://api.com/users');
      });
    });
  });

  describe('Type Guards', () => {
    describe('isDefined', () => {
      it('should return true for defined values', () => {
        expect(isDefined('test')).toBe(true);
        expect(isDefined(0)).toBe(true);
        expect(isDefined(false)).toBe(true);
      });

      it('should return false for null/undefined', () => {
        expect(isDefined(null)).toBe(false);
        expect(isDefined(undefined)).toBe(false);
      });
    });

    describe('isString', () => {
      it('should return true for strings', () => {
        expect(isString('test')).toBe(true);
        expect(isString('')).toBe(true);
      });

      it('should return false for non-strings', () => {
        expect(isString(123)).toBe(false);
        expect(isString(null)).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should return true for numbers', () => {
        expect(isNumber(123)).toBe(true);
        expect(isNumber(0)).toBe(true);
        expect(isNumber(-5.5)).toBe(true);
      });

      it('should return false for NaN', () => {
        expect(isNumber(NaN)).toBe(false);
      });

      it('should return false for non-numbers', () => {
        expect(isNumber('123')).toBe(false);
      });
    });

    describe('isValidDate', () => {
      it('should return true for valid dates', () => {
        expect(isValidDate(new Date())).toBe(true);
      });

      it('should return false for invalid dates', () => {
        expect(isValidDate(new Date('invalid'))).toBe(false);
      });

      it('should return false for non-dates', () => {
        expect(isValidDate('2024-01-01')).toBe(false);
      });
    });

    describe('isPlainObject', () => {
      it('should return true for plain objects', () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject({ a: 1 })).toBe(true);
      });

      it('should return false for arrays', () => {
        expect(isPlainObject([])).toBe(false);
      });

      it('should return false for null', () => {
        expect(isPlainObject(null)).toBe(false);
      });

      it('should return false for primitives', () => {
        expect(isPlainObject('string')).toBe(false);
        expect(isPlainObject(123)).toBe(false);
      });
    });
  });
});
