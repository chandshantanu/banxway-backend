import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';
import pendingContactRepository from '../database/repositories/pending-contact.repository';
import threadParticipantRepository from '../database/repositories/thread-participant.repository';

export interface IdentityResolutionResult {
  matched: boolean;
  source: 'crm_customer' | 'crm_contact' | 'pending_contact' | 'new';
  crmCustomerId: string | null;
  entityType: string | null;
  leadClassification: 'existing_customer' | 'existing_shipment' | 'new_lead' | 'pending_review';
  pendingContactId: string | null;
  customerName: string | null;
}

class IdentityResolutionService {
  /**
   * Resolve a sender's identity against CRM.
   * Returns match result WITHOUT auto-creating CRM entries.
   */
  async resolveIdentity(
    email: string,
    name?: string
  ): Promise<IdentityResolutionResult> {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check CRM customers by primary_email
    const { data: customer } = await supabaseAdmin
      .from('crm_customers')
      .select('id, legal_name, entity_type, status')
      .ilike('primary_email', normalizedEmail)
      .limit(1)
      .single();

    if (customer) {
      // Check for active shipments
      const { count: activeShipments } = await supabaseAdmin
        .from('shipments')
        .select('id', { count: 'exact' })
        .eq('customer_id', customer.id)
        .in('status', ['BOOKED', 'IN_TRANSIT', 'AT_PORT', 'CUSTOMS_CLEARANCE'])
        .limit(0);

      return {
        matched: true,
        source: 'crm_customer',
        crmCustomerId: customer.id,
        entityType: customer.entity_type || 'CUSTOMER',
        leadClassification: (activeShipments || 0) > 0 ? 'existing_shipment' : 'existing_customer',
        pendingContactId: null,
        customerName: customer.legal_name,
      };
    }

    // 2. Check CRM contacts by email
    const { data: contact } = await supabaseAdmin
      .from('crm_contacts')
      .select('id, customer_id, full_name')
      .ilike('email', normalizedEmail)
      .limit(1)
      .single();

    if (contact?.customer_id) {
      return {
        matched: true,
        source: 'crm_contact',
        crmCustomerId: contact.customer_id,
        entityType: 'CUSTOMER',
        leadClassification: 'existing_customer',
        pendingContactId: null,
        customerName: contact.full_name,
      };
    }

    // 3. Check pending contacts (already seen but not approved)
    const pending = await pendingContactRepository.findByEmail(normalizedEmail);
    if (pending) {
      // Increment thread count
      await pendingContactRepository.incrementThreadCount(normalizedEmail);
      return {
        matched: false,
        source: 'pending_contact',
        crmCustomerId: null,
        entityType: pending.suggested_entity_type,
        leadClassification: 'pending_review',
        pendingContactId: pending.id,
        customerName: pending.name || name || null,
      };
    }

    // 4. New unknown sender — create pending contact
    const domain = normalizedEmail.split('@')[1] || '';
    const suggestedType = this.suggestEntityType(domain);

    const newPending = await pendingContactRepository.create({
      email: normalizedEmail,
      name: name || normalizedEmail.split('@')[0],
      domain,
      suggested_entity_type: suggestedType,
      suggested_classification: 'new_lead',
    });

    logger.info('New unknown sender — pending contact created', {
      email: normalizedEmail,
      pendingContactId: newPending.id,
      suggestedType,
    });

    return {
      matched: false,
      source: 'new',
      crmCustomerId: null,
      entityType: suggestedType,
      leadClassification: 'pending_review',
      pendingContactId: newPending.id,
      customerName: name || null,
    };
  }

