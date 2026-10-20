import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function getCategoryLabel(pct: number): string {
  if (pct >= 75) return 'ACHIEVED';
  if (pct >= 50) return 'PROMISING';
  return 'NEEDS IMPROVEMENT';
}

/** Compute term score % from scores and template categories */
async function computeTermScore(termId: string, trx: any) {
  const scores = await trx('staff_appraisal_scores')
    .join('appraisal_categories', 'staff_appraisal_scores.category_id', 'appraisal_categories.id')
    .where('staff_appraisal_scores.appraisal_term_id', termId)
    .select('staff_appraisal_scores.score', 'appraisal_categories.max_score');

  if (!scores.length) return null;

  const totalScored = scores.reduce((s: number, r: any) => s + Number(r.score), 0);
  const totalMax = scores.reduce((s: number, r: any) => s + Number(r.max_score), 0);
  if (totalMax === 0) return null;
  return Math.round((totalScored / totalMax) * 10000) / 100; // percentage with 2 decimals
}

/** Recompute annual average and update the staff_appraisals row */
async function recomputeAnnual(appraisalId: string, trx: any) {
  const terms = await trx('staff_appraisal_terms').where('appraisal_id', appraisalId);
  const scored = terms.filter((t: any) => t.term_score !== null);
  if (!scored.length) {
    await trx('staff_appraisals').where('id', appraisalId).update({
      annual_average: null, annual_category: null,
    });
    return;
  }
  const avg = scored.reduce((s: number, t: any) => s + Number(t.term_score), 0) / scored.length;
  const rounded = Math.round(avg * 100) / 100;
  await trx('staff_appraisals').where('id', appraisalId).update({
    annual_average: rounded,
    annual_category: getCategoryLabel(rounded),
  });
}

/** Load full appraisal with terms, scores, template, comments */
async function loadFullAppraisal(id: string) {
  const appraisal = await db('staff_appraisals')
    .join('employees', 'staff_appraisals.staff_id', 'employees.id')
    .where('staff_appraisals.id', id)
    .select(
      'staff_appraisals.*',
      db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
      'employees.staff_no',
      'employees.subjects_of_preference',
    )
    .first();
  if (!appraisal) return null;

  // Fetch campus name from latest active employment
  const latestEmployment = await db('employments')
    .where({ employee_id: appraisal.staff_id, status: 'active' })
    .orderBy('start_date', 'desc')
    .first();
  if (latestEmployment?.campus_id) {
    const campus = await db('campuses').where('id', latestEmployment.campus_id).first();
    appraisal.campus_name = campus?.name || null;
  }

  // Fetch assigned classes
  const classes = await db('employee_classes')
    .join('school_classes', 'employee_classes.class_id', 'school_classes.id')
    .where('employee_classes.employee_id', appraisal.staff_id)
    .select('school_classes.name');
  appraisal.class_names = classes.map((c: any) => c.name).join(', ') || null;

  // Template with categories
  const template = await db('appraisal_templates').where('id', appraisal.template_id).first();
  if (template) {
    template.categories = await db('appraisal_categories')
      .where('template_id', template.id)
      .orderBy('order_index');
    for (const c of template.categories) {
      c.items = await db('appraisal_items').where('category_id', c.id).orderBy('order_index');
    }
  }
  appraisal.template = template;

  // Terms with scores
  appraisal.terms = await db('staff_appraisal_terms')
    .where('appraisal_id', id)
    .orderByRaw("CASE term WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 END");
  for (const t of appraisal.terms) {
    t.scores = await db('staff_appraisal_scores')
      .join('appraisal_categories', 'staff_appraisal_scores.category_id', 'appraisal_categories.id')
      .where('staff_appraisal_scores.appraisal_term_id', t.id)
      .select(
        'staff_appraisal_scores.*',
        'appraisal_categories.name as category_name',
        'appraisal_categories.max_score as category_max_score',
      );
    // Map category field for frontend consistency
    t.category_label = t.category;
  }

  // Comments from separate table
  const comments = await db('staff_appraisal_comments').where('appraisal_id', id).first();
  if (comments) {
    appraisal.guidance_comment = comments.guidance_comment;
    appraisal.other_observations = comments.other_observations;
    appraisal.prepared_by = comments.prepared_by;
    appraisal.approved_by = comments.approved_by;
    appraisal.teacher_acknowledgement = comments.teacher_acknowledgement;
  }

  // Map field names for frontend consistency
  appraisal.employee_id = appraisal.staff_id;
  appraisal.category_label = appraisal.annual_category;

  return appraisal;
}

