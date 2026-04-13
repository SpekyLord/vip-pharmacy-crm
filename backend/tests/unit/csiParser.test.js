jest.mock('../../erp/ocr/visionClient', () => ({
  detectText: jest.fn(),
}));

const sharp = require('sharp');
const { detectText } = require('../../erp/ocr/visionClient');
const { parseCSI } = require('../../erp/ocr/parsers/csiParser');
const fixtures = require('../fixtures/csiGoldens');

function makeWord(text, cx, cy, width = 0.04, height = 0.02) {
  return {
    text,
    confidence: 0.99,
    boundingBox: [
      { x: cx - width / 2, y: cy - height / 2 },
      { x: cx + width / 2, y: cy - height / 2 },
      { x: cx + width / 2, y: cy + height / 2 },
      { x: cx - width / 2, y: cy + height / 2 },
    ],
  };
}

function makeWordsFromTokens(tokens, startX, cy, step = 0.07, height = 0.02) {
  return tokens.map((token, index) => {
    const width = Math.max(0.03, Math.min(0.14, token.length * 0.012));
    return makeWord(token, startX + (index * step), cy, width, height);
  });
}

async function makeSolidImageBuffer(background) {
  return sharp({
    create: {
      width: 1200,
      height: 1800,
      channels: 3,
      background,
    }
  }).png().toBuffer();
}

