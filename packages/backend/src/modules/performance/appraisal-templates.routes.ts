import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────
//  Validation Schemas
// ─────────────────────────────────────────────

const ItemSchema = z.object({
  name: z.string().min(1),
  maxScore: z.number().positive(),
  orderIndex: z.number().int().min(0),
});

const CategorySchema = z.object({
  name: z.string().min(1),
  maxScore: z.number().positive(),
  weight: z.number().nullable().optional(),
  orderIndex: z.number().int().min(0),
  items: z.array(ItemSchema).optional(),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  year: z.number().int().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  categories: z.array(CategorySchema).optional(),
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  year: z.number().int().nullable().optional(),
  isActive: z.boolean().optional(),
  categories: z.array(CategorySchema).optional(),
});

// ─────────────────────────────────────────────
//  GET /api/appraisal-templates
// ─────────────────────────────────────────────
router.get('/', requirePermission('performance', 'read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await db('appraisal_templates').orderBy('created_at', 'desc');
      // Load categories + items for each template
      for (const t of templates) {
        t.categories = await db('appraisal_categories')
          .where('template_id', t.id)
          .orderBy('order_index');
        for (const c of t.categories) {
          c.items = await db('appraisal_items')
            .where('category_id', c.id)
            .orderBy('order_index');
        }
      }
      res.json(templates);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  GET /api/appraisal-templates/:id
// ─────────────────────────────────────────────
router.get('/:id', requirePermission('performance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await db('appraisal_templates').where('id', req.params.id).first();
      if (!template) throw new AppError(404, 'Template not found');
      template.categories = await db('appraisal_categories')
        .where('template_id', template.id)
        .orderBy('order_index');
      for (const c of template.categories) {
        c.items = await db('appraisal_items')
          .where('category_id', c.id)
          .orderBy('order_index');
      }
      res.json(template);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  POST /api/appraisal-templates
// ─────────────────────────────────────────────
router.post('/', requirePermission('performance', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateTemplateSchema.parse(req.body);
      const templateId = uuidv4();

      await db.transaction(async (trx) => {
        await trx('appraisal_templates').insert({
          id: templateId,
          name: data.name,
          year: data.year ?? null,
          is_active: data.isActive,
        });

        if (data.categories?.length) {
          for (const cat of data.categories) {
            const catId = uuidv4();
            await trx('appraisal_categories').insert({
              id: catId,
              template_id: templateId,
              name: cat.name,
              max_score: cat.maxScore,
              weight: cat.weight ?? null,
              order_index: cat.orderIndex,
            });
            if (cat.items?.length) {
              for (const item of cat.items) {
                await trx('appraisal_items').insert({
                  id: uuidv4(),
                  category_id: catId,
                  name: item.name,
                  max_score: item.maxScore,
                  order_index: item.orderIndex,
                });
              }
            }
          }
        }
      });

      // Return full template
      const created = await db('appraisal_templates').where('id', templateId).first();
      created.categories = await db('appraisal_categories')
        .where('template_id', templateId)
        .orderBy('order_index');
      for (const c of created.categories) {
        c.items = await db('appraisal_items')
          .where('category_id', c.id)
          .orderBy('order_index');
      }
      res.status(201).json(created);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  PUT /api/appraisal-templates/:id
// ─────────────────────────────────────────────
router.put('/:id', requirePermission('performance', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = UpdateTemplateSchema.parse(req.body);
      const existing = await db('appraisal_templates').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Template not found');

      await db.transaction(async (trx) => {
        const updates: Record<string, unknown> = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.year !== undefined) updates.year = data.year;
        if (data.isActive !== undefined) updates.is_active = data.isActive;
        if (Object.keys(updates).length) {
          await trx('appraisal_templates').where('id', req.params.id).update(updates);
        }

        // Replace categories + items if provided
        if (data.categories !== undefined) {
          // Delete old categories (cascades to items via FK)
          await trx('appraisal_categories').where('template_id', req.params.id).del();

          for (const cat of data.categories) {
            const catId = uuidv4();
            await trx('appraisal_categories').insert({
              id: catId,
              template_id: req.params.id,
              name: cat.name,
              max_score: cat.maxScore,
              weight: cat.weight ?? null,
              order_index: cat.orderIndex,
            });
            if (cat.items?.length) {
              for (const item of cat.items) {
                await trx('appraisal_items').insert({
                  id: uuidv4(),
                  category_id: catId,
                  name: item.name,
                  max_score: item.maxScore,
                  order_index: item.orderIndex,
                });
              }
            }
          }
        }
      });

      // Return updated
      const updated = await db('appraisal_templates').where('id', req.params.id).first();
      updated.categories = await db('appraisal_categories')
        .where('template_id', req.params.id)
        .orderBy('order_index');
      for (const c of updated.categories) {
        c.items = await db('appraisal_items')
          .where('category_id', c.id)
          .orderBy('order_index');
      }
      res.json(updated);
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
//  DELETE /api/appraisal-templates/:id
// ─────────────────────────────────────────────
router.delete('/:id', requirePermission('performance', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if template is in use by any appraisals
      const inUse = await db('staff_appraisals').where('template_id', req.params.id).first();
      if (inUse) throw new AppError(400, 'Cannot delete template that is linked to existing appraisals');
      await db('appraisal_templates').where('id', req.params.id).del();
      res.status(204).end();
    } catch (err) { next(err); }
  }
);

export default router;
