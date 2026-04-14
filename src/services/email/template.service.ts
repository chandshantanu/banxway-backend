import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  industry: string | null;
  subject_template: string;
  html_template: string;
  text_template: string | null;
  variables: Array<{ name: string; required: boolean; description: string }>;
  default_attachments: Array<{ name: string; blob_url: string }>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequest {
  name: string;
  slug: string;
  category: string;
  industry?: string;
  subject_template: string;
  html_template: string;
  text_template?: string;
  variables?: Array<{ name: string; required: boolean; description: string }>;
  default_attachments?: Array<{ name: string; blob_url: string }>;
}

class EmailTemplateService {
  private isTableMissing(error: any): boolean {
    return error?.code === '42P01' || error?.message?.includes('email_templates');
  }

  async getAll(filters?: { category?: string; industry?: string }): Promise<EmailTemplate[]> {
    let query = supabaseAdmin.from('email_templates').select('*').eq('is_active', true);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.industry) query = query.eq('industry', filters.industry);
    query = query.order('category').order('name');
    const { data, error } = await query;
    if (error) {
      if (this.isTableMissing(error)) return [];
      throw error;
    }
    return (data || []) as EmailTemplate[];
  }

  async getBySlug(slug: string): Promise<EmailTemplate | null> {
    const { data, error } = await supabaseAdmin.from('email_templates').select('*').eq('slug', slug).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      if (this.isTableMissing(error)) return null;
      throw error;
    }
    return data as EmailTemplate;
  }

  async getById(id: string): Promise<EmailTemplate | null> {
    const { data, error } = await supabaseAdmin.from('email_templates').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      if (this.isTableMissing(error)) return null;
      throw error;
    }
    return data as EmailTemplate;
  }

  async create(template: CreateTemplateRequest, userId?: string): Promise<EmailTemplate> {
    const { data, error } = await supabaseAdmin.from('email_templates').insert({
      name: template.name,
      slug: template.slug,
      category: template.category,
      industry: template.industry || null,
      subject_template: template.subject_template,
      html_template: template.html_template,
      text_template: template.text_template || null,
      variables: JSON.stringify(template.variables || []),
      default_attachments: JSON.stringify(template.default_attachments || []),
      created_by: userId || null,
    }).select().single();
    if (error) throw error;
    logger.info('Email template created', { slug: template.slug, category: template.category });
    return data as EmailTemplate;
  }

  async update(id: string, updates: Partial<CreateTemplateRequest>): Promise<EmailTemplate> {
    const { data, error } = await supabaseAdmin.from('email_templates').update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw error;
    return data as EmailTemplate;
  }

  async delete(id: string): Promise<void> {
    await supabaseAdmin.from('email_templates').update({ is_active: false }).eq('id', id);
  }

  /**
   * Render a template with variable substitution
   */
  render(template: EmailTemplate, variables: Record<string, string>): {
    subject: string;
    html: string;
    text: string | null;
  } {
    let subject = template.subject_template;
    let html = template.html_template;
    let text = template.text_template;

    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      subject = subject.replace(pattern, value);
      html = html.replace(pattern, value);
      if (text) text = text.replace(pattern, value);
    }

    // Remove any unreplaced optional variables
    const unresolved = /\{\{\s*\w+\s*\}\}/g;
    subject = subject.replace(unresolved, '');
    html = html.replace(unresolved, '');
    if (text) text = text.replace(unresolved, '');

    return { subject, html, text };
  }

  /**
   * Seed default templates (idempotent — skips existing slugs)
   */
  async seedDefaults(): Promise<number> {
    const defaults: CreateTemplateRequest[] = [
      {
        name: 'Company Profile Introduction',
        slug: 'welcome-formal',
        category: 'welcome',
        industry: 'general',
        subject_template: 'Welcome to Banxway Global, {{customer_name}}',
        html_template: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<h2 style="color:#0A2D5B">Welcome to Banxway Global</h2>
<p>Dear {{customer_name}},</p>
<p>Thank you for connecting with us. Banxway Global is your trusted partner for international trade logistics — offering end-to-end freight forwarding, trade finance, and supply chain solutions.</p>
<p>Our key services include:</p>
<ul>
<li><strong>Ocean Freight</strong> — FCL & LCL shipments worldwide</li>
<li><strong>Air Freight</strong> — Time-critical cargo solutions</li>
<li><strong>Trade Finance</strong> — Letters of Credit, Documentary Collections</li>
<li><strong>Customs Clearance</strong> — Full regulatory compliance support</li>
</ul>
<p>Please find our company profile attached for your reference. I would be happy to discuss how we can support your logistics requirements.</p>
<p>Best regards,<br><strong>{{rep_name}}</strong><br>{{rep_email}}<br>Banxway Global</p>
</div>`,
        text_template: 'Dear {{customer_name}},\n\nThank you for connecting with us. Banxway Global is your trusted partner for international trade logistics.\n\nOur services: Ocean Freight (FCL/LCL), Air Freight, Trade Finance, Customs Clearance.\n\nPlease find our company profile attached.\n\nBest regards,\n{{rep_name}}\n{{rep_email}}\nBanxway Global',
        variables: [
          { name: 'customer_name', required: true, description: 'Customer/lead name' },
          { name: 'rep_name', required: true, description: 'Sales rep full name' },
          { name: 'rep_email', required: true, description: 'Sales rep email' },
        ],
      },
      {
        name: 'Quick Introduction',
        slug: 'welcome-casual',
        category: 'welcome',
        industry: 'general',
        subject_template: 'Hi {{customer_name}} — Introduction from Banxway Global',
        html_template: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<p>Hi {{customer_name}},</p>
<p>I'm {{rep_name}} from Banxway Global. We specialize in freight forwarding and trade logistics solutions for businesses like yours.</p>
<p>I'd love to learn more about your shipping needs and explore how we might be able to help. Would you have 15 minutes for a quick call this week?</p>
<p>Looking forward to hearing from you!</p>
<p>Cheers,<br><strong>{{rep_name}}</strong><br>{{rep_email}} | {{rep_phone}}<br>Banxway Global</p>
</div>`,
        text_template: 'Hi {{customer_name}},\n\nI\'m {{rep_name}} from Banxway Global. We specialize in freight forwarding and trade logistics.\n\nWould you have 15 minutes for a quick call this week?\n\nCheers,\n{{rep_name}}\n{{rep_email}} | {{rep_phone}}',
        variables: [
          { name: 'customer_name', required: true, description: 'Customer/lead name' },
          { name: 'rep_name', required: true, description: 'Sales rep full name' },
          { name: 'rep_email', required: true, description: 'Sales rep email' },
          { name: 'rep_phone', required: false, description: 'Sales rep phone' },
        ],
      },
      {
        name: 'Importer Outreach',
        slug: 'outreach-importer',
        category: 'cold_outreach',
        industry: 'manufacturing',
        subject_template: 'Streamline Your Import Operations — Banxway Global',
        html_template: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<p>Dear {{customer_name}},</p>
<p>I understand that managing import logistics — from supplier coordination to customs clearance — can be complex and time-consuming.</p>
<p>At Banxway Global, we help importers like {{company_name}} simplify their supply chain with:</p>
<ul>
<li>Competitive ocean & air freight rates from key origins (China, SE Asia, Europe)</li>
<li>End-to-end customs clearance and documentation</li>
<li>Real-time shipment tracking and proactive updates</li>
<li>Trade finance support (LC, Documentary Collections)</li>
</ul>
<p>I'd be happy to provide a competitive quote for your next shipment. Could you share your typical shipping requirements?</p>
<p>Best regards,<br><strong>{{rep_name}}</strong><br>{{rep_email}}<br>Banxway Global</p>
</div>`,
        variables: [
          { name: 'customer_name', required: true, description: 'Customer name' },
          { name: 'company_name', required: false, description: 'Customer company name' },
          { name: 'rep_name', required: true, description: 'Sales rep name' },
          { name: 'rep_email', required: true, description: 'Sales rep email' },
        ],
      },
      {
        name: 'Exporter Outreach',
        slug: 'outreach-exporter',
        category: 'cold_outreach',
        industry: 'trading',
        subject_template: 'Export Logistics Made Simple — Banxway Global',
        html_template: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<p>Dear {{customer_name}},</p>
<p>Exporting goods internationally requires reliable logistics partners who understand documentation, compliance, and timing.</p>
<p>Banxway Global offers comprehensive export solutions:</p>
<ul>
<li>Door-to-port and door-to-door shipments worldwide</li>
<li>Export documentation and regulatory compliance</li>
<li>Competitive FCL & LCL rates to all major destinations</li>
<li>Dedicated account management for consistent service</li>
</ul>
<p>Let me know if you'd like a rate quote for any upcoming shipments — I'm happy to help.</p>
<p>Best regards,<br><strong>{{rep_name}}</strong><br>{{rep_email}}<br>Banxway Global</p>
</div>`,
        variables: [
          { name: 'customer_name', required: true, description: 'Customer name' },
          { name: 'rep_name', required: true, description: 'Sales rep name' },
          { name: 'rep_email', required: true, description: 'Sales rep email' },
        ],
      },
      {
        name: 'Freight Agent Introduction',
        slug: 'outreach-agent',
        category: 'cold_outreach',
        industry: 'logistics',
        subject_template: 'Partnership Opportunity — Banxway Global',
        html_template: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<p>Dear {{customer_name}},</p>
<p>I'm reaching out from Banxway Global to explore a potential partnership.</p>
<p>We are a freight forwarding company based in India with strong capabilities in:</p>
<ul>
<li>Ocean freight (FCL/LCL) — extensive carrier network</li>
<li>Air freight — all major airports covered</li>
<li>Customs brokerage — CHA licensed</li>
<li>Inland transportation — pan-India coverage</li>
</ul>
<p>We're looking to partner with agents like you to expand our global reach. If you have cargo moving to/from India, we'd love to discuss how we can work together.</p>
<p>Best regards,<br><strong>{{rep_name}}</strong><br>{{rep_email}}<br>Banxway Global</p>
</div>`,
        variables: [
          { name: 'customer_name', required: true, description: 'Agent name' },
          { name: 'rep_name', required: true, description: 'Sales rep name' },
          { name: 'rep_email', required: true, description: 'Sales rep email' },
        ],
      },
      {
        name: 'Trade Show Follow-up',
        slug: 'followup-tradeshow',
        category: 'follow_up',
        industry: 'general',
        subject_template: 'Great meeting you at {{event_name}} — Banxway Global',
        html_template: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<p>Hi {{customer_name}},</p>
<p>It was great meeting you at {{event_name}}! I enjoyed learning about {{company_name}} and your logistics requirements.</p>
<p>As discussed, I'm attaching our company profile and service overview. I'd love to continue our conversation and explore how Banxway Global can support your business.</p>
<p>Would you be available for a call next week? I'm flexible on timing.</p>
<p>Looking forward to it!</p>
<p>Best regards,<br><strong>{{rep_name}}</strong><br>{{rep_email}} | {{rep_phone}}<br>Banxway Global</p>
</div>`,
        variables: [
          { name: 'customer_name', required: true, description: 'Contact name' },
          { name: 'company_name', required: false, description: 'Their company' },
          { name: 'event_name', required: true, description: 'Trade show/event name' },
          { name: 'rep_name', required: true, description: 'Sales rep name' },
          { name: 'rep_email', required: true, description: 'Sales rep email' },
          { name: 'rep_phone', required: false, description: 'Sales rep phone' },
        ],
      },
      {
        name: 'RFQ Acknowledgment',
        slug: 'rfq-ack',
        category: 'rfq_response',
        industry: 'general',
        subject_template: 'Re: Your Quote Request — Banxway Global',
        html_template: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<p>Dear {{customer_name}},</p>
<p>Thank you for your rate inquiry. We have received your request and our team is working on a competitive quote for you.</p>
<p><strong>Request Summary:</strong></p>
<ul>
<li>Origin: {{origin}}</li>
<li>Destination: {{destination}}</li>
<li>Service: {{service_type}}</li>
</ul>
<p>You can expect to receive our quotation within 24-48 hours. If you have any additional details to share (commodity, weight, dimensions), please reply to this email.</p>
<p>Best regards,<br><strong>{{rep_name}}</strong><br>{{rep_email}}<br>Banxway Global</p>
</div>`,
        variables: [
          { name: 'customer_name', required: true, description: 'Customer name' },
          { name: 'origin', required: false, description: 'Shipment origin' },
          { name: 'destination', required: false, description: 'Shipment destination' },
          { name: 'service_type', required: false, description: 'FCL/LCL/Air' },
          { name: 'rep_name', required: true, description: 'Sales rep name' },
          { name: 'rep_email', required: true, description: 'Sales rep email' },
        ],
      },
    ];

    let seeded = 0;
    for (const tmpl of defaults) {
      const existing = await this.getBySlug(tmpl.slug);
      if (!existing) {
        try {
          await this.create(tmpl);
          seeded++;
        } catch (err: any) {
          logger.warn('Failed to seed template', { slug: tmpl.slug, error: err.message });
        }
      }
    }

    if (seeded > 0) {
      logger.info(`Seeded ${seeded} default email templates`);
    }
    return seeded;
  }
}

export default new EmailTemplateService();
