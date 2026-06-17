// HR CRM: jobs, candidates, applications, interviews, offers, templates, onboarding, KEDO documents, AI scoring.
import { CRMRpcClient } from "./crm-rpc";
import type { HRApplication, HRCandidate, HRDashboardStats, HREmploymentDoc, HREmployerBrand, HRInterview, HRJob, HROffer, HROnboarding, HROnboardingTask, HRTemplate } from "./crm.types";

export class CRMHRMixin extends CRMRpcClient {
  async getHRJobs(status?: string): Promise<HRJob[]> {
    return this.rpcList<HRJob>('crm.get_hr_jobs', { p_status: status ?? null });
  }

  async createHRJob(job: Partial<HRJob>): Promise<HRJob> {
    const data = await this.rpcSingle<HRJob>('crm.create_hr_job', {
      p_title:            job.title ?? '',
      p_department:       job.department ?? null,
      p_team:             job.team ?? null,
      p_location:         job.location ?? null,
      p_employment_type:  job.employment_type ?? 'full_time',
      p_grade:            job.grade ?? null,
      p_salary_min:       job.salary_min ?? null,
      p_salary_max:       job.salary_max ?? null,
      p_salary_hidden:    job.salary_hidden ?? false,
      p_required_skills:  job.required_skills ?? [],
      p_preferred_skills: job.preferred_skills ?? [],
      p_experience_min:   job.experience_min ?? null,
      p_english_level:    job.english_level ?? null,
      p_description:      job.description ?? null,
      p_responsibilities: job.responsibilities ?? null,
      p_conditions:       job.conditions ?? null,
      p_status:           job.status ?? 'open',
      p_priority:         job.priority ?? 'normal',
      p_openings:         job.openings ?? 1,
      p_hiring_manager:   job.hiring_manager ?? null,
      p_deadline:         job.deadline ?? null,
    });
    if (!data) throw new Error('Failed to create HR job');
    return data;
  }

  async updateHRJob(id: string, updates: Partial<HRJob>): Promise<HRJob> {
    const data = await this.rpcSingle<HRJob>('crm.update_hr_job', {
      p_id:               id,
      p_title:            updates.title            ?? null,
      p_department:       updates.department       ?? null,
      p_grade:            updates.grade            ?? null,
      p_salary_min:       updates.salary_min       ?? null,
      p_salary_max:       updates.salary_max       ?? null,
      p_required_skills:  updates.required_skills  ?? null,
      p_preferred_skills: updates.preferred_skills ?? null,
      p_status:           updates.status           ?? null,
      p_priority:         updates.priority         ?? null,
      p_openings:         updates.openings         ?? null,
      p_description:      updates.description      ?? null,
      p_conditions:       updates.conditions       ?? null,
      p_deadline:         updates.deadline         ?? null,
    });
    if (!data) throw new Error('Failed to update HR job');
    return data;
  }

  async deleteHRJob(id: string): Promise<boolean> {
    const data = await this.rpcCall<unknown>('crm.delete_hr_job', { p_id: id });
    return Boolean(data);
  }

  // ─── HR: Candidates ───────────────────────────────────────────────────────

  async getHRCandidates(jobId?: string, blacklisted = false): Promise<HRCandidate[]> {
    return this.rpcList<HRCandidate>('crm.get_hr_candidates', {
      p_job_id:     jobId      ?? null,
      p_blacklisted: blacklisted,
    });
  }

  async createHRCandidate(c: Partial<HRCandidate>): Promise<HRCandidate> {
    const data = await this.rpcSingle<HRCandidate>('crm.create_hr_candidate', {
      p_name:              c.name ?? '',
      p_phone:             c.phone ?? null,
      p_email:             c.email ?? null,
      p_telegram_handle:   c.telegram_handle ?? null,
      p_linkedin_url:      c.linkedin_url ?? null,
      p_resume_url:        c.resume_url ?? null,
      p_current_company:   c.current_company ?? null,
      p_current_position:  c.current_position ?? null,
      p_current_salary:    c.current_salary ?? null,
      p_expected_salary:   c.expected_salary ?? null,
      p_experience_years:  c.experience_years ?? null,
      p_grade:             c.grade ?? null,
      p_skills:            c.skills ?? [],
      p_english_level:     c.english_level ?? null,
      p_city:              c.city ?? null,
      p_willing_to_relocate: c.willing_to_relocate ?? false,
      p_work_format:       c.work_format ?? 'any',
      p_source:            c.source ?? 'direct',
      p_tags:              c.tags ?? [],
      p_notes:             c.notes ?? null,
    });
    if (!data) throw new Error('Failed to create HR candidate');
    return data;
  }