// ─────────────────────────────────────────────
//  Validation Schemas
// ─────────────────────────────────────────────

const ScoreEntry = z.object({
  categoryId: z.string().uuid(),
  itemId: z.string().uuid().nullable().optional(),
  score: z.number().min(0),
});

const TermEntry = z.object({
  term: z.enum(['I', 'II', 'III']),
  scores: z.array(ScoreEntry).min(1),
});

const CreateAppraisalSchema = z.object({
  employeeId: z.string().uuid(),
  templateId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  guidanceComment: z.string().optional(),
  otherObservations: z.string().optional(),
  preparedBy: z.string().optional(),
  approvedBy: z.string().optional(),
  terms: z.array(TermEntry).min(1),
});

const UpdateAppraisalSchema = z.object({
  guidanceComment: z.string().optional(),
  otherObservations: z.string().optional(),
  preparedBy: z.string().optional(),
  approvedBy: z.string().optional(),
  terms: z.array(TermEntry).optional(),
});

// ─────────────────────────────────────────────
//  GET /api/staff-appraisals?employeeId=&year=
// ─────────────────────────────────────────────
router.get('/', requirePermission('performance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let query = db('staff_appraisals')
        .join('employees', 'staff_appraisals.staff_id', 'employees.id')
        .select(
          'staff_appraisals.*',
          db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
          'employees.staff_no',
        )
        .orderBy('staff_appraisals.year', 'desc');

      if (req.query.employeeId) query = query.where('staff_appraisals.staff_id', req.query.employeeId as string);
      if (req.query.year) query = query.where('staff_appraisals.year', Number(req.query.year));

      const rows = await query;

      // Load terms for each + map field names
      for (const a of rows) {
        a.terms = await db('staff_appraisal_terms')
          .where('appraisal_id', a.id)
          .orderByRaw("CASE term WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 END");
        // Map for frontend consistency
        a.employee_id = a.staff_id;
        a.category_label = a.annual_category;
        for (const t of a.terms) {
          t.category_label = t.category;
        }
      }

      res.json(rows);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  GET /api/staff-appraisals/:id
// ─────────────────────────────────────────────
router.get('/:id', requirePermission('performance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await loadFullAppraisal(req.params.id);
      if (!result) throw new AppError(404, 'Appraisal not found');
      res.json(result);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  GET /api/staff-appraisals/employee/:employeeId
// ─────────────────────────────────────────────
router.get('/employee/:employeeId', requirePermission('performance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db('staff_appraisals')
        .where('staff_id', req.params.employeeId)
        .orderBy('year', 'desc');
      for (const a of rows) {
        a.terms = await db('staff_appraisal_terms')
          .where('appraisal_id', a.id)
          .orderByRaw("CASE term WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 END");
        a.employee_id = a.staff_id;
        a.category_label = a.annual_category;
        for (const t of a.terms) {
          t.category_label = t.category;
        }
      }
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  POST /api/staff-appraisals
// ─────────────────────────────────────────────
router.post('/', requirePermission('performance', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateAppraisalSchema.parse(req.body);

      // Verify template exists
      const template = await db('appraisal_templates').where('id', data.templateId).first();
      if (!template) throw new AppError(400, 'Template not found');

      // Verify employee exists
      const employee = await db('employees').where('id', data.employeeId).first();
      if (!employee) throw new AppError(400, 'Employee not found');

      // Prevent duplicate
      const dup = await db('staff_appraisals')
        .where({ staff_id: data.employeeId, year: data.year }).first();
      if (dup) throw new AppError(409, 'Appraisal already exists for this staff and year');

      // Load template categories for validation
      const categories = await db('appraisal_categories').where('template_id', data.templateId);
      const catMap = new Map(categories.map((c: any) => [c.id, c]));

      // Validate scores don't exceed max
      for (const term of data.terms) {
        for (const sc of term.scores) {
          const cat = catMap.get(sc.categoryId);
          if (!cat) throw new AppError(400, `Category ${sc.categoryId} not found in template`);
          if (sc.score > Number(cat.max_score)) {
            throw new AppError(400, `Score ${sc.score} exceeds max ${cat.max_score} for category "${cat.name}"`);
          }
        }
      }

      const appraisalId = uuidv4();

      await db.transaction(async (trx) => {
        await trx('staff_appraisals').insert({
          id: appraisalId,
          staff_id: data.employeeId,
          template_id: data.templateId,
          year: data.year,
        });

        for (const term of data.terms) {
          const termId = uuidv4();
          await trx('staff_appraisal_terms').insert({
            id: termId,
            appraisal_id: appraisalId,
            term: term.term,
          });

          for (const sc of term.scores) {
            await trx('staff_appraisal_scores').insert({
              id: uuidv4(),
              appraisal_term_id: termId,
              category_id: sc.categoryId,
              item_id: sc.itemId || null,
              score: sc.score,
            });
          }

          // Compute term score
          const termScore = await computeTermScore(termId, trx);
          if (termScore !== null) {
            await trx('staff_appraisal_terms').where('id', termId).update({
              term_score: termScore,
              category: getCategoryLabel(termScore),
            });
          }
        }

        // Compute and store annual average
        await recomputeAnnual(appraisalId, trx);

        // Save comments to separate table
        if (data.guidanceComment || data.otherObservations || data.preparedBy || data.approvedBy) {
          await trx('staff_appraisal_comments').insert({
            id: uuidv4(),
            appraisal_id: appraisalId,
            guidance_comment: data.guidanceComment || null,
            other_observations: data.otherObservations || null,
            prepared_by: data.preparedBy || null,
            approved_by: data.approvedBy || null,
          });
        }
      });

      const result = await loadFullAppraisal(appraisalId);
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  PUT /api/staff-appraisals/:id
// ─────────────────────────────────────────────
router.put('/:id', requirePermission('performance', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = UpdateAppraisalSchema.parse(req.body);
      const existing = await db('staff_appraisals').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Appraisal not found');

      // Load template categories for validation
      const categories = await db('appraisal_categories').where('template_id', existing.template_id);
      const catMap = new Map(categories.map((c: any) => [c.id, c]));

      await db.transaction(async (trx) => {
        // Update/upsert comments in separate table
        if (data.guidanceComment !== undefined || data.otherObservations !== undefined ||
            data.preparedBy !== undefined || data.approvedBy !== undefined) {
          const existingComments = await trx('staff_appraisal_comments')
            .where('appraisal_id', req.params.id).first();
          const commentData: Record<string, unknown> = {};
          if (data.guidanceComment !== undefined) commentData.guidance_comment = data.guidanceComment;
          if (data.otherObservations !== undefined) commentData.other_observations = data.otherObservations;
          if (data.preparedBy !== undefined) commentData.prepared_by = data.preparedBy;
          if (data.approvedBy !== undefined) commentData.approved_by = data.approvedBy;

          if (existingComments) {
            await trx('staff_appraisal_comments').where('appraisal_id', req.params.id).update(commentData);
          } else {
            await trx('staff_appraisal_comments').insert({
              id: uuidv4(),
              appraisal_id: req.params.id,
              ...commentData,
            });
          }
        }

        // Replace terms + scores if provided
        if (data.terms?.length) {
          // Validate first
          for (const term of data.terms) {
            for (const sc of term.scores) {
              const cat = catMap.get(sc.categoryId);
              if (!cat) throw new AppError(400, `Category ${sc.categoryId} not found in template`);
              if (sc.score > Number(cat.max_score)) {
                throw new AppError(400, `Score ${sc.score} exceeds max ${cat.max_score} for "${cat.name}"`);
              }
            }
          }

          // Delete existing terms (cascades to scores)
          await trx('staff_appraisal_terms').where('appraisal_id', req.params.id).del();

          for (const term of data.terms) {
            const termId = uuidv4();
            await trx('staff_appraisal_terms').insert({
              id: termId,
              appraisal_id: req.params.id,
              term: term.term,
            });

            for (const sc of term.scores) {
              await trx('staff_appraisal_scores').insert({
                id: uuidv4(),
                appraisal_term_id: termId,
                category_id: sc.categoryId,
                item_id: sc.itemId || null,
                score: sc.score,
              });
            }

            const termScore = await computeTermScore(termId, trx);
            if (termScore !== null) {
              await trx('staff_appraisal_terms').where('id', termId).update({
                term_score: termScore,
                category: getCategoryLabel(termScore),
              });
            }
          }

          await recomputeAnnual(req.params.id, trx);
        }
      });

      const result = await loadFullAppraisal(req.params.id);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  DELETE /api/staff-appraisals/:id
// ─────────────────────────────────────────────
router.delete('/:id', requirePermission('performance', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await db('staff_appraisals').where('id', req.params.id).del();
      if (!deleted) throw new AppError(404, 'Appraisal not found');
      res.status(204).end();
    } catch (err) { next(err); }
  }
);

export default router;
