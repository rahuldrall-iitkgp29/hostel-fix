import { describe, test, expect } from 'vitest';
import { generateReference } from '../../src/utils/referenceGenerator';
import {
  computePriority,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
} from '../../src/services/priority.service';
import {
  computeDeadlines,
  tightenDeadlines,
  DEFAULT_SLA_TARGETS,
} from '../../src/services/sla.service';
import {
  computeCanonicalPayloadHash,
  getAllowedActions,
} from '../../src/services/complaint.service';

describe('complaint unit tests', () => {
  describe('referenceGenerator', () => {
    test('generates valid uppercase reference matching HFX-YYYY-XXXXXXXXXX', () => {
      const ref = generateReference(2026);
      expect(ref).toMatch(/^HFX-2026-[A-Z0-9]{10}$/);
    });

    test('generates unique references across multiple calls', () => {
      const refs = new Set();
      for (let i = 0; i < 100; i++) {
        refs.add(generateReference(2026));
      }
      expect(refs.size).toBe(100);
    });
  });

  describe('priority scoring algorithm', () => {
    test('computes LOW when no indicators are reported', () => {
      const result = computePriority({});
      expect(result.score).toBe(0);
      expect(result.suggestedPriority).toBe('LOW');
      expect(result.priorityExplanation).toBe(
        'No urgency indicators were reported.'
      );
    });

    test('computes MEDIUM for functionalityLoss alone', () => {
      const result = computePriority({ functionalityLoss: true });
      expect(result.score).toBe(1);
      expect(result.suggestedPriority).toBe('MEDIUM');
      expect(result.priorityExplanation).toBe(
        'Loss of functionality was reported.'
      );
    });

    test('computes HIGH for essentialServiceOutage alone (score 3) or with functionalityLoss (score 4)', () => {
      const highRes = computePriority({
        essentialServiceOutage: true,
        functionalityLoss: true,
      });
      expect(highRes.score).toBe(4);
      expect(highRes.suggestedPriority).toBe('HIGH');
      expect(highRes.priorityExplanation).toBe(
        'Essential service outage and loss of functionality were reported.'
      );
    });

    test('computes CRITICAL for safetyRisk and essentialServiceOutage (score 7)', () => {
      const critRes = computePriority({
        safetyRisk: true,
        essentialServiceOutage: true,
      });
      expect(critRes.score).toBe(7);
      expect(critRes.suggestedPriority).toBe('CRITICAL');
      expect(critRes.priorityExplanation).toBe(
        'Safety risk and essential service outage were reported.'
      );
    });

    test('orders active indicators in weight-descending order for 3+ indicators', () => {
      const res = computePriority({
        functionalityLoss: true,
        safetyRisk: true,
        affectsMultipleRooms: true,
      });
      expect(res.score).toBe(7);
      expect(res.suggestedPriority).toBe('CRITICAL');
      expect(res.priorityExplanation).toBe(
        'Safety risk, affects multiple rooms and loss of functionality were reported.'
      );
    });
  });

  describe('SLA deadlines and tightening', () => {
    const cycleStart = new Date('2026-10-20T10:00:00.000Z');

    test('computes correct response and resolution deadlines from SLA targets', () => {
      const { responseDueAt, resolutionDueAt } = computeDeadlines({
        cycleStart,
        priority: 'CRITICAL',
        slaTargets: DEFAULT_SLA_TARGETS,
      });
      // CRITICAL: 120 min response, 480 min resolution
      expect(responseDueAt.toISOString()).toBe('2026-10-20T12:00:00.000Z');
      expect(resolutionDueAt.toISOString()).toBe('2026-10-20T18:00:00.000Z');
    });

    test('tightens deadlines when new candidate deadlines are earlier', () => {
      const existingResponse = new Date('2026-10-20T18:00:00.000Z');
      const existingResolution = new Date('2026-10-22T10:00:00.000Z');

      const tightened = tightenDeadlines({
        existingResponseDueAt: existingResponse,
        existingResolutionDueAt: existingResolution,
        cycleStart,
        newPriority: 'CRITICAL',
        slaTargets: DEFAULT_SLA_TARGETS,
      });

      // CRITICAL response is 12:00, earlier than 18:00
      expect(tightened.responseDueAt.toISOString()).toBe(
        '2026-10-20T12:00:00.000Z'
      );
      // CRITICAL resolution is 18:00, earlier than 22nd
      expect(tightened.resolutionDueAt.toISOString()).toBe(
        '2026-10-20T18:00:00.000Z'
      );
    });

    test('never relaxes deadlines when candidate deadline is later', () => {
      const earlyResponse = new Date('2026-10-20T11:00:00.000Z');
      const earlyResolution = new Date('2026-10-20T15:00:00.000Z');

      const result = tightenDeadlines({
        existingResponseDueAt: earlyResponse,
        existingResolutionDueAt: earlyResolution,
        cycleStart,
        newPriority: 'LOW',
        slaTargets: DEFAULT_SLA_TARGETS,
      });

      // LOW response is 24h later, but existing early response is preserved
      expect(result.responseDueAt.toISOString()).toBe(
        earlyResponse.toISOString()
      );
      expect(result.resolutionDueAt.toISOString()).toBe(
        earlyResolution.toISOString()
      );
    });
  });

  describe('canonical payload hash', () => {
    const validPayload = {
      title: '  Ceiling fan is vibrating loudly  ',
      description: '  The ceiling fan vibrates vigorously on high speeds.  ',
      categoryId: '670000000000000000000001',
      location: {
        type: 'ROOM',
        hostelId: '670000000000000000000010',
        blockId: '670000000000000000000020',
        roomId: '670000000000000000000030',
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: false,
        functionalityLoss: true,
      },
      attachmentIds: ['670000000000000000000100', '670000000000000000000099'],
    };

    test('computes 64-char lowercase hex SHA-256 hash', () => {
      const hash = computeCanonicalPayloadHash(validPayload);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('attachment IDs order does not change hash', () => {
      const hash1 = computeCanonicalPayloadHash(validPayload);
      const permuted = {
        ...validPayload,
        attachmentIds: ['670000000000000000000099', '670000000000000000000100'],
      };
      const hash2 = computeCanonicalPayloadHash(permuted);
      expect(hash1).toBe(hash2);
    });

    test('trimming is canonicalized (extra spaces produce same hash)', () => {
      const hash1 = computeCanonicalPayloadHash(validPayload);
      const withExtraSpaces = {
        ...validPayload,
        title: 'Ceiling fan is vibrating loudly',
        description: 'The ceiling fan vibrates vigorously on high speeds.',
      };
      const hash2 = computeCanonicalPayloadHash(withExtraSpaces);
      expect(hash1).toBe(hash2);
    });

    test('different field produces different hash', () => {
      const hash1 = computeCanonicalPayloadHash(validPayload);
      const altered = {
        ...validPayload,
        indicators: { ...validPayload.indicators, safetyRisk: true },
      };
      const hash2 = computeCanonicalPayloadHash(altered);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getAllowedActions', () => {
    const studentUser = { _id: 'stu-1', role: 'STUDENT' };
    const staffUser = { _id: 'sta-1', role: 'STAFF' };
    const adminUser = {
      _id: 'adm-1',
      role: 'ADMIN',
      adminHostelIds: ['hos-1'],
    };

    test('student owner on SUBMITTED complaint gets EDIT and COMMENT', () => {
      const complaint = {
        ownerId: 'stu-1',
        hostelId: 'hos-1',
        status: 'SUBMITTED',
      };
      const actions = getAllowedActions(complaint, studentUser);
      expect(actions).toContain('EDIT');
      expect(actions).toContain('COMMENT');
    });

    test('student owner on RESOLVED complaint gets CLOSE, REOPEN, FEEDBACK, COMMENT within window', () => {
      const complaint = {
        ownerId: 'stu-1',
        hostelId: 'hos-1',
        status: 'RESOLVED',
        reopenUntil: new Date(Date.now() + 86400000),
        reopenCount: 0,
      };
      const actions = getAllowedActions(complaint, studentUser);
      expect(actions).toContain('CLOSE');
      expect(actions).toContain('REOPEN');
      expect(actions).toContain('FEEDBACK');
      expect(actions).toContain('COMMENT');
    });

    test('staff assignee on ASSIGNED complaint gets START_WORK and COMMENT', () => {
      const complaint = {
        assigneeId: 'sta-1',
        hostelId: 'hos-1',
        status: 'ASSIGNED',
      };
      const actions = getAllowedActions(complaint, staffUser);
      expect(actions).toContain('START_WORK');
      expect(actions).toContain('COMMENT');
    });

    test('admin in scoped hostel on SUBMITTED complaint gets TRIAGE, REJECT, CHANGE_PRIORITY, COMMENT', () => {
      const complaint = {
        hostelId: 'hos-1',
        status: 'SUBMITTED',
      };
      const actions = getAllowedActions(complaint, adminUser);
      expect(actions).toContain('TRIAGE');
      expect(actions).toContain('REJECT');
      expect(actions).toContain('CHANGE_PRIORITY');
      expect(actions).toContain('COMMENT');
    });
  });
});
