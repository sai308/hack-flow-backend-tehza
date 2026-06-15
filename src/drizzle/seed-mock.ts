import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import {
  users,
  roles,
  userRoles,
  hackathons,
  stages,
  tracks,
  teams,
  teamMembers,
  projects,
  criteria,
  scores,
  judgeConflicts,
  teamApprovals
} from './schema';
import { eq } from 'drizzle-orm';

async function seedMockData() {
  console.log('🌱 Starting mock data seed...');
  
  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const db = drizzle(pool);

  try {
    // 1. Roles
    const [judgeRole] = await db.select().from(roles).where(eq(roles.name, 'judge')).limit(1);
    const [participantRole] = await db.select().from(roles).where(eq(roles.name, 'participant')).limit(1);

    if (!judgeRole || !participantRole) {
      throw new Error('Roles not found. Run npm run db:seed first.');
    }

    // 2. Users (Judges & Participants)
    console.log('Creating users...');
    const passwordHash = await bcrypt.hash('password123', 10);
    
    const mockUsers = await db.insert(users).values([
      { email: 'judge1@hackflow.dev', username: 'judge1', fullName: 'Judge One', passwordHash },
      { email: 'judge2@hackflow.dev', username: 'judge2', fullName: 'Judge Two', passwordHash },
      { email: 'user1@hackflow.dev', username: 'user1', fullName: 'Alice Smith', passwordHash },
      { email: 'user2@hackflow.dev', username: 'user2', fullName: 'Bob Jones', passwordHash },
      { email: 'user3@hackflow.dev', username: 'user3', fullName: 'Charlie Brown', passwordHash },
      { email: 'user4@hackflow.dev', username: 'user4', fullName: 'Diana Prince', passwordHash },
    ]).returning();

    const [judge1, judge2, user1, user2, user3, user4] = mockUsers;

    await db.insert(userRoles).values([
      { userId: judge1.id, roleId: judgeRole.id },
      { userId: judge2.id, roleId: judgeRole.id },
      { userId: user1.id, roleId: participantRole.id },
      { userId: user2.id, roleId: participantRole.id },
      { userId: user3.id, roleId: participantRole.id },
      { userId: user4.id, roleId: participantRole.id },
    ]);

    // 3. Hackathons
    console.log('Creating hackathons...');
    const now = new Date();
    const nextMonth = new Date(); nextMonth.setMonth(now.getMonth() + 1);
    const lastMonth = new Date(); lastMonth.setMonth(now.getMonth() - 1);
    
    const [activeHack, draftHack, archivedHack] = await db.insert(hackathons).values([
      {
        title: 'Global AI Hackathon 2026',
        subtitle: 'Build the future of AI',
        description: 'Join thousands of developers to build next-generation AI applications.',
        status: 'PUBLISHED',
        startDate: now,
        endDate: nextMonth,
        online: true,
        minTeamSize: 1,
        maxTeamSize: 4,
      },
      {
        title: 'Web3 Builders Draft',
        status: 'DRAFT',
        startDate: nextMonth,
        endDate: nextMonth,
      },
      {
        title: 'Legacy Codefest 2025',
        status: 'ARCHIVED',
        startDate: lastMonth,
        endDate: lastMonth,
      }
    ]).returning();

    // 4. Stages & Tracks for Active Hackathon
    console.log('Creating stages and tracks...');
    const [regStage, hackStage, judgeStage] = await db.insert(stages).values([
      { hackathonId: activeHack.id, name: 'Registration', orderIndex: 1, startDate: new Date(now.getTime() - 86400000), endDate: now },
      { hackathonId: activeHack.id, name: 'Hacking', orderIndex: 2, startDate: now, endDate: new Date(now.getTime() + 86400000 * 3) },
      { hackathonId: activeHack.id, name: 'Judging', orderIndex: 3, startDate: new Date(now.getTime() + 86400000 * 3), endDate: nextMonth },
    ]).returning();

    const [aiTrack, healthTrack] = await db.insert(tracks).values([
      { hackathonId: activeHack.id, name: 'Generative AI', description: 'Create tools using LLMs' },
      { hackathonId: activeHack.id, name: 'HealthTech', description: 'Solutions for healthcare' }
    ]).returning();

    // 5. Criteria
    const [crit1, crit2] = await db.insert(criteria).values([
      { trackId: aiTrack.id, name: 'Innovation', weight: '0.50', maxScore: '10.00' },
      { trackId: aiTrack.id, name: 'Technical Execution', weight: '0.50', maxScore: '10.00' },
    ]).returning();

    // 6. Teams
    console.log('Creating teams and projects...');
    const [teamA, teamB] = await db.insert(teams).values([
      { hackathonId: activeHack.id, trackId: aiTrack.id, name: 'Neural Knights', description: 'AI enthusiasts' },
      { hackathonId: activeHack.id, trackId: aiTrack.id, name: 'Data Dynamos', description: 'Data science pros' }
    ]).returning();

    // 7. Team Members
    await db.insert(teamMembers).values([
      { teamId: teamA.id, userId: user1.id, role: 'captain' },
      { teamId: teamA.id, userId: user2.id, role: 'participant' },
      { teamId: teamB.id, userId: user3.id, role: 'captain' },
      { teamId: teamB.id, userId: user4.id, role: 'participant' },
    ]);

    // 8. Team Approvals (Dashboard pending requests)
    await db.insert(teamApprovals).values([
      { teamId: teamA.id, status: 'APPROVED' },
      { teamId: teamB.id, status: 'PENDING' },
    ]);

    // 9. Projects
    const [projA, projB] = await db.insert(projects).values([
      { teamId: teamA.id, stageId: hackStage.id, status: 'SUBMITTED' },
      { teamId: teamB.id, stageId: hackStage.id, status: 'DRAFT' }
    ]).returning();

    // 10. Scores
    await db.insert(scores).values([
      { judgeId: judge1.id, projectId: projA.id, criteriaId: crit1.id, assessment: '8.50' },
      { judgeId: judge1.id, projectId: projA.id, criteriaId: crit2.id, assessment: '9.00' },
    ]);

    // 11. Judge Conflicts
    console.log('Creating judge conflicts...');
    await db.insert(judgeConflicts).values([
      { judgeId: judge2.id, teamId: teamA.id, reason: 'I know the team captain personally.' }
    ]);

    console.log('✅ Mock data seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding mock data:', error);
  } finally {
    await pool.end();
  }
}

seedMockData();
