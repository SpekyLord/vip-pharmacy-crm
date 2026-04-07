const express = require('express');
const request = require('supertest');
const {
  uploadSingle,
  handleUploadError,
  MAX_FILE_SIZE,
} = require('../../middleware/upload');

describe('upload middleware', () => {
  test('rejects files larger than MAX_FILE_SIZE', async () => {
    const app = express();

    app.post(
      '/upload',
      uploadSingle('file'),
      (req, res) => res.json({ success: true }),
      handleUploadError
    );

    const oversized = Buffer.alloc(MAX_FILE_SIZE + 1, 'a');
    const response = await request(app)
      .post('/upload')
      .attach('file', oversized, {
        filename: 'oversized.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/File too large/i);
  });
});

