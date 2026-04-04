const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vip-crm-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a'.repeat(64);
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'b'.repeat(64);
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.ENABLE_SCHEDULER = 'false';
process.env.HEALTH_EXPOSE_DETAILS = 'false';

const { createApp, isSchedulerEnabled } = require('../../server');

describe('API smoke tests', () => {
  const app = createApp();

  test('liveness endpoint is healthy and returns request id', async () => {
    const response = await request(app).get('/api/health/live');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('live');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  test('login validation catches malformed request', async () => {
    const response = await request(app).post('/api/auth/login').send({});
    expect(response.statusCode).toBe(400);
  });

  test('refresh endpoint requires token', async () => {
    const response = await request(app).post('/api/auth/refresh-token').send({});
    expect(response.statusCode).toBe(401);
  });

  test('protected route rejects unauthenticated request', async () => {
    const response = await request(app).get('/api/users/profile');
    expect(response.statusCode).toBe(401);
  });

  test('file upload path is protected', async () => {
    const response = await request(app)
      .post('/api/imports/upload')
      .attach('file', Buffer.from('dummy'), 'dummy.xlsx');
    expect(response.statusCode).toBe(401);
  });

  test('scheduler flag is disabled in API smoke context', () => {
    expect(isSchedulerEnabled()).toBe(false);
  });
});

