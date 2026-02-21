import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const KPISchema = z.object({
  description: z.string().min(1),
  target: z.string().min(1),
  actualAchievement: z.string().min(1),
  weight: z.number().min(0).max(100),
  score: z.number().int().min(1).max(5),
});

const AppraisalSchema = z.object({
  employeeId: z.string().uuid(),
  supervisorId: z.string().uuid(),
  period: z.enum(['term_1', 'term_2', 'term_3', 'annual', 'probation']),
  academicYear: z.string().min(4).max(20),
  conductedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  supervisorComments: z.string().optional(),
  employeeComments: z.string().optional(),
  isEligibleForPromotion: z.boolean().default(false),
  kpis: z.array(KPISchema).min(1),
});

// GET /api/performance?employeeId=
router.get('/', requirePermission('performance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let query = db('appraisals').orderBy('conducted_date', 'desc');
      if (req.query.employeeId) query = query.where('employee_id', req.query.employeeId as string);
      const appraisals = await query;
      res.json(appraisals);
    } catch (err) { next(err); }
  }
);

// GET /api/performance/:id
router.get('/:id', requirePermission('performance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appraisal = await db('appraisals').where('id', req.params.id).first();
      if (!appraisal) throw new AppError(404, 'Appraisal not found');
      const kpis = await db('kpis').where('appraisal_id', req.params.id);
      res.json({ ...appraisal, kpis });
    } catch (err) { next(err); }
  }
);

// POST /api/performance
router.post('/', requirePermission('performance', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = AppraisalSchema.parse(req.body);

      // Compute overall score as weighted average
      const totalWeight = data.kpis.reduce((s, k) => s + k.weight, 0);
      const overallScore = data.kpis.reduce((s, k) => s + (k.score * k.weight), 0) / (totalWeight || 1);

      const ratingLabel = (s: number) => {
        if (s >= 4.5) return 'Excellent';
        if (s >= 3.5) return 'Good';
        if (s >= 2.5) return 'Fair';
        return 'Poor';
      };

      const id = uuidv4();
      const [appraisal] = await db('appraisals').insert({
        id,
        employee_id: data.employeeId,
        supervisor_id: data.supervisorId,
        period: data.period,
        academic_year: data.academicYear,
        conducted_date: data.conductedDate,
        overall_score: Math.round(overallScore * 100) / 100,
        overall_rating: ratingLabel(overallScore),
        supervisor_comments: data.supervisorComments,
        employee_comments: data.employeeComments,
        is_eligible_for_promotion: data.isEligibleForPromotion,
      }).returning('*');

      const kpis = await db('kpis').insert(
        data.kpis.map((k) => ({
          id: uuidv4(),
          appraisal_id: id,
          description: k.description,
          target: k.target,
          actual_achievement: k.actualAchievement,
          weight: k.weight,
          score: k.score,
        }))
      ).returning('*');

      res.status(201).json({ ...appraisal, kpis });
    } catch (err) { next(err); }
  }
);

export default router;