  async updateHRCandidate(id: string, updates: Partial<HRCandidate>): Promise<HRCandidate> {
    const data = await this.rpcSingle<HRCandidate>('crm.update_hr_candidate', {
      p_id:              id,
      p_name:            updates.name             ?? null,
      p_phone:           updates.phone            ?? null,
      p_email:           updates.email            ?? null,
      p_expected_salary: updates.expected_salary  ?? null,
      p_grade:           updates.grade            ?? null,
      p_skills:          updates.skills           ?? null,
      p_source:          updates.source           ?? null,
      p_tags:            updates.tags             ?? null,
      p_notes:           updates.notes            ?? null,
      p_blacklisted:     updates.blacklisted      ?? null,
      p_blacklist_reason: updates.blacklist_reason ?? null,
      p_vip:             updates.vip              ?? null,
    });
    if (!data) throw new Error('Failed to update HR candidate');
    return data;
  }

  // ─── HR: Applications ─────────────────────────────────────────────────────

  async getHRApplications(jobId?: string, candidateId?: string, stage?: string): Promise<HRApplication[]> {
    return this.rpcList<HRApplication>('crm.get_hr_applications', {
      p_job_id:       jobId       ?? null,
      p_candidate_id: candidateId ?? null,
      p_stage:        stage       ?? null,
    });
  }

  async createHRApplication(jobId: string, candidateId: string, stage = 'new', notes?: string): Promise<HRApplication> {
    const data = await this.rpcSingle<HRApplication>('crm.create_hr_application', {
      p_job_id:          jobId,
      p_candidate_id:    candidateId,
      p_stage:           stage,
      p_recruiter_notes: notes ?? null,
    });
    if (!data) throw new Error('Failed to create HR application');
    return data;
  }

  async moveHRApplicationStage(id: string, stage: string, notes?: string, rejectReason?: string, score?: number): Promise<HRApplication> {
    const data = await this.rpcSingle<HRApplication>('crm.move_hr_application_stage', {
      p_id:            id,
      p_stage:         stage,
      p_notes:         notes         ?? null,
      p_reject_reason: rejectReason  ?? null,
      p_score:         score         ?? null,
    });
    if (!data) throw new Error('Failed to move HR application stage');
    return data;
  }

  // ─── HR: Interviews ───────────────────────────────────────────────────────

  async getHRInterviews(applicationId?: string): Promise<HRInterview[]> {
    return this.rpcList<HRInterview>('crm.get_hr_interviews', {
      p_application_id: applicationId ?? null,
      p_date_from: null,
    });
  }

  async createHRInterview(data: {
    applicationId: string;
    candidateId: string;
    jobId: string;
    type: string;
    scheduledAt: string;
    durationMin?: number;
    location?: string;
    meetingLink?: string;
    interviewers?: string[];
  }): Promise<HRInterview> {
    const result = await this.rpcSingle<HRInterview>('crm.create_hr_interview', {
      p_application_id: data.applicationId,
      p_candidate_id:   data.candidateId,
      p_job_id:         data.jobId,
      p_interview_type: data.type,
      p_scheduled_at:   data.scheduledAt,
      p_duration_min:   data.durationMin ?? 60,
      p_location:       data.location ?? null,
      p_meeting_link:   data.meetingLink ?? null,
      p_interviewers:   data.interviewers ?? [],
    });
    if (!result) throw new Error('Failed to create HR interview');
    return result;
  }

  async completeHRInterview(id: string, data: {
    scorecard?: HRScorecardItem[];
    overallScore?: number;
    recommendation?: string;
    feedback?: string;
  }): Promise<HRInterview> {
    const result = await this.rpcSingle<HRInterview>('crm.complete_hr_interview', {
      p_id:              id,
      p_scorecard:       data.scorecard       ?? [],
      p_overall_score:   data.overallScore    ?? null,
      p_recommendation:  data.recommendation  ?? null,
      p_feedback:        data.feedback        ?? null,
    });
    if (!result) throw new Error('Failed to complete HR interview');
    return result;
  }

