const AuditLog = require('../models/AuditLog');
const Calendars = require('../models/Calendars');
const { roleNames } = require('../helpers/roles');
const { canAccessCalendar } = require('../helpers/calendar-access');
const { writeAudit } = require('../helpers/audit');

const getAuditLog = async (req, res) => {
    const roles = roleNames(req.user);
    const query = {};
    if (!roles.some((role) => ['gerente', 'lider'].includes(role))) {
        return res.status(403).json({ ok: false, msg: 'No tienes permiso para consultar la auditoría.' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && !Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
    const entries = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ ok: true, entries });
};

const recordCalendarExport = async (req, res) => {
    const { calendarIds, extension } = req.body;
    if (!Array.isArray(calendarIds) || calendarIds.length === 0 || !['.bprelease', '.csv', '.txt'].includes(extension)) {
        return res.status(400).json({ ok: false, msg: 'Indica los calendarios y el formato exportado.' });
    }

    try {
        const ids = [...new Set(calendarIds.map(String))];
        const calendars = await Calendars.find({ _id: { $in: ids }, deletedAt: null }).select('_id titleStore cliente').lean();
        if (calendars.length !== ids.length) return res.status(404).json({ ok: false, msg: 'Uno o más calendarios no están disponibles.' });
        for (const calendar of calendars) {
            if (!(await canAccessCalendar(req.user, calendar))) return res.status(403).json({ ok: false, msg: 'No tienes acceso a uno o más calendarios.' });
        }

        const formatName = {
            '.bprelease': 'Blue Prism',
            '.csv': 'UiPath',
            '.txt': 'Automation Anywhere',
        }[extension];
        await writeAudit(req, {
            action: 'calendar.export',
            entity: 'calendar',
            summary: `Exportó ${calendars.length} calendario(s) para ${formatName}`,
            metadata: { calendarIds: ids, titles: calendars.map(({ titleStore }) => titleStore), extension },
        });
        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'No se pudo registrar la exportación.' });
    }
};

module.exports = { getAuditLog, recordCalendarExport };
