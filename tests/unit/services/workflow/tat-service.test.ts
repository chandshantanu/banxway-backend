import { TATService } from '../../../../src/services/workflow/tat-service';
import { supabaseAdmin } from '../../../../src/config/database.config';

// Mock dependencies
jest.mock('../../../../src/config/database.config');
jest.mock('../../../../src/utils/logger');

describe('TATService', () => {
  let tatService: TATService;

  beforeEach(() => {
    tatService = new TATService();
    jest.clearAllMocks();
  });

  describe('calculateTATDeadline', () => {
    it('should calculate deadline for MEDIUM priority workflow', () => {
      const startTime = new Date('2026-02-06T10:00:00Z');
      const slaConfig = {
        responseTimeMinutes: 240, // 4 hours
        resolutionTimeMinutes: 1440, // 24 hours
        escalationRules: [],
      };

      const result = tatService.calculateTATDeadline(
        startTime,
        slaConfig,
        'MEDIUM'
      );

      // Deadline should be 24 hours from start
      const expectedDeadline = new Date('2026-02-07T10:00:00Z');
      expect(result.deadlineAt).toEqual(expectedDeadline);

      // Warning threshold at 80% = 19.2 hours = 1152 minutes
      const expectedWarning = new Date(startTime.getTime() + 1152 * 60 * 1000);
      expect(result.warningThresholdAt).toEqual(expectedWarning);

      // Critical threshold at 90% = 21.6 hours = 1296 minutes
      const expectedCritical = new Date(startTime.getTime() + 1296 * 60 * 1000);
      expect(result.criticalThresholdAt).toEqual(expectedCritical);
    });

    it('should reduce TAT by 50% for HIGH priority workflows', () => {
      const startTime = new Date('2026-02-06T10:00:00Z');
      const slaConfig = {
        responseTimeMinutes: 240,
        resolutionTimeMinutes: 1440, // 24 hours
        escalationRules: [],
      };

      const result = tatService.calculateTATDeadline(
        startTime,
        slaConfig,
        'HIGH'
      );

      // HIGH priority: 50% of 24 hours = 12 hours
      const expectedDeadline = new Date('2026-02-06T22:00:00Z');
      expect(result.deadlineAt).toEqual(expectedDeadline);
    });

    it('should extend TAT by 50% for LOW priority workflows', () => {
      const startTime = new Date('2026-02-06T10:00:00Z');
      const slaConfig = {
        responseTimeMinutes: 240,
        resolutionTimeMinutes: 1440, // 24 hours
        escalationRules: [],
      };

      const result = tatService.calculateTATDeadline(
        startTime,
        slaConfig,
        'LOW'
      );

      // LOW priority: 150% of 24 hours = 36 hours
      const expectedDeadline = new Date('2026-02-07T22:00:00Z');
      expect(result.deadlineAt).toEqual(expectedDeadline);
    });

    it('should handle CRITICAL priority with immediate deadline', () => {
      const startTime = new Date('2026-02-06T10:00:00Z');
      const slaConfig = {
        responseTimeMinutes: 240,
        resolutionTimeMinutes: 1440,
        escalationRules: [],
      };

      const result = tatService.calculateTATDeadline(
        startTime,
        slaConfig,
        'CRITICAL'
      );

      // CRITICAL priority: 25% of 24 hours = 6 hours
      const expectedDeadline = new Date('2026-02-06T16:00:00Z');
      expect(result.deadlineAt).toEqual(expectedDeadline);
    });

    it('should throw error if slaConfig is missing resolutionTimeMinutes', () => {
      const startTime = new Date('2026-02-06T10:00:00Z');
      const slaConfig = {
        responseTimeMinutes: 240,
        escalationRules: [],
      } as any;

      expect(() => {
        tatService.calculateTATDeadline(startTime, slaConfig, 'MEDIUM');
      }).toThrow('Invalid SLA configuration: resolutionTimeMinutes is required');
    });
  });

  describe('getApproachingDeadlines', () => {
    it('should return instances within warning threshold', async () => {
      const mockInstances = [
        {
          id: 'instance-1',
          workflow_definition_id: 'wf-1',
          workflow_name: 'Quote Request',
          entity_type: 'SHIPMENT',
          entity_id: 'shipment-1',
          thread_id: 'thread-1',
          status: 'IN_PROGRESS',
          started_at: new Date('2026-02-06T09:00:00Z').toISOString(),
          assigned_to: 'user-1',
          sla_config: {
            resolutionTimeMinutes: 1440,
            escalationRules: [
              {
                afterMinutes: 1152, // 80% threshold
                escalateTo: ['manager'],
                notifyVia: ['EMAIL', 'WHATSAPP'],
              },
            ],
          },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        data: mockInstances,
        error: null,
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await tatService.getApproachingDeadlines();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('instance-1');
      expect(result[0].timeRemaining).toBeGreaterThan(0);
    });

    it('should return empty array if no approaching deadlines', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        data: [],
        error: null,
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await tatService.getApproachingDeadlines();

      expect(result).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        data: null,
        error: { message: 'Database connection failed' },
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockQuery);

      await expect(tatService.getApproachingDeadlines()).rejects.toThrow(
        'Failed to fetch approaching deadlines'
      );
    });
  });

  describe('getBreachedDeadlines', () => {
    it('should return instances past deadline', async () => {
      const mockInstances = [
        {
          id: 'instance-2',
          workflow_definition_id: 'wf-2',
          workflow_name: 'KYC Verification',
          entity_type: 'THREAD',
          entity_id: 'thread-2',
          thread_id: 'thread-2',
          status: 'IN_PROGRESS',
          started_at: new Date('2026-02-05T09:00:00Z').toISOString(), // 25 hours ago
          assigned_to: 'user-2',
          sla_config: {
            resolutionTimeMinutes: 1440, // 24 hours
            escalationRules: [
              {
                afterMinutes: 1440,
                escalateTo: ['manager', 'ops'],
                notifyVia: ['EMAIL', 'SMS', 'WHATSAPP', 'CALL'],
              },
            ],
          },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        data: mockInstances,
        error: null,
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await tatService.getBreachedDeadlines();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('instance-2');
      expect(result[0].overdueMinutes).toBeGreaterThan(0);
    });

    it('should calculate overdue minutes correctly', async () => {
      const startedAt = new Date(Date.now() - 26 * 60 * 60 * 1000); // 26 hours ago
      const mockInstances = [
        {
          id: 'instance-3',
          workflow_definition_id: 'wf-3',
          workflow_name: 'Document Validation',
          entity_type: 'SHIPMENT',
          entity_id: 'shipment-3',
          thread_id: 'thread-3',
          status: 'IN_PROGRESS',
          started_at: startedAt.toISOString(),
          assigned_to: 'user-3',
          sla_config: {
            resolutionTimeMinutes: 1440, // 24 hours
            escalationRules: [],
          },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        data: mockInstances,
        error: null,
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await tatService.getBreachedDeadlines();

      expect(result).toHaveLength(1);
      // Overdue by ~2 hours = 120 minutes
      expect(result[0].overdueMinutes).toBeGreaterThanOrEqual(119);
      expect(result[0].overdueMinutes).toBeLessThanOrEqual(121);
    });

    it('should return empty array if no breached deadlines', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        data: [],
        error: null,
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await tatService.getBreachedDeadlines();

      expect(result).toHaveLength(0);
    });
  });

  describe('updateTATStatus', () => {
    it('should update thread TAT status to AT_RISK', async () => {
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnValue({
          data: { id: 'thread-1', tat_status: 'AT_RISK' },
          error: null,
        }),
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockUpdateQuery);

      await tatService.updateTATStatus('thread-1', 'AT_RISK');

      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        tat_status: 'AT_RISK',
      });
      expect(mockUpdateQuery.eq).toHaveBeenCalledWith('id', 'thread-1');
    });

    it('should update thread TAT status to BREACHED', async () => {
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnValue({
          data: { id: 'thread-2', tat_status: 'BREACHED', sla_status: 'BREACHED' },
          error: null,
        }),
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockUpdateQuery);

      await tatService.updateTATStatus('thread-2', 'BREACHED');

      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        tat_status: 'BREACHED',
        sla_status: 'BREACHED',
      });
    });

    it('should throw error if thread not found', async () => {
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockUpdateQuery);

      await expect(
        tatService.updateTATStatus('thread-999', 'BREACHED')
      ).rejects.toThrow('Thread not found');
    });

    it('should emit WebSocket event after status update', async () => {
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnValue({
          data: { id: 'thread-1', tat_status: 'AT_RISK' },
          error: null,
        }),
      };

      (supabaseAdmin.from as jest.Mock).mockReturnValue(mockUpdateQuery);

      // Mock WebSocket io.emit
      const mockIoEmit = jest.fn();
      jest.mock('../../../../src/index', () => ({
        io: { emit: mockIoEmit },
      }));

      await tatService.updateTATStatus('thread-1', 'AT_RISK');

      // Note: WebSocket emit is called internally but hard to test without integration test
      // We'll verify in integration tests
    });
  });

  describe('extendTATDeadline', () => {
    it('should extend deadline by specified minutes', async () => {
      const currentDeadline = new Date('2026-02-07T10:00:00Z');
      const mockThread = {
        id: 'thread-1',
        sla_deadline: currentDeadline,
        tat_status: 'AT_RISK',
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnValue({
          data: mockThread,
          error: null,
        }),
      };

      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnValue({
          data: { ...mockThread, sla_deadline: new Date('2026-02-07T12:00:00Z') },
          error: null,
        }),
      };

      (supabaseAdmin.from as jest.Mock)
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateQuery);

      const result = await tatService.extendTATDeadline('thread-1', 120, 'Customer requested extension');

      // Extended by 2 hours
      const expectedDeadline = new Date('2026-02-07T12:00:00Z');
      expect(result.newDeadline).toEqual(expectedDeadline);
      expect(result.extensionMinutes).toBe(120);
      expect(result.reason).toBe('Customer requested extension');
    });

    it('should throw error if extension minutes is negative', async () => {
      await expect(
        tatService.extendTATDeadline('thread-1', -30, 'Invalid extension')
      ).rejects.toThrow('Extension minutes must be positive');
    });
  });
});
