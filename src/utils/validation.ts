import { z } from 'zod';
import { ValidationError } from '../types';

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Validation failed', error.errors);
    }
    throw error;
  }
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email();

export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);
