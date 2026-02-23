require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.S3_BUCKET_NAME;
const testKey = 'test/connection-test.txt';

async function runTest() {
  console.log('Bucket:', bucket);
  console.log('Region:', process.env.AWS_REGION);
  console.log('');

  // 1. Test PutObject (upload)
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from('VIP CRM S3 connection test'),
      ContentType: 'text/plain',
    }));
    console.log('✓ PutObject (upload) - OK');
  } catch (err) {
    console.error('✗ PutObject (upload) - FAILED:', err.$metadata && err.$metadata.httpStatusCode, err.message);
    return;
  }

  // 2. Test GetSignedUrl
  try {
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: testKey }), { expiresIn: 3600 });
    console.log('✓ GetSignedUrl - OK');
  } catch (err) {
    console.error('✗ GetSignedUrl - FAILED:', err.message);
  }

  // 3. Test DeleteObject (cleanup)
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log('✓ DeleteObject - OK');
  } catch (err) {
    console.error('✗ DeleteObject - FAILED:', err.$metadata && err.$metadata.httpStatusCode, err.message);
  }

  console.log('\nAll tests passed — S3 is ready to use!');
}

runTest();