  // ─── HR: Offers ───────────────────────────────────────────────────────────

  async createHROffer(data: {
    applicationId: string;
    candidateId: string;
    jobId: string;
    offeredSalary: number;
    startDate?: string;
    probationMonths?: number;
    bonuses?: string;
    offerText?: string;
    deadline?: string;
  }): Promise<HROffer> {
    const result = await this.rpcSingle<HROffer>('crm.create_hr_offer', {
      p_application_id:  data.applicationId,
      p_candidate_id:    data.candidateId,
      p_job_id:          data.jobId,
      p_offered_salary:  data.offeredSalary,
      p_start_date:      data.startDate      ?? null,
      p_probation_months: data.probationMonths ?? 3,
      p_bonuses:         data.bonuses        ?? null,
      p_offer_text:      data.offerText      ?? null,
      p_deadline:        data.deadline       ?? null,
    });
    if (!result) throw new Error('Failed to create HR offer');
    return result;
  }

  async updateHROfferStatus(id: string, status: string, declineReason?: string): Promise<HROffer> {
    const data = await this.rpcSingle<HROffer>('crm.update_hr_offer_status', {
      p_id:             id,
      p_status:         status,
      p_decline_reason: declineReason ?? null,
    });
    if (!data) throw new Error('Failed to update HR offer status');
    return data;
  }

  // ─── HR: Dashboard ────────────────────────────────────────────────────────

  async getHRDashboardStats(): Promise<HRDashboardStats> {
    const data = await this.rpcSingle<HRDashboardStats>('crm.get_hr_dashboard_stats', {});
    return data || {
      open_jobs: 0, total_jobs: 0, urgent_jobs: 0,
      total_candidates: 0, active_applications: 0,
      hired_this_month: 0, hired_total: 0, rejected_total: 0,
      funnel: [], interviews_today: 0, interviews_this_week: 0,
      offers_sent: 0, offers_accepted: 0, offer_accept_rate: 0,
      candidate_sources: [], avg_time_to_hire_days: null,
      new_candidates_week: 0,
    };
  }

  // ─── HR Advanced: Templates ────────────────────────────────────────────────

  async getHRTemplates(category?: string): Promise<HRTemplate[]> {
    return this.rpcList<HRTemplate>('crm.get_hr_templates', {
      p_category: category ?? null,
    });
  }

  async upsertHRTemplate(t: Partial<HRTemplate> & { name: string; category: string; body: string }): Promise<HRTemplate> {
    const data = await this.rpcSingle<HRTemplate>('crm.upsert_hr_template', {
      p_id:           t.id       ?? null,
      p_name:         t.name,
      p_category:     t.category,
      p_subject:      t.subject  ?? null,
      p_body:         t.body,
      p_is_default:   t.is_default   ?? false,
      p_send_channel: t.send_channel ?? 'email',
    });
    if (!data) throw new Error('Failed to upsert HR template');
    return data;
  }

  async seedHRTemplates(): Promise<void> {
    await this.rpcCall('crm.seed_hr_templates', {});
  }

  // Render template — replaces {{placeholders}} with actual values
  renderTemplate(template: HRTemplate, vars: Record<string, string>): { subject: string; body: string } {
    const replace = (text: string) =>
      Object.entries(vars).reduce((t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v), text);
    return {
      subject: replace(template.subject ?? ''),
      body:    replace(template.body),
    };
  }

  // ─── HR Advanced: Onboarding ───────────────────────────────────────────────

  async getHROnboarding(candidateId?: string): Promise<HROnboarding[]> {
    const raw = await this.rpcList<Record<string, unknown>>('crm.get_hr_onboarding', {
      p_candidate_id: candidateId ?? null,
    });
    return raw.map(r => ({
      ...r,
      tasks: Array.isArray(r.tasks) ? r.tasks as HROnboardingTask[] : JSON.parse(r.tasks as string ?? '[]') as HROnboardingTask[],
    })) as HROnboarding[];
  }

