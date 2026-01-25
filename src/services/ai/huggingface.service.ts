/**
 * Hugging Face AI Service
 *
 * Direct access to Hugging Face models for specific use cases
 */

import { HfInference } from '@huggingface/inference';

export class HuggingFaceService {
  private hf: HfInference;

  constructor() {
    const apiKey = process.env.HUGGINGFACE_API_KEY || '';
    this.hf = new HfInference(apiKey);
  }

  /**
   * Text generation
   */
  async textGeneration(
    prompt: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<string> {
    try {
      const result = await this.hf.textGeneration({
        model: options?.model || 'mistralai/Mistral-7B-Instruct-v0.2',
        inputs: prompt,
        parameters: {
          max_new_tokens: options?.maxTokens || 512,
          temperature: options?.temperature || 0.7,
          return_full_text: false,
        },
      });

      return result.generated_text;
    } catch (error: any) {
      console.error('Hugging Face API error:', error.message);
      throw new Error(`Hugging Face API error: ${error.message}`);
    }
  }

  /**
   * Text classification (sentiment, intent, etc.)
   */
  async classify(
    text: string,
    options?: {
      model?: string;
    }
  ): Promise<Array<{ label: string; score: number }>> {
    try {
      const result = await this.hf.textClassification({
        model: options?.model || 'distilbert-base-uncased-finetuned-sst-2-english',
        inputs: text,
      });

      return result;
    } catch (error: any) {
      console.error('Hugging Face classification error:', error.message);
      throw new Error(`Classification error: ${error.message}`);
    }
  }

  /**
   * Named Entity Recognition
   */
  async extractEntities(
    text: string,
    options?: {
      model?: string;
    }
  ): Promise<Array<{ entity_group: string; word: string; score: number }>> {
    try {
      const result = await this.hf.tokenClassification({
        model: options?.model || 'dslim/bert-base-NER',
        inputs: text,
      });

      return result;
    } catch (error: any) {
      console.error('Hugging Face NER error:', error.message);
      throw new Error(`NER error: ${error.message}`);
    }
  }

  /**
   * Question Answering
   */
  async answerQuestion(
    question: string,
    context: string,
    options?: {
      model?: string;
    }
  ): Promise<{ answer: string; score: number }> {
    try {
      const result = await this.hf.questionAnswering({
        model: options?.model || 'deepset/roberta-base-squad2',
        inputs: {
          question,
          context,
        },
      });

      return result;
    } catch (error: any) {
      console.error('Hugging Face QA error:', error.message);
      throw new Error(`QA error: ${error.message}`);
    }
  }

  /**
   * Summarization
   */
  async summarize(
    text: string,
    options?: {
      model?: string;
      maxLength?: number;
      minLength?: number;
    }
  ): Promise<string> {
    try {
      const result = await this.hf.summarization({
        model: options?.model || 'facebook/bart-large-cnn',
        inputs: text,
        parameters: {
          max_length: options?.maxLength || 150,
          min_length: options?.minLength || 30,
        },
      });

      return result.summary_text;
    } catch (error: any) {
      console.error('Hugging Face summarization error:', error.message);
      throw new Error(`Summarization error: ${error.message}`);
    }
  }

  /**
   * Embeddings for semantic search
   */
  async getEmbedding(
    text: string,
    options?: {
      model?: string;
    }
  ): Promise<number[]> {
    try {
      const result = await this.hf.featureExtraction({
        model: options?.model || 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: text,
      });

      // Result is a multi-dimensional array, flatten to 1D
      if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0] as number[];
      }

      return result as number[];
    } catch (error: any) {
      console.error('Hugging Face embedding error:', error.message);
      throw new Error(`Embedding error: ${error.message}`);
    }
  }

  /**
   * Translation
   */
  async translate(
    text: string,
    options?: {
      model?: string;
      sourceLang?: string;
      targetLang?: string;
    }
  ): Promise<string> {
    try {
      // Default to English to French, but model should match language pair
      const model = options?.model || 'Helsinki-NLP/opus-mt-en-fr';

      const result = await this.hf.translation({
        model,
        inputs: text,
      });

      return (result as any).translation_text;
    } catch (error: any) {
      console.error('Hugging Face translation error:', error.message);
      throw new Error(`Translation error: ${error.message}`);
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!process.env.HUGGINGFACE_API_KEY;
  }

  /**
   * Get recommended models for different tasks
   */
  getRecommendedModels() {
    return {
      textGeneration: [
        'mistralai/Mistral-7B-Instruct-v0.2',
        'meta-llama/Llama-2-7b-chat-hf',
        'tiiuae/falcon-7b-instruct',
      ],
      classification: [
        'distilbert-base-uncased-finetuned-sst-2-english', // Sentiment
        'facebook/bart-large-mnli', // Zero-shot classification
      ],
      ner: [
        'dslim/bert-base-NER',
        'Jean-Baptiste/roberta-large-ner-english',
      ],
      questionAnswering: [
        'deepset/roberta-base-squad2',
        'distilbert-base-cased-distilled-squad',
      ],
      summarization: [
        'facebook/bart-large-cnn',
        'google/pegasus-xsum',
      ],
      embeddings: [
        'sentence-transformers/all-MiniLM-L6-v2',
        'sentence-transformers/all-mpnet-base-v2',
      ],
      translation: [
        'Helsinki-NLP/opus-mt-en-fr', // English to French
        'Helsinki-NLP/opus-mt-en-es', // English to Spanish
        'Helsinki-NLP/opus-mt-en-de', // English to German
      ],
    };
  }
}

// Export singleton instance
export const huggingFaceService = new HuggingFaceService();
