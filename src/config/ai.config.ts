import dotenv from 'dotenv';

dotenv.config();

export const aiConfig = {
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.AI_MODEL || 'openai/gpt-4-turbo-preview',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
  },
  huggingface: {
    apiKey: process.env.HUGGINGFACE_API_KEY || '',
    defaultModel: process.env.HUGGINGFACE_DEFAULT_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2',
  },
};
