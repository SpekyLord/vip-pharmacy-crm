const vision = require('@google-cloud/vision');

const DEFAULT_FEATURE =
  process.env.GOOGLE_VISION_DEFAULT_FEATURE || 'DOCUMENT_TEXT_DETECTION';

let visionClient;

function parseInlineCredentials() {
  const raw = String(process.env.GOOGLE_VISION_KEY_JSON || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      'GOOGLE_VISION_KEY_JSON is not valid JSON. Use a single-line escaped JSON string.'
    );
  }
}

function createVisionClient() {
  const projectId = String(process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim() || undefined;
  const keyFilename =
    String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim() || undefined;
  const credentials = parseInlineCredentials();

  const options = {};
  if (projectId) options.projectId = projectId;
  if (keyFilename) options.keyFilename = keyFilename;
  if (credentials) options.credentials = credentials;

  return new vision.ImageAnnotatorClient(options);
}

function getVisionClient() {
  if (!visionClient) {
    visionClient = createVisionClient();
  }
  return visionClient;
}

function normalizeVertices(vertices = []) {
  return vertices.map((vertex) => ({
    x: Number(vertex.x || 0),
    y: Number(vertex.y || 0),
  }));
}

function extractWords(fullTextAnnotation) {
  const words = [];
  const pages = fullTextAnnotation?.pages || [];

  pages.forEach((page, pageIndex) => {
    (page.blocks || []).forEach((block, blockIndex) => {
      (block.paragraphs || []).forEach((paragraph, paragraphIndex) => {
        (paragraph.words || []).forEach((word, wordIndex) => {
          const symbols = word.symbols || [];
          const text = symbols.map((symbol) => symbol.text || '').join('');

          words.push({
            text,
            confidence:
              typeof word.confidence === 'number' ? word.confidence : null,
            boundingBox: normalizeVertices(word.boundingBox?.vertices),
            page: pageIndex + 1,
            block: blockIndex + 1,
            paragraph: paragraphIndex + 1,
            word: wordIndex + 1,
          });
        });
      });
    });
  });

  return words;
}

function buildOcrResult(response, featureUsed) {
  const fullText = response.fullTextAnnotation?.text ||
    response.textAnnotations?.[0]?.description ||
    '';

  return {
    featureUsed,
    fullText,
    words: extractWords(response.fullTextAnnotation),
    textAnnotations: response.textAnnotations || [],
    fullTextAnnotation: response.fullTextAnnotation || null,
    raw: response,
  };
}

async function detectText(imageBuffer, options = {}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('detectText requires a non-empty image buffer.');
  }

  const featureUsed = options.feature || DEFAULT_FEATURE;
  const client = getVisionClient();

  const [result] = await client.annotateImage({
    image: { content: imageBuffer },
    features: [{ type: featureUsed }],
  });

  if (result.error?.message) {
    throw new Error(`Google Vision API error: ${result.error.message}`);
  }

  return buildOcrResult(result, featureUsed);
}

module.exports = {
  DEFAULT_FEATURE,
  detectText,
  getVisionClient,
};
