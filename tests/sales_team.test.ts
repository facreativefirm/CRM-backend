import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { salesTeamService } from '../src/services/salesTeam.service';
import prisma from '../src/config/database';
import { UserType, ProspectStatus, VerificationStatus, WithdrawalStatus } from '@prisma/client';

describe('Sales Team System Logic', () => {
    let testMemberId: number;
    let testUserId: number;
    let testProspectId: number;
    let testAdminId: number;

    beforeAll(async () => {
        // Setup Test Data
        const admin = await prisma.user.create({
            data: {
                username: `testadmin_${Date.now()}`,
                email: `admin_${Date.now()}@test.com`,
                passwordHash: 'hash',
                firstName: 'Admin',
                lastName: 'User',
                userType: UserType.SUPER_ADMIN
            }
        });
        testAdminId = admin.id;

        const user = await prisma.user.create({
            data: {
                username: `salesrep_${Date.now()}`,
                email: `sales_${Date.now()}@test.com`,
                passwordHash: 'hash',
                firstName: 'Sales',
                lastName: 'Rep',
                userType: UserType.CLIENT
            }
        });
        testUserId = user.id;

        const member = await prisma.salesTeamMember.create({
            data: {
                userId: testUserId,
                territory: 'Test Territory'
            }
        });
        testMemberId = member.id;
    });

    afterAll(async () => {
        // Cleanup - In a real prod DB we'd be more careful, but for this exercise:
        // Delete in correct order to respect FKs
        await prisma.pointTransaction.deleteMany({ where: { salesMemberId: testMemberId } });
        await prisma.proofSubmission.deleteMany({ where: { submittedById: testMemberId } });
        await prisma.prospectClient.deleteMany({ where: { salesMemberId: testMemberId } });
        await prisma.withdrawalRequest.deleteMany({ where: { salesMemberId: testMemberId } });
        await prisma.salesTeamMember.delete({ where: { id: testMemberId } });
        await prisma.user.deleteMany({ where: { id: { in: [testUserId, testAdminId] } } });
    });

    test('Verification: Award Points on Prospect Approval', async () => {
        // 1. Create a prospect
        const prospect = await prisma.prospectClient.create({
            data: {
                salesMemberId: testMemberId,
                companyName: 'Test Corp',
                contactPerson: 'John Doe',
                email: `prospect_${Date.now()}@test.com`,
                phone: '123456789',
                status: ProspectStatus.PENDING_VERIFICATION
            }
        });
        testProspectId = prospect.id;

        // 2. Award Points
        await salesTeamService.awardProspectPoints(testProspectId, testAdminId);

        // 3. Verify member points
        const updatedMember = await prisma.salesTeamMember.findUnique({ where: { id: testMemberId } });
        expect(Number(updatedMember?.availablePoints)).toBe(1);
        expect(updatedMember?.totalPoints.toNumber()).toBe(1);

        // 4. Verify transaction created
        const tx = await prisma.pointTransaction.findFirst({
            where: { prospectId: testProspectId }
        });
        expect(tx).toBeDefined();
        expect(tx?.points.toNumber()).toBe(1);
    });

    test('Conversion: Award Bonus Points on Conversion', async () => {
        // 1. Create a real client to avoid FK error
        const clientUser = await prisma.user.create({
            data: {
                username: `client_${Date.now()}`,
                email: `client_${Date.now()}@test.com`,
                passwordHash: 'hash',
                userType: UserType.CLIENT
            }
        });
        const client = await prisma.client.create({ data: { userId: clientUser.id } });

        // 2. Award conversion bonus
        await salesTeamService.awardConversionBonus(testProspectId, client.id);

        // 2. Verify points (1 from entry + 10 from conversion = 11)
        const updatedMember = await prisma.salesTeamMember.findUnique({ where: { id: testMemberId } });
        expect(Number(updatedMember?.availablePoints)).toBe(11);
        expect(updatedMember?.totalConversions).toBe(1);
        expect(updatedMember?.conversionRate.toNumber()).toBeGreaterThan(0);
    });

    test('Fraud: Deduct Penalty on Fraud Flag', async () => {
        // 1. Create fraudulent prospect
        const fraudProspect = await prisma.prospectClient.create({
            data: {
                salesMemberId: testMemberId,
                companyName: 'Fake Corp',
                contactPerson: 'Scammer',
                email: `fraud_${Date.now()}@test.com`,
                phone: '000000000',
                status: ProspectStatus.PENDING_VERIFICATION
            }
        });

        // 2. Flag as fraud
        await salesTeamService.flagFraud(fraudProspect.id, 'Stolen identity', testAdminId);

        // 3. Verify deduction (11 - 10 = 1)
        const updatedMember = await prisma.salesTeamMember.findUnique({ where: { id: testMemberId } });
        expect(Number(updatedMember?.availablePoints)).toBe(1);
        expect(updatedMember?.fraudCount).toBe(1);
    });

    test('Withdrawal: Lock points and process payout', async () => {
        // 1. Request withdrawal
        const request = await salesTeamService.createWithdrawalRequest(testMemberId, 1, 'BANK_TRANSFER', { acc: '123' });

        // 2. Points should be locked (1 - 1 = 0)
        let member = await prisma.salesTeamMember.findUnique({ where: { id: testMemberId } });
        expect(Number(member?.availablePoints)).toBe(0);

        // 3. Process as Paid
        await salesTeamService.processWithdrawal(request.id, testAdminId, WithdrawalStatus.PAID, 'Paid via bank', 'TXN123');

        // 4. Verify withdrawn points incremented
        member = await prisma.salesTeamMember.findUnique({ where: { id: testMemberId } });
        expect(Number(member?.withdrawnPoints)).toBe(1);
    });
});
