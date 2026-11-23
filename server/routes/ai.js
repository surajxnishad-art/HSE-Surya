import { Router } from 'express';
import { get, query, run } from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncHandler, badRequest, cleanText, newId, nowIso, recentMonths } from '../util.js';

export const aiRouter = Router();

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const TASKS = {
  weekly_report: {
    label: 'Weekly HSE report',
    instruction:
      'Write a professional weekly HSE performance report for management. Use only the supplied data. Structure it with: Executive summary, Key metrics, Incidents and near misses, Inspections and findings, Hazards and risk status, Corrective actions, Training and permits, Recommendations, and Sign-off block. Use short paragraphs and bullet lists. Do not invent numbers.',
  },
  investigation_summary: {
    label: 'Incident investigation summary',
    instruction:
      'Summarise the incident investigation professionally. Cover: incident overview, sequence of events, immediate and root causes, contributing factors, adequacy of existing controls, corrective and preventive actions with owners, and lessons learned. Use only supplied facts; mark unknowns as "to be confirmed".',
  },
  recurring_hazards: {
    label: 'Recurring hazard analysis',
    instruction:
      'Analyse the hazard and incident data to identify recurring hazards and repeat failure patterns. For each pattern give: hazard theme, evidence from the data, likely systemic cause, and a prioritised control recommendation using the hierarchy of controls.',
  },
  corrective_actions: {
    label: 'Corrective action recommendations',
    instruction:
      'Recommend specific corrective and preventive actions for the supplied findings. For each action give: finding reference, root cause, action, responsible role, priority, target timeframe and verification evidence. Follow the hierarchy of controls and avoid generic advice.',
  },
  trend_analysis: {
    label: 'Safety trend analysis',
    instruction:
      'Analyse the monthly safety trend data. Describe direction of change, notable spikes or improvements, the metric relationships that matter (incidents vs inspections vs near-miss reporting), and 3 to 5 evidence-based recommendations. Reference the actual figures provided.',
  },
  toolbox_talk: {
    label: 'Toolbox talk content',
    instruction:
      'Write a 10 minute toolbox talk for a site crew. Include: topic, why it matters now (link to supplied data if relevant), key hazards, required controls, PPE, discussion questions, and a short attendance prompt. Keep the language simple and practical for industrial workers.',
  },
  risk_assessment: {
    label: 'Risk assessment assistance',
    instruction:
      'Draft a risk assessment for the described activity. Produce a table-like list of hazards, who is at risk, initial likelihood and severity (1-5), risk rating, controls in hierarchy order, and residual risk. Flag any activity needing a permit to work.',
  },
  safety_observation: {
    label: 'Safety observation draft',
    instruction:
      'Convert the supplied notes into a professional safety observation report: observation, location and activity, unsafe condition or behaviour, immediate action taken, risk rating, recommended corrective action, and observer sign-off.',
  },
};

