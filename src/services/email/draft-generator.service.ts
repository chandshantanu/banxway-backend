import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';
import axios from 'axios';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.DRAFT_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

interface ThreadContext {
  threadId: string;
  reference: string;
  messages: Array<{
    direction: string;
    from_name: string | null;
    from_address: string;
    subject: string | null;
    content: string;
    created_at: string;
  }>;
  customer: {
    name: string | null;
    email: string | null;
    industry: string | null;
    tier: string | null;
    entity_type: string | null;
  } | null;
  pipelineStage: string | null;
}

class DraftGeneratorService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
  }

  /**
   * Find threads that need AI-drafted replies (unanswered for 24h+)
   */
  async findUnansweredThreads(maxResults: number = 50): Promise<string[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('communication_threads')
      .select('id')
      .eq('status', 'NEW')
      .not('crm_customer_id', 'is', null)
      .lt('last_message_at', twentyFourHoursAgo)
      .order('last_message_at', { ascending: false })
      .limit(maxResults);

    if (error || !data) return [];

    // Filter: only threads where last message is INBOUND (no reply yet)
    const unanswered: string[] = [];
    for (const thread of data as any[]) {
      const { data: lastMsg } = await supabaseAdmin
        .from('communication_messages')
        .select('direction, status')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastMsg?.direction === 'INBOUND' && !await this.hasDraft(thread.id)) {
        unanswered.push(thread.id);
      }
    }

    return unanswered;
  }

  /**
   * Check if thread already has an AI draft
   */
  private async hasDraft(threadId: string): Promise<boolean> {
    const { count } = await supabaseAdmin
      .from('communication_messages')
      .select('id', { count: 'exact' })
      .eq('thread_id', threadId)
      .eq('status', 'DRAFT')
      .limit(0);

    return (count || 0) > 0;
  }

  /**
   * Gather context for a thread to generate a draft
   */
  async gatherContext(threadId: string): Promise<ThreadContext | null> {
    // Get thread
    const { data: thread } = await supabaseAdmin
      .from('communication_threads')
      .select('id, reference, crm_customer_id, pipeline_stage')
      .eq('id', threadId)
      .single();

    if (!thread) return null;

    // Get last 3 messages
    const { data: messages } = await supabaseAdmin
      .from('communication_messages')
      .select('direction, from_name, from_address, subject, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(3);

    // Get customer info
    let customer = null;
    if (thread.crm_customer_id) {
      const { data: cust } = await supabaseAdmin
        .from('crm_customers')
        .select('legal_name, primary_email, industry, customer_tier, entity_type')
        .eq('id', thread.crm_customer_id)
        .single();

      if (cust) {
        customer = {
          name: cust.legal_name,
          email: cust.primary_email,
          industry: cust.industry,
          tier: cust.customer_tier,
          entity_type: cust.entity_type,
        };
      }
    }

    return {
      threadId,
      reference: thread.reference,
      messages: (messages || []).reverse() as any[],
      customer,
      pipelineStage: thread.pipeline_stage,
    };
  }

  /**
   * Generate a draft reply using OpenRouter LLM
   */
  async generateDraft(context: ThreadContext): Promise<{
    content: string;
    subject: string;
    confidence: number;
    model: string;
  } | null> {
    if (!this.apiKey) {
      logger.warn('OPENROUTER_API_KEY not set — skipping draft generation');
      return null;
    }

    const conversationHistory = context.messages
      .map(m => `[${m.direction}] ${m.from_name || m.from_address}: ${m.content?.substring(0, 500) || '(no content)'}`)
      .join('\n\n');

    const customerInfo = context.customer
      ? `Customer: ${context.customer.name} (${context.customer.entity_type || 'Customer'}), Industry: ${context.customer.industry || 'Unknown'}, Tier: ${context.customer.tier || 'New'}`
      : 'Customer: Unknown';

    const systemPrompt = `You are a professional freight forwarding specialist at Banxway Global, an international trade logistics company based in India. Draft a concise, professional email reply.

Rules:
- Be specific to the customer's inquiry
- Use a professional but warm tone
- Keep the reply under 200 words
- Don't include subject line in the body
- Don't include salutation greeting like "Dear" — start with the response directly
- End with "Best regards,\\n[Rep Name]\\nBanxway Global"
- If the inquiry is about rates/quotes, mention that the team is reviewing and will respond within 24-48 hours
- If about shipment status, ask for the booking reference or container number`;

    const userPrompt = `${customerInfo}
Pipeline Stage: ${context.pipelineStage || 'Unknown'}
Thread: ${context.reference}

Conversation:
${conversationHistory}

Draft a professional reply to the latest inbound message. Also suggest a subject line.

Format:
SUBJECT: <subject line>
BODY:
<email body>`;

    try {
      const response = await axios.post(
        OPENROUTER_API_URL,
        {
          model: DEFAULT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 500,
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://banxwayglobal.com',
            'X-Title': 'Banxway Draft Generator',
          },
          timeout: 30000,
        }
      );

      const reply = response.data?.choices?.[0]?.message?.content || '';
      const model = response.data?.model || DEFAULT_MODEL;

      // Parse subject and body
      const subjectMatch = reply.match(/SUBJECT:\s*(.+)/i);
      const bodyMatch = reply.match(/BODY:\s*([\s\S]+)/i);

      const subject = subjectMatch?.[1]?.trim() || `Re: ${context.messages[0]?.subject || context.reference}`;
      const content = bodyMatch?.[1]?.trim() || reply.trim();

      return {
        content,
        subject,
        confidence: 0.7,
        model,
      };
    } catch (error: any) {
      logger.error('OpenRouter API error during draft generation', {
        threadId: context.threadId,
        error: error.message,
        status: error.response?.status,
      });
      return null;
    }
  }

  /**
   * Save a generated draft as a DRAFT message on the thread
   */
  async saveDraft(
    threadId: string,
    draft: { content: string; subject: string; confidence: number; model: string }
  ): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        status: 'DRAFT',
        content: draft.content,
        subject: draft.subject,
        from_address: process.env.SMTP_USER || 'connect@banxwayglobal.com',
        from_name: 'Banxway Global',
        to_addresses: [],
        ai_summary: `AI draft generated by ${draft.model}`,
        confidence_score: draft.confidence,
        metadata: JSON.stringify({
          ai_generated: true,
          model: draft.model,
          generated_at: new Date().toISOString(),
        }),
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to save AI draft', { threadId, error: error.message });
      return null;
    }

    logger.info('AI draft saved', { threadId, messageId: data.id, model: draft.model });
    return data.id;
  }

  /**
   * Run the full draft generation pipeline for all unanswered threads
   */
  async generateAllDrafts(): Promise<{ processed: number; generated: number; errors: number }> {
    const unanswered = await this.findUnansweredThreads(50);
    let generated = 0;
    let errors = 0;

    logger.info(`Draft generator: found ${unanswered.length} unanswered threads`);

    for (const threadId of unanswered) {
      try {
        const context = await this.gatherContext(threadId);
        if (!context) continue;

        const draft = await this.generateDraft(context);
        if (!draft) continue;

        await this.saveDraft(threadId, draft);
        generated++;

        // Small delay between API calls
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        errors++;
        logger.error('Draft generation failed for thread', { threadId, error: err.message });
      }
    }

    logger.info('Draft generation complete', { processed: unanswered.length, generated, errors });
    return { processed: unanswered.length, generated, errors };
  }
}

export default new DraftGeneratorService();