  /**
   * Suggest entity type from email domain
   */
  private suggestEntityType(domain: string): string {
    const agencyDomains = [
      'maersk.com', 'msc.com', 'cma-cgm.com', 'hapag-lloyd.com',
      'evergreen-marine.com', 'cosco.com', 'yangming.com', 'oocl.com',
      'zim.com', 'one-line.com', 'hmm21.com',
    ];
    const internalDomains = ['banxwayglobal.com', 'banxway.com', 'chatslytics.com'];

    if (internalDomains.includes(domain)) return 'INTERNAL';
    if (agencyDomains.includes(domain)) return 'AGENCY';
    return 'CUSTOMER';
  }

  /**
   * Link a resolved identity to a thread.
   * Updates thread fields + adds participant.
   */
  async linkToThread(
    threadId: string,
    result: IdentityResolutionResult,
    email: string,
    role: string = 'PRIMARY'
  ): Promise<void> {
    // Update thread with CRM link if matched
    const threadUpdate: Record<string, any> = {
      correlation_status: result.matched ? 'matched' : 'pending',
      lead_classification: result.leadClassification,
      correlated_at: new Date().toISOString(),
    };

    if (result.crmCustomerId) {
      threadUpdate.crm_customer_id = result.crmCustomerId;
    }

    await supabaseAdmin
      .from('communication_threads')
      .update(threadUpdate)
      .eq('id', threadId);

    // Add as thread participant
    await threadParticipantRepository.addParticipant({
      thread_id: threadId,
      contact_email: email,
      contact_name: result.customerName || undefined,
      role,
      entity_type: result.entityType || undefined,
      crm_customer_id: result.crmCustomerId || undefined,
      pending_contact_id: result.pendingContactId || undefined,
    });
  }

  /**
   * Approve a pending contact — create CRM entry + retroactively link all threads
   */
  async approvePendingContact(
    pendingContactId: string,
    approvedBy: string,
    entityType: string,
    additionalData?: {
      legal_name?: string;
      primary_phone?: string;
      industry?: string;
      lead_source?: string;
      notes?: string;
    }
  ): Promise<{ crmCustomerId: string; linkedThreads: number }> {
    const pending = await pendingContactRepository.findById(pendingContactId);
    if (!pending) throw new Error('Pending contact not found');

    // Create CRM customer
    const { data: customer, error } = await supabaseAdmin
      .from('crm_customers')
      .insert({
        legal_name: additionalData?.legal_name || pending.name || pending.email.split('@')[0],
        primary_email: pending.email,
        primary_phone: additionalData?.primary_phone || null,
        status: 'LEAD',
        entity_type: entityType,
        customer_tier: 'NEW',
        lead_source: additionalData?.lead_source || 'email_inbound',
        lead_notes: additionalData?.notes || `Approved from pending contact queue`,
        industry: additionalData?.industry || null,
        sales_representative: approvedBy,
      })
      .select()
      .single();

    if (error) throw error;

    // Update pending contact with CRM ID
    await pendingContactRepository.approve(pendingContactId, approvedBy, entityType);
    await pendingContactRepository.linkToCrmCustomer(pendingContactId, customer.id);

    // Retroactively link ALL threads from this sender
    const { data: threads } = await supabaseAdmin
      .from('communication_threads')
      .select('id')
      .or(`id.in.(${
        await threadParticipantRepository.findThreadsByEmail(pending.email)
          .then(ids => ids.map(id => `"${id}"`).join(','))
      })`);

    let linkedThreads = 0;
    if (threads) {
      for (const thread of threads) {
        await supabaseAdmin
          .from('communication_threads')
          .update({
            crm_customer_id: customer.id,
            correlation_status: 'matched',
            lead_classification: 'new_lead',
            correlated_at: new Date().toISOString(),
          })
          .eq('id', thread.id);
        linkedThreads++;
      }
    }

    // Link participant records
    await threadParticipantRepository.linkToCrmCustomer(pending.email, customer.id);

    logger.info('Pending contact approved and linked', {
      pendingContactId,
      crmCustomerId: customer.id,
      entityType,
      linkedThreads,
    });

    return { crmCustomerId: customer.id, linkedThreads };
  }
}

export default new IdentityResolutionService();
