/**
 * OpenRouter Document Extraction Service
 *
 * Uses Qwen VL vision model (qwen/qwen3.5-flash) via OpenRouter to extract
 * structured freight data from PDFs, images, Excel files, and Word documents.
 *
 * PDF extraction pipeline:
 *   1. pdf2pic converts each PDF page to a PNG buffer
 *   2. PNG is base64-encoded and sent to Qwen VL via OpenRouter chat API
 *   3. Qwen VL returns structured JSON with freight fields
 *
 * @created 2026-02-26
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';

// pdf2pic uses a fromBuffer factory
const { fromBuffer } = require('pdf2pic');
const XLSX = require('xlsx');

const VISION_MODEL = 'qwen/qwen3.5-flash';

/** Freight fields extracted from shipping documents */
export interface FreightDocumentFields {
  shipper?: string;
  consignee?: string;
  notifyParty?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  commodity?: string;
  hsCodes?: string[];
  packageType?: string;
  quantity?: number;
  grossWeight?: number | string;
  netWeight?: number | string;
  volume?: number | string;
  containerNumbers?: string[];
  blNumber?: string;
  invoiceNumber?: string;
  invoiceAmount?: number | string;
  currency?: string;
  incoterms?: string;
  // Catch-all for any other fields
  [key: string]: any;
}

