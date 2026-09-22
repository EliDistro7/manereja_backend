// controllers/manereja/pipelineTemplateController.js
const PipelineTemplate = require('../../models/manereja/PipelineTemplate');
const BusinessProfile  = require('../../models/manereja/business-profile');

const TERMINAL_STATUSES = ['resolved', 'closed_won', 'closed_lost'];

function normaliseStages(stages) {
  return stages.map(s => {
    const key = typeof s === 'string'
      ? s.trim().toLowerCase().replace(/\s+/g, '_')
      : String(s.key ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    const obj = { key };
    if (s.description?.trim()) obj.description = s.description.trim();
    if (s.staleThresholdDays != null && Number.isFinite(Number(s.staleThresholdDays))) {
      obj.staleThresholdDays = Math.round(Number(s.staleThresholdDays));
    }
    return obj;
  });
}

function validateStages(stages) {
  if (!Array.isArray(stages) || stages.length < 2 || stages.length > 20) {
    return 'stages must be an array of 2–20 items';
  }
  const keys = stages.map(s => s.key ?? s);
  if (keys.some(k => !k)) return 'Stage keys cannot be empty';
  if (new Set(keys).size !== keys.length) return 'Stage keys must be unique';
  if (!keys.some(k => TERMINAL_STATUSES.includes(k))) {
    return 'Stages must include at least one terminal stage (closed_won or closed_lost)';
  }
  return null;
}

// GET /profiles/:profileId/pipeline-templates
exports.listTemplates = async (req, res) => {
  try {
    const templates = await PipelineTemplate.find({
      businessProfileId: req.params.profileId,
      isArchived: false,
    }).sort({ createdAt: -1 });
    return res.json({ success: true, templates });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /profiles/:profileId/pipeline-templates
exports.createTemplate = async (req, res) => {
  try {
    const { name, description, stages } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const normalised = normaliseStages(stages ?? []);
    const error      = validateStages(normalised);
    if (error) return res.status(400).json({ success: false, message: error });

    const template = await PipelineTemplate.create({
      businessProfileId: req.params.profileId,
      name:              name.trim(),
      description:       description?.trim() ?? null,
      stages:            normalised,
      createdBy:         req.user.id,
    });

    return res.status(201).json({ success: true, template });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /profiles/:profileId/pipeline-templates/:templateId
exports.updateTemplate = async (req, res) => {
  try {
    const template = await PipelineTemplate.findOne({
      _id:               req.params.templateId,
      businessProfileId: req.params.profileId,
      isArchived:        false,
    });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    const { name, description, stages } = req.body;

    if (name !== undefined)        template.name        = name.trim();
    if (description !== undefined) template.description = description?.trim() ?? null;

    if (stages !== undefined) {
      const normalised = normaliseStages(stages);
      const error      = validateStages(normalised);
      if (error) return res.status(400).json({ success: false, message: error });
      template.stages = normalised;
    }

    await template.save();

    // Note: updating a template never mutates existing flags —
    // flags carry their own snapshotStages copy taken at creation time.
    return res.json({ success: true, template });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /profiles/:profileId/pipeline-templates/:templateId
// Soft-archives the template. Existing flags are unaffected.
exports.archiveTemplate = async (req, res) => {
  try {
    const template = await PipelineTemplate.findOneAndUpdate(
      { _id: req.params.templateId, businessProfileId: req.params.profileId },
      { isArchived: true },
      { new: true },
    );
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    return res.json({ success: true, message: 'Template archived' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};