  async createHROnboarding(data: {
    candidateId: string;
    applicationId: string;
    jobId: string;
    startDate: string;
    probationEnd?: string;
    buddy?: string;
    manager?: string;
  }): Promise<HROnboarding> {
    const result = await this.rpcSingle<Record<string, unknown>>('crm.create_hr_onboarding', {
      p_candidate_id:    data.candidateId,
      p_application_id:  data.applicationId,
      p_job_id:          data.jobId,
      p_start_date:      data.startDate,
      p_probation_end:   data.probationEnd   ?? null,
      p_buddy:           data.buddy          ?? null,
      p_manager:         data.manager        ?? null,
    });
    if (!result) throw new Error('Failed to create onboarding');
    return {
      ...result,
      tasks: Array.isArray(result.tasks) ? result.tasks as HROnboardingTask[] : [],
    } as HROnboarding;
  }

  async updateHROnboardingTask(onboardingId: string, taskId: string, completed: boolean, notes?: string): Promise<HROnboarding> {
    const result = await this.rpcSingle<Record<string, unknown>>('crm.update_hr_onboarding_task', {
      p_onboarding_id: onboardingId,
      p_task_id:       taskId,
      p_completed:     completed,
      p_notes:         notes ?? null,
    });
    if (!result) throw new Error('Failed to update onboarding task');
    return {
      ...result,
      tasks: Array.isArray(result.tasks) ? result.tasks as HROnboardingTask[] : [],
    } as HROnboarding;
  }

  // ─── HR Advanced: КЭДО Documents ──────────────────────────────────────────

  async getHREmploymentDocs(candidateId: string): Promise<HREmploymentDoc[]> {
    return this.rpcList<HREmploymentDoc>('crm.get_hr_employment_docs', { p_candidate_id: candidateId });
  }

  /** Загрузить все КЭДО-документы по всем кандидатам (для дашборда) */
  async getAllHREmploymentDocs(): Promise<HREmploymentDoc[]> {
    return this.rpcList<HREmploymentDoc>('crm.get_hr_employment_docs', { p_candidate_id: null });
  }

  async upsertHREmploymentDoc(doc: Partial<HREmploymentDoc> & { candidate_id: string; doc_type: string; title: string }): Promise<HREmploymentDoc> {
    const data = await this.rpcSingle<HREmploymentDoc>('crm.upsert_hr_employment_doc', {
      p_id:           doc.id           ?? null,
      p_candidate_id: doc.candidate_id,
      p_doc_type:     doc.doc_type,
      p_title:        doc.title,
      p_status:       doc.status       ?? 'pending',
      p_send_method:  doc.send_method  ?? 'email',
      p_notes:        doc.notes        ?? null,
    });
    if (!data) throw new Error('Failed to upsert employment doc');
    return data;
  }

  // ─── HR Advanced: AI Scoring ───────────────────────────────────────────────

  async computeHRAIScore(applicationId: string): Promise<HRApplication> {
    const data = await this.rpcSingle<HRApplication>('crm.compute_hr_ai_score', {
      p_application_id: applicationId,
    });
    if (!data) throw new Error('Failed to compute AI score');
    return data;
  }

  // ─── HR Advanced: Employer Brand ──────────────────────────────────────────

  async getEmployerBrand(): Promise<HREmployerBrand | null> {
    return this.rpcSingle<HREmployerBrand>('crm.upsert_employer_brand', {
      p_company_name: '',
    }).catch(() => null);
  }

  async upsertEmployerBrand(brand: Partial<HREmployerBrand> & { company_name: string }): Promise<HREmployerBrand> {
    const data = await this.rpcSingle<HREmployerBrand>('crm.upsert_employer_brand', {
      p_company_name:      brand.company_name,
      p_enps_score:        brand.enps_score       ?? null,
      p_dreamjob_rating:   brand.dreamjob_rating   ?? null,
      p_evp_items:         brand.evp_items         ?? [],
      p_awards:            brand.awards            ?? [],
    });
    if (!data) throw new Error('Failed to upsert employer brand');
    return data;
  }

  // ══════════════════════════════════════════════════════════════
  // AUTO / AUTOMOTIVE CRM METHODS
  // ══════════════════════════════════════════════════════════════

  async getAutoDashboardStats(): Promise<AutoDashboardStats> {
    const data = await this.rpcSingle<AutoDashboardStats>('crm.get_auto_dashboard_stats', {});
    if (!data) return {} as AutoDashboardStats;
    return data;
  }

}