export interface ExtractionResult {
  documentId: string;
  documentType: string;
  fields: FreightDocumentFields;
  confidence: number;
  rawText?: string;
  pageCount?: number;
  extractedAt: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert freight document parser.
Extract ALL available freight information from the provided document image.
Return ONLY a valid JSON object with these fields (omit fields that are not present):
{
  "shipper": "company name",
  "consignee": "company name",
  "notifyParty": "company name",
  "portOfLoading": "port name and country",
  "portOfDischarge": "port name and country",
  "commodity": "description of goods",
  "hsCodes": ["8471.30", "..."],
  "packageType": "cartons/pallets/drums/etc",
  "quantity": 100,
  "grossWeight": "2500 KGS",
  "netWeight": "2300 KGS",
  "volume": "15 CBM",
  "containerNumbers": ["MSCU1234567"],
  "blNumber": "MSCUABCD123456",
  "invoiceNumber": "INV-2026-001",
  "invoiceAmount": 15000,
  "currency": "USD",
  "incoterms": "FOB"
}
Do NOT include markdown, explanations, or any text outside the JSON.`;

class OpenRouterDocumentService {
  private client: AxiosInstance;
  private isConfigured: boolean;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY || '';
    this.isConfigured = !!apiKey;

    this.client = axios.create({
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://banxway.com',
        'X-Title': 'Banxway Document Extraction',
        'Content-Type': 'application/json',
      },
      timeout: 120000, // Vision extraction can be slow
    });
  }

  /**
   * Call Qwen VL with a base64 image and return extracted freight fields
   */
  private async extractFromImageBase64(
    imageBase64: string,
    mimeType: 'image/png' | 'image/jpeg' = 'image/png',
  ): Promise<{ fields: FreightDocumentFields; rawText: string }> {
    const response = await this.client.post('/chat/completions', {
      model: VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: 'Extract all freight document information from this image. Return JSON only.',
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const rawText: string = response.data.choices[0]?.message?.content || '{}';

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let fields: FreightDocumentFields = {};
    try {
      fields = JSON.parse(cleaned);
    } catch {
      logger.warn('Qwen VL returned non-JSON response', { preview: rawText.substring(0, 200) });
    }

    return { fields, rawText };
  }

  /**
   * Extract structured data from a PDF buffer using Qwen VL vision
   */
  async extractFromPDF(buffer: Buffer, documentId: string): Promise<ExtractionResult> {
    if (!this.isConfigured) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    logger.info('Extracting from PDF using Qwen VL', { documentId });

    // Convert PDF pages to PNG images
    const convert = fromBuffer(buffer, {
      density: 150,     // DPI — higher = better OCR, slower
      saveFilename: `doc-${documentId}`,
      savePath: '/tmp',
      format: 'png',
      width: 1200,
      height: 1600,
    });

    // Convert first 3 pages max (most freight docs fit on 1–3 pages)
    const pageLimit = 3;
    const allFields: FreightDocumentFields[] = [];
    const rawTexts: string[] = [];

    for (let page = 1; page <= pageLimit; page++) {
      let pageResult: { base64: string } | null = null;
      try {
        pageResult = await convert(page, { responseType: 'base64' });
      } catch {
        // No more pages
        break;
      }

      if (!pageResult?.base64) break;

      try {
        const { fields, rawText } = await this.extractFromImageBase64(pageResult.base64);
        allFields.push(fields);
        rawTexts.push(rawText);
        logger.debug('PDF page extracted', { documentId, page, fieldCount: Object.keys(fields).length });
      } catch (error) {
        logger.warn('Failed to extract page from PDF', {
          documentId,
          page,
          error: (error as Error).message,
        });
      }
    }

    // Merge fields from all pages — first non-null value wins
    const merged: FreightDocumentFields = {};
    for (const pageFields of allFields) {
      for (const [key, value] of Object.entries(pageFields)) {
        if (value !== null && value !== undefined && merged[key] === undefined) {
          merged[key] = value;
        }
        // Merge arrays (e.g. hsCodes, containerNumbers)
        if (Array.isArray(value) && Array.isArray(merged[key])) {
          const existing = merged[key] as unknown[];
          const combined = [...new Set([...existing, ...value])];
          merged[key] = combined as any;
        }
      }
    }

    const confidence = this.computeConfidence(merged);

    return {
      documentId,
      documentType: 'pdf',
      fields: merged,
      confidence,
      rawText: rawTexts.join('\n---PAGE BREAK---\n'),
      pageCount: allFields.length,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract from a standalone image (PNG/JPEG) using Qwen VL vision
   */
  async extractFromImage(imageBase64: string, documentId: string): Promise<ExtractionResult> {
    if (!this.isConfigured) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    logger.info('Extracting from image using Qwen VL', { documentId });

    const { fields, rawText } = await this.extractFromImageBase64(imageBase64);
    const confidence = this.computeConfidence(fields);

    return {
      documentId,
      documentType: 'image',
      fields,
      confidence,
      rawText,
      pageCount: 1,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract from Excel using xlsx library (no vision needed)
   */
  async extractFromExcel(buffer: Buffer, documentId: string): Promise<ExtractionResult> {
    logger.info('Extracting from Excel', { documentId });

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Flatten to string for Qwen VL text-based extraction
    const tableText = rows
      .filter((row: any[]) => row.some(cell => cell !== ''))
      .map((row: any[]) => row.join('\t'))
      .join('\n');

    // Use text completion (not vision) for Excel
    const fields = await this.extractFromText(tableText, documentId);

    return {
      documentId,
      documentType: 'excel',
      fields,
      confidence: this.computeConfidence(fields),
      rawText: tableText,
      pageCount: workbook.SheetNames.length,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract from Word document using basic text extraction
   */
  async extractFromWord(buffer: Buffer, documentId: string): Promise<ExtractionResult> {
    logger.info('Extracting from Word document', { documentId });

    // Extract raw text from DOCX (basic approach — works for most freight docs)
    const text = buffer.toString('utf8')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s{3,}/g, '\n')
      .trim();

    const fields = await this.extractFromText(text, documentId);

    return {
      documentId,
      documentType: 'word',
      fields,
      confidence: this.computeConfidence(fields),
      rawText: text,
      pageCount: 1,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Use Qwen (text mode) to extract structured fields from plain text
   */
  private async extractFromText(text: string, documentId: string): Promise<FreightDocumentFields> {
    if (!this.isConfigured) return {};

    try {
      const response = await this.client.post('/chat/completions', {
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Extract freight document fields from this text:\n\n${text.substring(0, 8000)}\n\nReturn JSON only.`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      });

      const raw: string = response.data.choices[0]?.message?.content || '{}';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      logger.warn('Text extraction via Qwen failed', {
        documentId,
        error: (error as Error).message,
      });
      return {};
    }
  }

  /**
   * Compute extraction confidence based on how many key freight fields were found
   */
  private computeConfidence(fields: FreightDocumentFields): number {
    const keyFields = [
      'shipper', 'consignee', 'portOfLoading', 'portOfDischarge',
      'commodity', 'grossWeight', 'blNumber',
    ];
    const found = keyFields.filter(f => !!fields[f]).length;
    return parseFloat((found / keyFields.length).toFixed(2));
  }
}

export const openRouterDocumentService = new OpenRouterDocumentService();
export default openRouterDocumentService;