async function buildContext(task, params) {
  const from = params.from || recentMonths(1).slice(-1)[0] + '-01';
  const to = params.to || new Date().toISOString().slice(0, 10);
  const dept = params.department && params.department !== 'all' ? params.department : null;
  const deptClause = dept ? ' AND department = ?' : '';
  const deptParams = dept ? [dept] : [];

  const company = await get("SELECT value FROM settings WHERE key = 'company_name'");
  const lines = [];
  lines.push(`Company: ${company?.value || 'Industrial HSE Pro'}`);
  lines.push(`Reporting period: ${from} to ${to}`);
  lines.push(`Department scope: ${dept || 'All departments'}`);

  if (task === 'investigation_summary') {
    const incident = await get('SELECT * FROM incidents WHERE id = ?', [params.record_id || '']);
    if (!incident) throw badRequest('Select an incident record to summarise.');
    lines.push(
      `Incident record: ${JSON.stringify({
        number: incident.incident_no,
        type: incident.type,
        occurred_at: incident.occurred_at,
        department: incident.department,
        location: incident.location,
        severity: incident.severity,
        description: incident.description,
        immediate_action: incident.immediate_action,
        root_cause: incident.root_cause,
        investigation: incident.investigation,
        lost_days: incident.lost_days,
        status: incident.status,
      })}`,
    );
    const actions = await query('SELECT finding, responsible_person, priority, target_date, status FROM actions WHERE source_id = ?', [
      incident.id,
    ]);
    lines.push(`Linked corrective actions: ${JSON.stringify(actions)}`);
    return { text: lines.join('\n'), from, to, dept };
  }

  if (task === 'risk_assessment' || task === 'safety_observation' || task === 'toolbox_talk') {
    lines.push(`Topic / activity: ${cleanText(params.topic, 500) || 'not specified'}`);
    lines.push(`Notes: ${cleanText(params.notes, 4000) || 'none supplied'}`);
  }

  const [incidents, hazards, actions, inspections, trainings] = await Promise.all([
    query(
      `SELECT type, COUNT(*) AS total FROM incidents WHERE occurred_at >= ? AND occurred_at <= ?${deptClause} GROUP BY type`,
      [from, to, ...deptParams],
    ),
    query(
      `SELECT category, risk_level, COUNT(*) AS total FROM hazards WHERE created_at >= ? AND created_at <= ?${deptClause} GROUP BY category, risk_level`,
      [from, to, ...deptParams],
    ),
    query(
      `SELECT priority, status, COUNT(*) AS total FROM actions WHERE created_at >= ? AND created_at <= ?${deptClause} GROUP BY priority, status`,
      [from, to, ...deptParams],
    ),
    query(
      `SELECT type, COUNT(*) AS total, AVG(score) AS avg_score FROM inspections WHERE inspection_date >= ? AND inspection_date <= ?${deptClause} GROUP BY type`,
      [from, to, ...deptParams],
    ),
    query(
      `SELECT status, COUNT(*) AS total FROM trainings WHERE training_date >= ? AND training_date <= ?${deptClause} GROUP BY status`,
      [from, to, ...deptParams],
    ),
  ]);

  const monthly = await query(
    `SELECT substr(occurred_at,1,7) AS month, COUNT(*) AS total FROM incidents
     WHERE occurred_at >= ? AND occurred_at <= ?${deptClause} GROUP BY substr(occurred_at,1,7) ORDER BY month`,
    [from, to, ...deptParams],
  );
  const manHours = await get(
    `SELECT COALESCE(SUM(hours),0) AS total FROM man_hours WHERE month >= ? AND month <= ?${deptClause}`,
    [from.slice(0, 7), to.slice(0, 7), ...deptParams],
  );

  const openHazards = await query(
    `SELECT title, category, risk_level, risk_score, owner, target_date, status FROM hazards
     WHERE status IN ('open','in_progress')${deptClause} ORDER BY risk_score DESC LIMIT 15`,
    deptParams,
  );
  const overdueActions = await query(
    `SELECT action_no, finding, responsible_person, priority, target_date, status FROM actions
     WHERE status NOT IN ('verified','closed') AND target_date < ?${deptClause} ORDER BY target_date ASC LIMIT 15`,
    [new Date().toISOString().slice(0, 10), ...deptParams],
  );
  const recentIncidents = await query(
    `SELECT incident_no, type, occurred_at, department, severity, description FROM incidents
     WHERE occurred_at >= ? AND occurred_at <= ?${deptClause} ORDER BY occurred_at DESC LIMIT 12`,
    [from, to, ...deptParams],
  );

  lines.push(`Incidents by type: ${JSON.stringify(incidents)}`);
  lines.push(`Monthly incident counts: ${JSON.stringify(monthly)}`);
  lines.push(`Hazards by category and risk: ${JSON.stringify(hazards)}`);
  lines.push(`Corrective actions by priority and status: ${JSON.stringify(actions)}`);
  lines.push(`Inspections: ${JSON.stringify(inspections)}`);
  lines.push(`Training: ${JSON.stringify(trainings)}`);
  lines.push(`Man hours worked: ${Number(manHours?.total || 0)}`);
  lines.push(`Top open hazards: ${JSON.stringify(openHazards)}`);
  lines.push(`Overdue corrective actions: ${JSON.stringify(overdueActions)}`);
  lines.push(`Recent incident details: ${JSON.stringify(recentIncidents)}`);

  return { text: lines.join('\n'), from, to, dept };
}

aiRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: MODEL(),
      tasks: Object.entries(TASKS).map(([value, def]) => ({ value, label: def.label })),
      note: process.env.GEMINI_API_KEY
        ? 'Gemini is configured on the server. The API key is never sent to the browser.'
        : 'Set GEMINI_API_KEY in the server environment to enable AI assistance. All HSE modules work without it.',
    });
  }),
);

aiRouter.post(
  '/generate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const task = String((req.body || {}).task || '');
    const def = TASKS[task];
    if (!def) throw badRequest('Unknown AI task.');
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'AI assistance is not configured on this server. Set GEMINI_API_KEY to enable it.',
        code: 'ai_not_configured',
        aiAvailable: false,
      });
    }

    const params = (req.body || {}).params || {};
    const context = await buildContext(task, params);
    const prompt = [
      `Task: ${def.label}`,
      def.instruction,
      'Ground every statement in the data below. If data is missing, say so instead of inventing it.',
      '--- HSE DATA ---',
      context.text,
      '--- END DATA ---',
    ].join('\n\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let response;
    try {
      response = await fetch(`${API_BASE}/${MODEL()}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: 'You are a senior industrial HSE (health, safety and environment) advisor writing for an enterprise safety management system. Be precise, professional and practical. Never fabricate statistics.',
              },
            ],
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 3000, topP: 0.9 },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      return res.status(504).json({
        error:
          error.name === 'AbortError'
            ? 'The AI service did not respond in time. Please try again.'
            : 'Could not reach the AI service from the server.',
        code: 'ai_unreachable',
        aiAvailable: false,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      let message = `AI service returned HTTP ${response.status}.`;
      if (response.status === 400 || response.status === 403) message = 'The AI service rejected the request. Check that GEMINI_API_KEY is valid and the Generative Language API is enabled.';
      if (response.status === 429) message = 'The AI service quota is exhausted. Try again later or check the Gemini plan/billing.';
      if (response.status === 404) message = `The configured Gemini model "${MODEL()}" was not found. Set GEMINI_MODEL to a supported model.`;
      return res.status(502).json({
        error: message,
        code: 'ai_provider_error',
        providerStatus: response.status,
        detail: bodyText.slice(0, 300),
        aiAvailable: false,
      });
    }

    const payload = await response.json();
    const text =
      payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n').trim() || '';
    if (!text) {
      return res.status(502).json({
        error: 'The AI service returned an empty response. Please try again.',
        code: 'ai_empty',
        aiAvailable: false,
      });
    }
    res.json({
      task,
      label: def.label,
      model: MODEL(),
      text,
      generatedAt: nowIso(),
      scope: { from: context.from, to: context.to, department: context.dept || 'all' },
      aiAvailable: true,
    });
  }),
);

aiRouter.post(
  '/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    const title = cleanText((req.body || {}).title, 200).trim();
    const text = cleanText((req.body || {}).text, 20000).trim();
    if (title.length < 3) throw badRequest('Give the AI output a title before saving.');
    if (!text) throw badRequest('There is no AI content to save.');
    const id = newId();
    const now = nowIso();
    await run(
      `INSERT INTO documents (id, title, category, doc_type, version, description, status, uploaded_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, title, 'other', 'other', '1.0', text, 'active', req.user.username, now, now],
    );
    res.status(201).json({ id, message: 'Saved to Document Management.' });
  }),
);
