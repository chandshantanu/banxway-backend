/**
 * OpenRouter AI Service
 *
 * Universal API client for multiple LLM providers through OpenRouter
 * Supports: OpenAI, Anthropic, Meta, Mistral, Google, and more
 */

import axios, { AxiosInstance } from 'axios';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterService {
  private client: AxiosInstance;
  private apiKey: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.defaultModel = process.env.AI_MODEL || 'openai/gpt-4-turbo-preview';

    const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:8000',
        'X-Title': 'Banxway Platform',
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds
    });
  }

  /**
   * Generate chat completion
   */
  async chatCompletion(
    messages: OpenRouterMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    try {
      const request: OpenRouterRequest = {
        model: options?.model || this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
      };

      const response = await this.client.post<OpenRouterResponse>('/chat/completions', request);

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in response');
      }

      return content;
    } catch (error: any) {
      console.error('OpenRouter API error:', error.response?.data || error.message);
      throw new Error(`OpenRouter API error: ${error.message}`);
    }
  }

  /**
   * Generate JSON response with structured output
   */
  async chatCompletionJSON<T = any>(
    messages: OpenRouterMessage[],
    options?: {
      model?: string;
      temperature?: number;
    }
  ): Promise<T> {
    // Add instruction for JSON output
    const modifiedMessages = [...messages];
    const lastMessage = modifiedMessages[modifiedMessages.length - 1];

    if (lastMessage.role === 'user') {
      lastMessage.content += '\n\nRespond with valid JSON only.';
    }

    const content = await this.chatCompletion(modifiedMessages, {
      ...options,
      temperature: options?.temperature ?? 0.3, // Lower temperature for structured output
    });

    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;

      return JSON.parse(jsonString.trim());
    } catch (error) {
      console.error('Failed to parse JSON response:', content);
      throw new Error('Invalid JSON response from AI');
    }
  }

  /**
   * Available models on OpenRouter
   */
  getAvailableModels(): string[] {
    return [
      // OpenAI
      'openai/gpt-4-turbo-preview',
      'openai/gpt-4',
      'openai/gpt-3.5-turbo',

      // Anthropic
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-2',

      // Meta (Llama)
      'meta-llama/llama-2-70b-chat',
      'meta-llama/llama-2-13b-chat',

      // Mistral
      'mistralai/mistral-medium',
      'mistralai/mistral-small',

      // Google
      'google/gemini-pro',

      // Open Source
      'openchat/openchat-7b',
      'phind/phind-codellama-34b',
    ];
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }
}

// Export singleton instance
export const openRouterService = new OpenRouterService();