describe('CSI parser', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    detectText.mockReset();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('extracts MG handwritten invoice no/date from spatial words and keeps price/amount aligned', async () => {
    const fullText = [
      'CHARGE SALES INVOICE',
      'MG AND CO.',
      'Charged to Antique Medical Center',
      'Address',
      'San Jose, Antique',
      'No.',
      'Date',
      'Qty',
      'Unit',
      'ARTICLES',
      'U/P',
      'Amount',
      '50',
      'vials Cefazovit (Cefazolin Sodium) 4g',
      'Batch #C240112',
      '540',
      '27,000.00',
      'Exp: 17/06/2027',
      'vials Onitaz (Piperacilin + Tazobactam) 1.5g',
      'Batch #: MOT 24003',
      '720',
      '36,000.00',
      'Exp: 11/2027',
      'Total Sales (VAT Inclusive)',
      '63,000.00',
      'Less VAT',
      '6,750.00',
      'Amount Net of VAT',
      '56,250.00',
      'TOTAL AMOUNT DUE',
      '63,000.00',
    ].join('\n');

    const words = [
      makeWord('No.', 0.75, 0.18, 0.035, 0.02),
      makeWord('422', 0.83, 0.18, 0.05, 0.02),
      makeWord('Date', 0.70, 0.23, 0.05, 0.02),
      makeWord('March', 0.79, 0.23, 0.08, 0.02),
      makeWord('31', 0.87, 0.23, 0.035, 0.02),
      makeWord('2026', 0.93, 0.23, 0.06, 0.02),
    ];

    const result = await parseCSI({ fullText, words });

    expect(result.layout_family).toBe('MG_HANDWRITTEN');
    expect(result.invoice_no.value).toBe('422');
    expect(result.date.value).toBe('March 31 2026');
    expect(result.hospital.value).toBe('Antique Medical Center');
    expect(result.review_required).toBe(false);

    expect(result.line_items).toHaveLength(2);
    expect(result.line_items[0].brand_name.value).toBe('Cefazovit');
    expect(result.line_items[0].qty.value).toBe(50);
    expect(result.line_items[0].unit_price.value).toBe(540);
    expect(result.line_items[0].amount.value).toBe(27000);

    expect(result.line_items[1].brand_name.value).toBe('Onitaz');
    expect(result.line_items[1].qty.value).toBe(50);
    expect(result.line_items[1].unit_price.value).toBe(720);
    expect(result.line_items[1].amount.value).toBe(36000);
  });

  test('prefers number nearest the No. label over date-year fragments', async () => {
    const fullText = [
      'CHARGE SALES INVOICE',
      'MG AND CO.',
      'Charged to Antique Medical Center',
      'No.',
      'Date March 31 026',
      'Qty',
      'ARTICLES',
      '50',
      'vials Cefazovit (Cefazolin Sodium) 4g',
      'Batch #C240112',
      '540',
      '27,000.00',
      'Total Sales (VAT Inclusive)',
      '27,000.00',
      'TOTAL AMOUNT DUE',
      '27,000.00',
    ].join('\n');

    const words = [
      makeWord('No.', 0.76, 0.18, 0.035, 0.02),
      makeWord('422', 0.84, 0.215, 0.05, 0.02),
      makeWord('Date', 0.70, 0.23, 0.05, 0.02),
      makeWord('March', 0.79, 0.23, 0.08, 0.02),
      makeWord('31', 0.87, 0.23, 0.035, 0.02),
      makeWord('026', 0.93, 0.23, 0.05, 0.02),
    ];

    const result = await parseCSI({ fullText, words });

    expect(result.layout_family).toBe('MG_HANDWRITTEN');
    expect(result.invoice_no.value).toBe('422');
    expect(result.date.value).toBe('March 31 2026');
  });

  test('uses header crop OCR when the main OCR only sees the date-year fragment', async () => {
    const fullText = [
      'CHARGE SALES INVOICE',
      'MG AND CO.',
      'Charged to Antique Medical Center',
      'No.',
      'Date March 31 026',
      'Qty',
      'ARTICLES',
      '50',
      'vials Cefazovit (Cefazolin Sodium) 4g',
      'Batch #C240112',
      '540',
      '27,000.00',
      'Total Sales (VAT Inclusive)',
      '27,000.00',
      'TOTAL AMOUNT DUE',
      '27,000.00',
    ].join('\n');

    const words = [
      makeWord('No.', 0.76, 0.18, 0.035, 0.02),
      makeWord('Date', 0.70, 0.23, 0.05, 0.02),
      makeWord('March', 0.79, 0.23, 0.08, 0.02),
      makeWord('31', 0.87, 0.23, 0.035, 0.02),
      makeWord('026', 0.93, 0.23, 0.05, 0.02),
    ];

    const imageBuffer = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      }
    }).png().toBuffer();

    detectText
      .mockResolvedValueOnce({
        fullText: 'No. 422\nDate March 31 2026',
        words: [],
        fullTextAnnotation: null,
      })
      .mockResolvedValueOnce({
        fullText: '422',
        words: [],
        fullTextAnnotation: null,
      })
      .mockResolvedValueOnce({
        fullText: 'March 31 2026',
        words: [],
        fullTextAnnotation: null,
      })
      .mockResolvedValueOnce({
        fullText: 'Charged to Antique Medical Center',
        words: [],
        fullTextAnnotation: null,
      });

    const result = await parseCSI({ fullText, words }, { imageBuffer });

    expect(detectText).toHaveBeenCalledTimes(4);
    expect(result.layout_family).toBe('MG_HANDWRITTEN');
    expect(result.invoice_no.value).toBe('422');
    expect(result.date.value).toBe('March 31 2026');
    expect(result.invoice_no.source).toMatch(/HEADER_CROP/);
  });

  test('prefers focused invoice-value crop over noisy header crop result', async () => {
    const fullText = [
      'CHARGE SALES INVOICE',
      'MG AND CO.',
      'Charged to Antique Medical Center',
      'No.',
      'Date March 31 026',
      'Qty',
      'ARTICLES',
      '50',
      'vials Cefazovit (Cefazolin Sodium) 4g',
      'Batch #C240112',
      '540',
      '27,000.00',
      'Total Sales (VAT Inclusive)',
      '27,000.00',
      'TOTAL AMOUNT DUE',
      '27,000.00',
    ].join('\n');

    const words = [
      makeWord('No.', 0.76, 0.18, 0.035, 0.02),
      makeWord('Date', 0.70, 0.23, 0.05, 0.02),
      makeWord('March', 0.79, 0.23, 0.08, 0.02),
      makeWord('31', 0.87, 0.23, 0.035, 0.02),
      makeWord('026', 0.93, 0.23, 0.05, 0.02),
    ];

    const imageBuffer = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      }
    }).png().toBuffer();

    detectText
      .mockResolvedValueOnce({
        fullText: 'No.\n4320\nDate March 31 12260',
        words: [],
        fullTextAnnotation: null,
      })
      .mockResolvedValueOnce({
        fullText: '422',
        words: [],
        fullTextAnnotation: null,
      })
      .mockResolvedValueOnce({
        fullText: 'March 31 2026',
        words: [],
        fullTextAnnotation: null,
      })
      .mockResolvedValueOnce({
        fullText: 'Charged to Antique Medical Center',
        words: [],
        fullTextAnnotation: null,
      });

    const result = await parseCSI({ fullText, words }, { imageBuffer });

    expect(result.layout_family).toBe('MG_HANDWRITTEN');
    expect(result.invoice_no.value).toBe('422');
    expect(detectText).toHaveBeenCalledTimes(4);
  });

  test('classifies VIP white invoices and keeps single-item batch rows aligned', async () => {
    const fixture = fixtures.vipWhite;

    const result = await parseCSI({ fullText: fixture.fullText, words: [] });

    expect(result.layout_family).toBe(fixture.layout_family);
    expect(result.invoice_no.value).toBe(fixture.expected.invoice_no);
    expect(result.date.value).toBe(fixture.expected.date);
    expect(result.hospital.value).toBe(fixture.expected.hospital);
    expect(result.line_items).toHaveLength(1);
    expect(result.line_items[0].brand_name.value).toBe('Norprex');
    expect(result.line_items[0].qty.value).toBe(30);
    expect(result.line_items[0].unit_price.value).toBe(400);
    expect(result.line_items[0].amount.value).toBe(12000);
    expect(result.review_required).toBe(false);
  });

  test('classifies VIP yellow forms using paper tone and parses spatial table rows', async () => {
    const fixture = fixtures.vipYellow;
    const imageBuffer = await makeSolidImageBuffer({ r: 228, g: 212, b: 138 });
    const words = [
      ...makeWordsFromTokens(['Item', 'Description', '/', 'Nature', 'of', 'Service'], 0.27, 0.27, 0.06),
      ...makeWordsFromTokens(['Quantity'], 0.63, 0.27, 0.06),
      ...makeWordsFromTokens(['Unit', 'Cost', '/', 'Price'], 0.76, 0.27, 0.05),
      ...makeWordsFromTokens(['Amount'], 0.91, 0.27, 0.05),
      ...makeWordsFromTokens(['FOLEY', 'CATH', '2-WAY'], 0.15, 0.34, 0.07),
      ...makeWordsFromTokens(['50'], 0.64, 0.34, 0.05),
      ...makeWordsFromTokens(['55'], 0.77, 0.34, 0.05),
      ...makeWordsFromTokens(['2,750.00'], 0.90, 0.34, 0.05),
      ...makeWordsFromTokens(['BATCH', '#', ':', '2505011308'], 0.17, 0.38, 0.06),
      ...makeWordsFromTokens(['EXP', 'DATE', ':', '04/2030'], 0.17, 0.42, 0.06),
    ];

    const result = await parseCSI({ fullText: fixture.fullText, words }, { imageBuffer });

    expect(result.layout_family).toBe(fixture.layout_family);
    expect(result.invoice_no.value).toBe(fixture.expected.invoice_no);
    expect(result.hospital.value).toBe(fixture.expected.hospital);
    expect(result.line_items).toHaveLength(1);
    expect(result.line_items[0].brand_name.value).toBe('FOLEY CATH 2-WAY');
    expect(result.line_items[0].qty.value).toBe(50);
    expect(result.line_items[0].unit_price.value).toBe(55);
    expect(result.line_items[0].amount.value).toBe(2750);
    expect(result.line_items[0].batch_lot_no.value).toBe('2505011308');
    expect(result.review_required).toBe(false);
  });

  test('parses third-party generic CSI rows with spatial columns and keeps review off when totals reconcile', async () => {
    const fixture = fixtures.broncoGeneric;
    const imageBuffer = await makeSolidImageBuffer({ r: 240, g: 240, b: 240 });
    const words = [
      ...makeWordsFromTokens(['Qty.'], 0.08, 0.34, 0.05),
      ...makeWordsFromTokens(['Unit'], 0.17, 0.34, 0.05),
      ...makeWordsFromTokens(['ARTICLES'], 0.34, 0.34, 0.06),
      ...makeWordsFromTokens(['Unit', 'Price'], 0.74, 0.34, 0.05),
      ...makeWordsFromTokens(['Amount'], 0.90, 0.34, 0.05),
      ...makeWordsFromTokens(['1'], 0.08, 0.40, 0.04),
      ...makeWordsFromTokens(['10lbs'], 0.17, 0.40, 0.05),
      ...makeWordsFromTokens(['Dry', 'Chemical', 'Fire', 'Extinguisher'], 0.30, 0.40, 0.07),
      ...makeWordsFromTokens(['1,140'], 0.76, 0.40, 0.05),
      ...makeWordsFromTokens(['1,140'], 0.90, 0.40, 0.05),
    ];

    const result = await parseCSI({ fullText: fixture.fullText, words }, { imageBuffer });

    expect(result.layout_family).toBe(fixture.layout_family);
    expect(result.invoice_no.value).toBe(fixture.expected.invoice_no);
    expect(result.date.value).toBe(fixture.expected.date);
    expect(result.hospital.value).toBe(fixture.expected.hospital);
    expect(result.line_items).toHaveLength(1);
    expect(result.line_items[0].brand_name.value).toBe('Dry Chemical Fire Extinguisher');
    expect(result.line_items[0].qty.value).toBe(1);
    expect(result.line_items[0].unit_price.value).toBe(1140);
    expect(result.line_items[0].amount.value).toBe(1140);
    expect(result.review_required).toBe(false);
  });
});
