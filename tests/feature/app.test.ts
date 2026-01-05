import express, { Application } from 'express';
import request from 'supertest';

describe('Express App Integration', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
  });

  describe('JSON Body Parsing', () => {
    it('should parse JSON body correctly', async () => {
      app.post('/test', (req, res) => {
        res.json({ received: req.body });
      });

      const payload = { name: 'John', age: 30 };
      const response = await request(app)
        .post('/test')
        .send(payload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.received).toEqual(payload);
    });

    it('should handle empty body', async () => {
      app.post('/test', (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(app).post('/test').set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.received).toEqual({});
    });
  });

  describe('URL Encoded Body Parsing', () => {
    it('should parse URL encoded body', async () => {
      app.post('/test', (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(app)
        .post('/test')
        .send('name=John&age=30')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      expect(response.status).toBe(200);
      expect(response.body.received.name).toBe('John');
      expect(response.body.received.age).toBe('30');
    });
  });

  describe('HTTP Methods', () => {
    it('should handle GET requests', async () => {
      app.get('/test', (_req, res) => {
        res.json({ method: 'GET' });
      });

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.body.method).toBe('GET');
    });

    it('should handle POST requests', async () => {
      app.post('/test', (_req, res) => {
        res.json({ method: 'POST' });
      });

      const response = await request(app).post('/test');

      expect(response.status).toBe(200);
      expect(response.body.method).toBe('POST');
    });

    it('should handle PUT requests', async () => {
      app.put('/test', (_req, res) => {
        res.json({ method: 'PUT' });
      });

      const response = await request(app).put('/test');

      expect(response.status).toBe(200);
      expect(response.body.method).toBe('PUT');
    });

    it('should handle DELETE requests', async () => {
      app.delete('/test', (_req, res) => {
        res.json({ method: 'DELETE' });
      });

      const response = await request(app).delete('/test');

      expect(response.status).toBe(200);
      expect(response.body.method).toBe('DELETE');
    });

    it('should handle PATCH requests', async () => {
      app.patch('/test', (_req, res) => {
        res.json({ method: 'PATCH' });
      });

      const response = await request(app).patch('/test');

      expect(response.status).toBe(200);
      expect(response.body.method).toBe('PATCH');
    });
  });

  describe('Query Parameters', () => {
    it('should parse query parameters', async () => {
      app.get('/test', (req, res) => {
        res.json({ query: req.query });
      });

      const response = await request(app).get('/test?page=1&limit=20');

      expect(response.status).toBe(200);
      expect(response.body.query.page).toBe('1');
      expect(response.body.query.limit).toBe('20');
    });
  });

  describe('Route Parameters', () => {
    it('should parse route parameters', async () => {
      app.get('/users/:id', (req, res) => {
        res.json({ userId: req.params.id });
      });

      const response = await request(app).get('/users/123');

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('123');
    });
  });

  describe('Response Status Codes', () => {
    it('should return 201 for created resources', async () => {
      app.post('/users', (_req, res) => {
        res.status(201).json({ created: true });
      });

      const response = await request(app).post('/users');

      expect(response.status).toBe(201);
    });

    it('should return 204 for no content', async () => {
      app.delete('/users/:id', (_req, res) => {
        res.status(204).send();
      });

      const response = await request(app).delete('/users/123');

      expect(response.status).toBe(204);
    });
  });
});
