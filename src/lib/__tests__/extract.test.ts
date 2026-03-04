import { describe, it, expect } from 'vitest';

import { extractCpm } from '../extract';
import { sectionizePrd } from '../sectionize';

// Helper to extract problem statement from a PRD text
function extractProblemStatement(prdText: string): string {
  const sectionMap = sectionizePrd(prdText, 'test-prd.md');
  const cpm = extractCpm({ sectionMap, runId: 'test-run' });
  return cpm.intent.problem.statement;
}

// Helper to extract primary outcome from a PRD text
function extractPrimaryOutcome(prdText: string): string {
  const sectionMap = sectionizePrd(prdText, 'test-prd.md');
  const cpm = extractCpm({ sectionMap, runId: 'test-run' });
  return cpm.intent.goal.primary_outcome;
}

describe('Problem Statement Extraction', () => {
  describe('Focus PRD - Prioritization Tool', () => {
    const focusPrd = `
# Focus - The Prioritization Tool

## Overview

### Problem
Leaders and teams across the organization lack a single, trusted way to see and agree on priorities. 
Today, priorities are scattered across spreadsheets, documents, and conversations. This causes:
- Misalignment between teams on what matters most
- Duplicated effort as teams work on similar things without knowing
- Slow decisions because there's no shared view of priorities
- Stalled initiatives waiting for unclear approvals

### Why Now
The company has grown significantly. Without a centralized prioritization view, we risk wasting resources on low-impact work while critical initiatives languish.

## Proposed Solution

Focus allows a leader to say "here are my team's top priorities" and everyone can see it. The tool provides:
- A single dashboard view of all priorities
- Ability to set and communicate priorities
- Track progress against priorities
`;

    it('should extract a problem-focused statement', () => {
      const problemStatement = extractProblemStatement(focusPrd);
      
      // Should contain the core problem idea
      expect(problemStatement.toLowerCase()).toMatch(/lack|no single|scattered|misalign/);
    });

    it('should mention the key problem: lack of single trusted way to see and agree on priorities', () => {
      const problemStatement = extractProblemStatement(focusPrd);
      
      // Should contain the key concept of lacking unified priorities
      expect(problemStatement.toLowerCase()).toMatch(/lack|priorities|trusted|single/);
    });

    it('should NOT contain solution phrasing like "Focus allows"', () => {
      const problemStatement = extractProblemStatement(focusPrd);
      
      // Should not contain solution-focused language
      expect(problemStatement).not.toMatch(/focus allows/i);
      expect(problemStatement).not.toMatch(/this tool will/i);
      expect(problemStatement).not.toMatch(/we will build/i);
    });

    it('should NOT start with "Key challenges include"', () => {
      const problemStatement = extractProblemStatement(focusPrd);
      
      expect(problemStatement).not.toMatch(/^key challenges include/i);
    });

    it('should NOT contain repetitive words like "Potential, Potential"', () => {
      const problemStatement = extractProblemStatement(focusPrd);
      
      // Check for duplicated consecutive words
      expect(problemStatement).not.toMatch(/\b(\w+),?\s+\1\b/i);
    });

    it('should be concise (max 320 characters)', () => {
      const problemStatement = extractProblemStatement(focusPrd);
      
      expect(problemStatement.length).toBeLessThanOrEqual(320);
    });
  });

  describe('PRD with explicit Problem section', () => {
    const prdWithExplicitProblem = `
# Product Brief

## Problem
Teams struggle to track their OKRs because the current process is entirely manual. 
This leads to outdated information and missed deadlines.

## Solution
We will build an automated OKR tracking system.
`;

    it('should extract from explicit Problem section', () => {
      const problemStatement = extractProblemStatement(prdWithExplicitProblem);
      
      expect(problemStatement.toLowerCase()).toMatch(/struggle|manual|outdated|missed/);
    });

    it('should NOT include solution content', () => {
      const problemStatement = extractProblemStatement(prdWithExplicitProblem);
      
      expect(problemStatement).not.toMatch(/we will build/i);
      expect(problemStatement).not.toMatch(/automated okr tracking/i);
    });
  });

  describe('PRD with Problem/Opportunity section', () => {
    const prdWithProblemOpportunity = `
# Initiative PRD

## Understand It

### Problem/Opportunity
There is no centralized system for managing feature requests. Product managers spend hours each week collecting feedback from disparate sources. This causes delays in prioritization and missed customer insights.

### Goals
Reduce time spent on feedback collection by 50%.
`;

    it('should extract from Problem/Opportunity subsection', () => {
      const problemStatement = extractProblemStatement(prdWithProblemOpportunity);
      
      expect(problemStatement.toLowerCase()).toMatch(/no centralized|disparate|delays|missed/);
    });
  });

  describe('PRD with Why Now section', () => {
    const prdWithWhyNow = `
# Product Update

## Why Now
The existing reporting system is breaking under load. We're seeing 3x increase in errors and customers are complaining about slow dashboard loads. If we don't act now, we risk losing key accounts.

## What We Will Build
A new scalable reporting infrastructure.
`;

    it('should extract problem signals from Why Now section as fallback', () => {
      const problemStatement = extractProblemStatement(prdWithWhyNow);
      
      expect(problemStatement.toLowerCase()).toMatch(/breaking|errors|slow|risk|losing/);
    });
  });

  describe('PRD with bullet-point challenges', () => {
    const prdWithBullets = `
# Initiative

## Problem
We lack visibility into team capacity. Teams cannot easily share their availability. It's hard to forecast resource needs. This causes project delays and burnout.

## Proposed Solution
A resource planning tool that shows capacity.
`;

    it('should extract problem sentences from bullet points', () => {
      const problemStatement = extractProblemStatement(prdWithBullets);
      
      // Should contain problem signals
      expect(problemStatement.toLowerCase()).toMatch(/lack|cannot|hard to|causes/);
    });

    it('should prioritize problem language over solution language', () => {
      const problemStatement = extractProblemStatement(prdWithBullets);
      
      expect(problemStatement).not.toMatch(/resource planning tool/i);
    });
  });

  describe('PRD with Creators/Business format', () => {
    const prdWithCreatorsBusiness = `
# Product Brief

## Overview

## Creators
Artists cannot easily see how their music is performing across platforms.
They lack real-time insights and spend hours manually checking stats.

## Business
The company is losing potential upsell opportunities because we don't surface performance data that would encourage artists to promote their work more.
`;

    it('should extract from Creators/Business sections', () => {
      const problemStatement = extractProblemStatement(prdWithCreatorsBusiness);
      
      expect(problemStatement.toLowerCase()).toMatch(/cannot|lack|losing|don't/);
    });
  });

  describe('Problem statement cleaning', () => {
    const prdWithNoisyProblem = `
# Initiative

## Problem
Key challenges include: Data inconsistency, Data inconsistency, slow queries.
The main issues are fragmented data sources and unreliable reports.
`;

    it('should remove "Key challenges include:" prefix', () => {
      const problemStatement = extractProblemStatement(prdWithNoisyProblem);
      
      expect(problemStatement).not.toMatch(/^key challenges include/i);
    });

    it('should deduplicate repeated words', () => {
      const problemStatement = extractProblemStatement(prdWithNoisyProblem);
      
      // Should not have "Data inconsistency, Data inconsistency"
      const matches = problemStatement.match(/data inconsistency/gi) ?? [];
      expect(matches.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty PRD gracefully', () => {
      const problemStatement = extractProblemStatement('');
      
      // Should return fallback message
      expect(problemStatement).toBeTruthy();
    });

    it('should handle PRD with no clear problem section', () => {
      const prdNoProblem = `
# Feature

## Description
This is a feature description.

## Implementation
Some implementation details.
`;
      const problemStatement = extractProblemStatement(prdNoProblem);
      
      // Should have some fallback content
      expect(problemStatement).toBeTruthy();
    });
  });

  describe('Strategy & Scope Doc - Numbered challenge section', () => {
    const strategyDoc = `
# Launch Fitness - Strategy Doc

**Strategy Name:** Launch Fitness
**Doc Type:** Strategy Doc

## 1. TL;DR

Our aim is to increase Premium value by launching Fitness App in early 2026 with a licensed launch partner.

## 2. Challenge

At Premium App's scale, sustainable subscriber growth is driven primarily by churn reduction. We know the clearest lever for mitigating churn is adding incremental, high-perceived-value content that users return to weekly. In "workout moments", free, ad-supported options are plentiful; simply adding generic fitness content will not move the needle. We must create distance from free alternatives by delivering exclusive programming and a purpose-built fitness experience.

## 3. The Strategy

Launch with the best content provider in the fitness industry.

## 4. Impact/Metrics

- 2m Premium users activated into Fitness content by end of Q2 2026
`;

    it('should extract problem from numbered "Challenge" section', () => {
      const problemStatement = extractProblemStatement(strategyDoc);

      expect(problemStatement.toLowerCase()).toMatch(/churn|growth|free.*alternatives|needle/);
    });

    it('should not return the fallback "not found" message', () => {
      const problemStatement = extractProblemStatement(strategyDoc);

      expect(problemStatement).not.toMatch(/not found/i);
    });
  });
});

describe('Primary Outcome Extraction', () => {
  describe('Focus PRD - Prioritization Tool', () => {
    const focusPrd = `
# Focus - The Prioritization Tool

## Overview

### Problem
Leaders and teams across the organization lack a single, trusted way to see and agree on priorities.
Today, priorities are scattered across spreadsheets, documents, and conversations.

## Outcome
Prioritization becomes explicit, shared, and durable across the organization. Teams gain real-time visibility into portfolio health, enabling clear trade-offs and sustained focus on the highest-value work over time.

## Goals
1. Every Engineering Squad Lead must be able to point to a "Top 10" card in Focus
2. Product Managers can see all priorities in one dashboard
3. Leaders can make principled trade-offs with shared context

## Benefits
- Shared clarity on what matters most
- Reduced coordination cost across teams
- Faster decisions with explicit trade-offs
- Sustained alignment over time

## Proposed Solution
Focus allows a leader to say "here are my team's top priorities" and everyone can see it.
`;

    it('should extract organizational-level outcome, not role-specific requirement', () => {
      const outcome = extractPrimaryOutcome(focusPrd);
      
      // Should contain organizational outcome signals
      expect(outcome.toLowerCase()).toMatch(/explicit|shared|clarity|alignment|visibility|trade-?offs?|sustained|durable|organization/);
    });

    it('should NOT contain role-specific "must be able to" language', () => {
      const outcome = extractPrimaryOutcome(focusPrd);
      
      expect(outcome).not.toMatch(/must\s+be\s+able\s+to/i);
      expect(outcome).not.toMatch(/every\s+\w+\s+(?:squad\s+)?lead/i);
    });

    it('should NOT reference specific UI artifacts like "Top 10 card"', () => {
      const outcome = extractPrimaryOutcome(focusPrd);
      
      expect(outcome).not.toMatch(/top\s+10\s+card/i);
      expect(outcome).not.toMatch(/dashboard\s+(?:shows?|displays?)/i);
    });

    it('should NOT contain solution phrasing like "Focus allows"', () => {
      const outcome = extractPrimaryOutcome(focusPrd);
      
      expect(outcome).not.toMatch(/focus\s+allows/i);
      expect(outcome).not.toMatch(/this\s+tool\s+(?:will|allows?)/i);
    });

    it('should NOT contain parenthetical goal counts like "(plus 8 additional goals...)"', () => {
      const outcome = extractPrimaryOutcome(focusPrd);
      
      expect(outcome).not.toMatch(/\(plus\s+\d+\s+additional/i);
    });

    it('should be concise (max 400 characters)', () => {
      const outcome = extractPrimaryOutcome(focusPrd);
      
      expect(outcome.length).toBeLessThanOrEqual(400);
    });
  });

  describe('PRD with explicit Outcome section', () => {
    const prdWithOutcome = `
# Product Brief

## Problem
Teams waste time in status meetings because project updates are scattered.

## Outcome
Project status becomes automatically visible to all stakeholders, reducing meeting overhead by 50% and enabling faster decisions.

## Goals
- Automate status collection
- Build a status dashboard
`;

    it('should extract from explicit Outcome section', () => {
      const outcome = extractPrimaryOutcome(prdWithOutcome);
      
      expect(outcome.toLowerCase()).toMatch(/visible|automatically|reducing|faster|decisions/);
    });

    it('should NOT include implementation details from Goals', () => {
      const outcome = extractPrimaryOutcome(prdWithOutcome);
      
      expect(outcome).not.toMatch(/automate\s+status\s+collection/i);
      expect(outcome).not.toMatch(/build\s+a\s+(?:status\s+)?dashboard/i);
    });
  });

  describe('PRD with Benefits section', () => {
    const prdWithBenefits = `
# Initiative

## Problem
Data silos prevent cross-team collaboration.

## Benefits
Cross-team collaboration becomes seamless. Teams gain shared visibility into each other's work, reducing duplicated effort and enabling faster knowledge transfer across the organization.

## Requirements
- API endpoint for data sharing
- UI component for viewing shared data
`;

    it('should extract organizational outcome from Benefits section', () => {
      const outcome = extractPrimaryOutcome(prdWithBenefits);
      
      expect(outcome.toLowerCase()).toMatch(/collaboration|shared|visibility|reducing|organization|seamless/);
    });

    it('should NOT include implementation requirements', () => {
      const outcome = extractPrimaryOutcome(prdWithBenefits);
      
      expect(outcome).not.toMatch(/api\s+endpoint/i);
      expect(outcome).not.toMatch(/ui\s+component/i);
    });
  });

  describe('PRD with Why This Matters section', () => {
    const prdWithWhyMatters = `
# Product Update

## Problem
Manual invoice processing is slow and error-prone.

## Why This Matters
Finance teams will be able to close books 3 days faster. The organization gains real-time visibility into cash flow, enabling better strategic decisions and reduced financial risk.

## Solution
Automated invoice processing system.
`;

    it('should extract outcome from Why This Matters section', () => {
      const outcome = extractPrimaryOutcome(prdWithWhyMatters);
      
      expect(outcome.toLowerCase()).toMatch(/visibility|faster|strategic|decisions|organization/);
    });
  });

  describe('PRD with Opportunity section', () => {
    const prdWithOpportunity = `
# Initiative

## Opportunity
By centralizing customer feedback, we can transform how the organization learns from users. Teams gain shared insights that drive better product decisions and faster iteration on what customers actually need.

## Goals
- Build feedback aggregation tool
- Create analytics dashboard
`;

    it('should extract from Opportunity section', () => {
      const outcome = extractPrimaryOutcome(prdWithOpportunity);
      
      expect(outcome.toLowerCase()).toMatch(/transform|organization|shared|insights|better|faster/);
    });

    it('should prioritize outcome over implementation goals', () => {
      const outcome = extractPrimaryOutcome(prdWithOpportunity);
      
      expect(outcome).not.toMatch(/build\s+feedback\s+aggregation/i);
      expect(outcome).not.toMatch(/create\s+analytics\s+dashboard/i);
    });
  });

  describe('PRD with only Goals (no explicit Outcome)', () => {
    const prdGoalsOnly = `
# Feature

## Problem
Teams lack visibility into project dependencies.

## Goals
1. Reduced coordination overhead across teams
2. Shared visibility into cross-project dependencies
3. Faster resolution of blocking issues
4. Engineers must be able to see dependency graphs
`;

    it('should synthesize outcome from organizational-level goals', () => {
      const outcome = extractPrimaryOutcome(prdGoalsOnly);
      
      // Should prefer organizational outcomes over role-specific ones
      expect(outcome.toLowerCase()).toMatch(/reduced|shared|visibility|faster|coordination/);
    });

    it('should deprioritize role-specific requirements', () => {
      const outcome = extractPrimaryOutcome(prdGoalsOnly);
      
      // Should not lead with "Engineers must be able to"
      expect(outcome).not.toMatch(/^engineers?\s+must\s+be\s+able\s+to/i);
    });
  });

  describe('Outcome statement cleaning', () => {
    const prdWithNoisyOutcome = `
# Initiative

## Outcome
Goal: Teams achieve shared clarity.
Benefit: Reduced coordination cost.
The organization gains sustained alignment over time.
`;

    it('should remove leading labels like "Goal:" and "Benefit:"', () => {
      const outcome = extractPrimaryOutcome(prdWithNoisyOutcome);
      
      expect(outcome).not.toMatch(/^goal:/i);
      expect(outcome).not.toMatch(/^benefit:/i);
    });

    it('should produce clean, readable outcome text', () => {
      const outcome = extractPrimaryOutcome(prdWithNoisyOutcome);
      
      // Should contain the key outcome concepts
      expect(outcome.toLowerCase()).toMatch(/shared|clarity|alignment|coordination|organization/);
    });
  });

  describe('Edge cases for outcomes', () => {
    it('should handle PRD with no clear outcome section', () => {
      const prdNoOutcome = `
# Feature

## Description
This feature will do something.

## Implementation
Some implementation details.
`;
      const outcome = extractPrimaryOutcome(prdNoOutcome);
      
      // Should have some fallback content
      expect(outcome).toBeTruthy();
    });

    it('should handle empty PRD gracefully', () => {
      const outcome = extractPrimaryOutcome('');
      
      // Should return fallback message
      expect(outcome).toBeTruthy();
    });
  });
});

// Helper to extract jobs from a PRD text
function extractJobs(prdText: string): Array<{ job_id: string; description: string; trigger: string; success_outcome: string }> {
  const sectionMap = sectionizePrd(prdText, 'test-prd.md');
  const cpm = extractCpm({ sectionMap, runId: 'test-run' });
  return cpm.jobs;
}

// Helper to extract flows from a PRD text
function extractFlows(prdText: string): Array<{ flow_id: string; name: string; steps: Array<{ actor_id: string; action: string; result: string }> }> {
  const sectionMap = sectionizePrd(prdText, 'test-prd.md');
  const cpm = extractCpm({ sectionMap, runId: 'test-run' });
  return cpm.flows;
}

describe('Jobs to be Done Extraction', () => {
  describe('PRD with explicit JTBD section', () => {
    const prdWithJtbd = `
# Product Brief

## Problem
Users struggle to find relevant content.

## Jobs to be Done

1. Find relevant content quickly
   Trigger: User opens the app with a specific need
   Success: User finds what they need within 30 seconds

2. Save content for later
   Trigger: User finds interesting content but can't consume it now
   Success: Content is saved and easily retrievable

3. Share content with team
   Trigger: User finds valuable content the team should see
   Success: Team receives the content with context

## Solution
Build a smart search and save feature.
`;

    it('should extract all jobs from JTBD section', () => {
      const jobs = extractJobs(prdWithJtbd);
      
      expect(jobs.length).toBe(3);
    });

    it('should extract job descriptions verbatim', () => {
      const jobs = extractJobs(prdWithJtbd);
      
      expect(jobs[0]?.description).toMatch(/find relevant content quickly/i);
      expect(jobs[1]?.description).toMatch(/save content for later/i);
      expect(jobs[2]?.description).toMatch(/share content with team/i);
    });

    it('should extract triggers verbatim', () => {
      const jobs = extractJobs(prdWithJtbd);
      
      expect(jobs[0]?.trigger).toMatch(/user opens the app/i);
      expect(jobs[1]?.trigger).toMatch(/user finds interesting content/i);
      expect(jobs[2]?.trigger).toMatch(/user finds valuable content/i);
    });

    it('should extract success outcomes verbatim', () => {
      const jobs = extractJobs(prdWithJtbd);
      
      expect(jobs[0]?.success_outcome).toMatch(/user finds what they need/i);
      expect(jobs[1]?.success_outcome).toMatch(/content is saved/i);
      expect(jobs[2]?.success_outcome).toMatch(/team receives the content/i);
    });

    it('should preserve ordering from PRD', () => {
      const jobs = extractJobs(prdWithJtbd);
      
      // First job should be about finding content
      expect(jobs[0]?.description).toMatch(/find/i);
      // Second job should be about saving
      expect(jobs[1]?.description).toMatch(/save/i);
      // Third job should be about sharing
      expect(jobs[2]?.description).toMatch(/share/i);
    });
  });

  describe('PRD with bullet-point JTBD', () => {
    const prdWithBulletJtbd = `
# Feature

## Jobs to be Done

- View dashboard metrics
  Trigger: User needs to check performance
  Success: Metrics displayed accurately

- Export data to CSV
  Trigger: User needs data for external analysis
  Success: CSV file downloaded with all data
`;

    it('should extract jobs from bullet format', () => {
      const jobs = extractJobs(prdWithBulletJtbd);
      
      expect(jobs.length).toBe(2);
      expect(jobs[0]?.description).toMatch(/view dashboard metrics/i);
      expect(jobs[1]?.description).toMatch(/export data to csv/i);
    });
  });

  describe('PRD with incomplete JTBD (missing trigger/success)', () => {
    const prdIncompleteJtbd = `
# Feature

## Jobs to be Done

1. Generate monthly report
   Success: Report is generated and emailed

2. Configure notification settings
   Trigger: User wants to customize alerts
`;

    it('should still create jobs for incomplete entries', () => {
      const jobs = extractJobs(prdIncompleteJtbd);
      
      expect(jobs.length).toBe(2);
    });

    it('should create open questions for missing fields', () => {
      const sectionMap = sectionizePrd(prdIncompleteJtbd, 'test.md');
      const cpm = extractCpm({ sectionMap, runId: 'test' });
      
      // Should have open questions about missing trigger/success
      const missingFieldQuestions = cpm.review.open_questions.filter((q: string) => 
        q.includes('missing a trigger') || q.includes('missing a success outcome')
      );
      expect(missingFieldQuestions.length).toBeGreaterThan(0);
    });
  });
});

describe('Definitions of Done Extraction (Strategy/Scope docs)', () => {
  const strategyWithDoDs = `
# Playlist Messaging

Strategy Name: Playlist Messaging
Initiative Name: Playlist Messaging

## TL;DR
Make playlists more social by making it easier to share and join, creating habit loops, and integrating with Messaging.

## 3. Definitions of Done (according to DoD principles)

1
Invite flow improvements
Ship improvements to the invite flow for collaborative playlists, including fixing on-platform invites and addressing friction around expiring invites, to increase social playlist WAU
Soh Nagano
Must

2
Request to join
Build and test giving users the ability to "request" to join a playlist owned by a member of their trusted circle, to increase social playlist WAU
Soh Nagano
Must

3
Managing collaborator access
Increase users' level of control and understanding around managing collaborator access, including giving owners the ability to let collaborators invite others.
Sam Pucci
Must

5
Social playlist track row component
Ship a new social playlist track row that still signifies who added the item to the playlist but allows for new features like reactions.
Amy Zima
Must

8
Initiating messages from playlists
Ship ability to initiate individual and group messages from collaborative playlists, to increase social activity around playlists and grow messaging WAU
Rorey Jones
Must

9
Track reactions + messaging
Ship ability for users to react and start a conversation about a track in-context, to allow for deeper interactivity on-platform.
Soh Nagano
Must
`;

  it('should extract multiple DoDs from strategy/scope format', () => {
    const jobs = extractJobs(strategyWithDoDs);
    const dodJobs = jobs.filter((j) => j.job_id.startsWith('job_dod_'));
    expect(dodJobs.length).toBeGreaterThanOrEqual(5);
  });

  it('should translate DoDs to user-facing job descriptions', () => {
    const jobs = extractJobs(strategyWithDoDs);
    const inviteJob = jobs.find((j) => j.description.toLowerCase().includes('invite'));
    expect(inviteJob).toBeDefined();
    expect(inviteJob?.description).toMatch(/invite|collaborat/i);
    expect(inviteJob?.description).not.toMatch(/^ship\s/i);
  });
});

describe('User Flows Extraction', () => {
  describe('PRD with table-format User Flows', () => {
    const prdWithTableFlows = `
# Product Brief

## User Flows

| Actor | Action | Result |
|-------|--------|--------|
| User | Clicks login button | Login form displayed |
| User | Enters credentials | Credentials validated |
| System | Generates session token | User redirected to dashboard |
`;

    it('should extract flow from table format', () => {
      const flows = extractFlows(prdWithTableFlows);
      
      expect(flows.length).toBeGreaterThan(0);
    });

    it('should extract all steps from table', () => {
      const flows = extractFlows(prdWithTableFlows);
      const flow = flows[0];
      
      expect(flow?.steps.length).toBe(3);
    });

    it('should extract actors verbatim', () => {
      const flows = extractFlows(prdWithTableFlows);
      const steps = flows[0]?.steps || [];
      
      expect(steps[0]?.actor_id).toBe('User');
      expect(steps[1]?.actor_id).toBe('User');
      expect(steps[2]?.actor_id).toBe('System');
    });

    it('should extract actions verbatim', () => {
      const flows = extractFlows(prdWithTableFlows);
      const steps = flows[0]?.steps || [];
      
      expect(steps[0]?.action).toMatch(/clicks login button/i);
      expect(steps[1]?.action).toMatch(/enters credentials/i);
      expect(steps[2]?.action).toMatch(/generates session token/i);
    });

    it('should extract results verbatim', () => {
      const flows = extractFlows(prdWithTableFlows);
      const steps = flows[0]?.steps || [];
      
      expect(steps[0]?.result).toMatch(/login form displayed/i);
      expect(steps[1]?.result).toMatch(/credentials validated/i);
      expect(steps[2]?.result).toMatch(/user redirected/i);
    });
  });

  describe('PRD with numbered-step User Flows', () => {
    const prdWithNumberedFlows = `
# Feature

## User Flows

### Happy Path

1. User opens application
2. User selects file to upload
3. System validates file format
4. System processes file
5. User sees confirmation message
`;

    it('should extract flow with steps', () => {
      const flows = extractFlows(prdWithNumberedFlows);
      
      expect(flows.length).toBeGreaterThan(0);
    });

    it('should extract steps from numbered list', () => {
      const flows = extractFlows(prdWithNumberedFlows);
      // Find the Happy Path flow or the main flow
      const flow = flows.find(f => f.name.includes('Happy') || f.name.includes('User'));
      
      expect(flow?.steps.length).toBeGreaterThanOrEqual(3);
    });

    it('should preserve step ordering', () => {
      const flows = extractFlows(prdWithNumberedFlows);
      const flow = flows.find(f => f.name.includes('Happy') || f.name.includes('User'));
      const steps = flow?.steps || [];
      
      // First step should be about opening
      expect(steps[0]?.action).toMatch(/open/i);
    });
  });

  describe('PRD with multiple flow sections', () => {
    const prdWithMultipleFlows = `
# Feature

## Happy Path

1. User enters username
2. User enters password
3. User clicks submit

## Error Path

1. User enters invalid credentials
2. System shows error message
3. User retries login
`;

    it('should extract multiple flows from separate sections', () => {
      const flows = extractFlows(prdWithMultipleFlows);
      
      expect(flows.length).toBeGreaterThanOrEqual(2);
    });

    it('should preserve flow names from section titles', () => {
      const flows = extractFlows(prdWithMultipleFlows);
      const flowNames = flows.map(f => f.name.toLowerCase());
      
      expect(flowNames.some(n => n.includes('happy') || n.includes('path'))).toBe(true);
    });
  });

  describe('PRD without explicit flows (fallback)', () => {
    const prdWithoutFlows = `
# Feature

## Problem
Something needs to be done.

## Solution
We will build something.
`;

    it('should generate fallback flows when no explicit section exists', () => {
      const flows = extractFlows(prdWithoutFlows);
      
      // Should have at least a fallback flow
      expect(flows.length).toBeGreaterThan(0);
    });
  });

  describe('PRD with structured User Stories (enterprise format)', () => {
    const prdWithStructuredStories = `
# S4C/SPA Booking

## Preamble
From Enterprise Platform we want to be able to load earnings into Analytics and then aggregate.

## User Stories for Content Accounting

User Story 1: By the Book
As an Accountant and Tax Expert, I want the Cost of Revenue, Payments, Tax, FX, to be booked correctly into Netsuite, so that we can run all of our dependent accounting processes.

User Story 2: Calculation Review and Approve
As an Accountant, I want the S4C earnings calculations that are approved to be automatically prepared for booking, so that I don't have to wait or manually trigger the booking preparation.
What I see: Two new runtype=MEC calculations appear in Enterprise Platform, ready for my review.
My Action: I press 'Approve' in Enterprise Platform.
System Action: Access to the approval function is restricted to specific user groups. As soon as the final approver hits 'Approve', the system automatically creates a new Booking object.
Timing: ~10 minutes to 60 minutes.

User Story 3: Booking Review and Approve
As an Accountant, I want to review the prepared earnings booking before it is posted into Analytics, so that I can ensure the accuracy of financial data in both systems.
Trigger: Calculation is approved.
What I see: A Prepared booking in the S4C Bookings tab.
My Action: I review the booking details and click Approve.
System Action: The system loads the earnings into Analytics. Status updates to Completed upon success.
Timing: ~5 minutes.

User Story 4: Booking Troubleshooting
As an Accountant, I want to see clear error messages when a booking fails and have the ability to retry the ingestion, so that I can resolve transient system issues without needing engineering intervention.
Error Visibility: If a booking fails, the UI displays a readable error message.
Action - Retry: A Retry Ingest button is available for bookings in the Failed state.
Action - Partial Failures: If a batch partially uploads, the system clearly identifies which specific entries failed.
`;

    it('should extract jobs from structured user story blocks', () => {
      const jobs = extractJobs(prdWithStructuredStories);

      // Should find at least 4 user stories as jobs
      expect(jobs.length).toBeGreaterThanOrEqual(4);
    });

    it('should capture the so that clause as success_outcome', () => {
      const jobs = extractJobs(prdWithStructuredStories);

      // Find the "By the Book" story
      const byTheBook = jobs.find(j => /booked correctly|Cost of Revenue/i.test(j.description));
      expect(byTheBook).toBeDefined();
      expect(byTheBook?.success_outcome).toMatch(/dependent accounting processes/i);
    });

    it('should extract Trigger field as job trigger', () => {
      const jobs = extractJobs(prdWithStructuredStories);

      // Find story 3 which has an explicit Trigger
      const bookingReview = jobs.find(j => /review the prepared earnings booking/i.test(j.description));
      expect(bookingReview).toBeDefined();
      expect(bookingReview?.trigger).toMatch(/calculation is approved/i);
    });

    it('should create flows with interaction steps from structured stories', () => {
      const flows = extractFlows(prdWithStructuredStories);
      
      // Should create flows from user stories
      expect(flows.length).toBeGreaterThanOrEqual(3);

      // Find the Booking Review flow (Story 3)
      const bookingFlow = flows.find(f => /Booking Review/i.test(f.name));
      expect(bookingFlow).toBeDefined();
      
      // Should have steps from Trigger, What I see, My Action, System Action
      expect(bookingFlow!.steps.length).toBeGreaterThanOrEqual(3);
    });

    it('should map actors from user story roles', () => {
      const flows = extractFlows(prdWithStructuredStories);
      
      const bookingFlow = flows.find(f => /Booking Review/i.test(f.name));
      if (bookingFlow) {
        // Should have both the role actor (Accountant) and System
        const actorNames = bookingFlow.steps.map(s => s.actor_id);
        expect(actorNames).toContain('System');
        // The Accountant role should appear
        expect(actorNames.some(a => /accountant/i.test(a))).toBe(true);
      }
    });

    it('should handle error handling stories with Error Visibility and Action patterns', () => {
      const flows = extractFlows(prdWithStructuredStories);
      
      // Find the troubleshooting flow (Story 4)
      const troubleshootFlow = flows.find(f => /troubleshoot/i.test(f.name));
      expect(troubleshootFlow).toBeDefined();

      if (troubleshootFlow) {
        // Should have steps from Error Visibility and Action patterns
        expect(troubleshootFlow.steps.length).toBeGreaterThanOrEqual(2);
        
        // Should capture error-related content
        const allActions = troubleshootFlow.steps.map(s => s.action).join(' ');
        expect(allActions).toMatch(/error|fail|retry/i);
      }
    });

    it('should include multi-word roles like Accountant and Tax Expert', () => {
      const jobs = extractJobs(prdWithStructuredStories);

      const byTheBook = jobs.find(j => /Cost of Revenue/i.test(j.description));
      expect(byTheBook).toBeDefined();
      expect(byTheBook?.description).toMatch(/Accountant and Tax Expert/i);
    });
  });
});
