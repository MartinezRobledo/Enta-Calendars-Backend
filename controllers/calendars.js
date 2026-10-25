const Calendars = require('../models/Calendars');
const { writeAudit, withAuditTransaction } = require('../helpers/audit');
const { getAccessibleCalendarOwners, canAccessCalendar } = require('../helpers/calendar-access');

const createCalendar = async (req, res) => {
    try {
        const { _id, titleStore } = req.body;
        const cliente = req.user.name;
        if (!_id) return res.status(400).json({ ok: false, msg: 'El identificador del calendario es obligatorio.' });
        if (await Calendars.findById(_id)) return res.status(409).json({ ok: false, msg: 'Ya existe un calendario con el mismo ID.' });
        if (await Calendars.findOne({ titleStore, cliente, deletedAt: null })) return res.status(409).json({ ok: false, msg: 'Ya existe un calendario con el mismo título.' });
        const calendar = await withAuditTransaction(async (session) => {
            const created = new Calendars({ ...req.body, cliente, updatedBy: req.uid });
            await created.save({ session });
            await writeAudit(req, { action: 'calendar.create', entity: 'calendar', entityId: created._id, summary: `Creó el calendario ${created.titleStore}`, metadata: { cliente: created.cliente, configuration: created.añosStore } }, session);
            return created;
        });
        res.status(201).json({ ok: true, calendar });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'Error al guardar el calendario.' });
    }
};

const updateCalendar = async (req, res) => {
    try {
        const { _id, calendario } = req.body;
        if (!_id || !calendario) return res.status(400).json({ ok: false, msg: 'Faltan datos del calendario.' });
        const current = await Calendars.findOne({ _id, deletedAt: null });
        if (!current) return res.status(404).json({ ok: false, msg: 'Calendario no encontrado.' });
        if (!(await canAccessCalendar(req.user, current))) return res.status(403).json({ ok: false, msg: 'No tienes acceso a este calendario.' });
        const calendarFields = {
            titleStore: calendario.titleStore,
            añosStore: calendario.añosStore,
            cliente: current.cliente,
        };
        const updated = { ...calendarFields, updatedBy: req.uid, fechaActualizacion: new Date() };
        if (await Calendars.exists({ _id: { $ne: current._id }, titleStore: updated.titleStore, cliente: updated.cliente, deletedAt: null })) {
            return res.status(409).json({ ok: false, msg: 'Ya existe un calendario activo con ese título para el cliente.' });
        }
        const previous = current.toObject();
        const changes = Object.fromEntries(Object.entries(calendarFields).filter(([key, value]) => JSON.stringify(previous[key]) !== JSON.stringify(value)).map(([key, value]) => [key, { before: previous[key] ?? null, after: value }]));
        const saved = await withAuditTransaction(async (session) => {
            const updatedCalendar = await Calendars.findByIdAndUpdate(current._id, { $set: updated }, { new: true, runValidators: true, session });
            if (!updatedCalendar) throw new Error('El calendario dejó de estar disponible durante la actualización.');
            await writeAudit(req, { action: 'calendar.update', entity: 'calendar', entityId: updatedCalendar._id, summary: `Actualizó el calendario ${updatedCalendar.titleStore}`, metadata: { cliente: updatedCalendar.cliente, changes } }, session);
            return updatedCalendar;
        });
        res.json({ ok: true, calendar: saved });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'Error al actualizar el calendario.' });
    }
};

const getCalendars = async (req, res) => {
    try {
        const owners = await getAccessibleCalendarOwners(req.user);
        if (owners !== null && !owners.includes(req.params.user)) return res.status(403).json({ ok: false, msg: 'No tienes acceso a esos calendarios.' });
        const skip = Math.min(1000000, Math.max(0, Number.parseInt(req.query.skip, 10) || 0));
        const requestedLimit = Number.parseInt(req.query.limit, 10) || 48;
        const limit = Math.min(100, Math.max(1, requestedLimit));
        const search = String(req.query.search || '').trim();
        const filter = { cliente: req.params.user, deletedAt: null };

        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.titleStore = { $regex: escapedSearch, $options: 'i' };
        }

        // The monitor gets only card metadata, one page at a time. Full
        // configurations are fetched by GET /:user/:id when opened/exported.
        const [total, calendars] = await Promise.all([
            Calendars.countDocuments(filter),
            Calendars.find(filter)
                .select('_id titleStore fechaActualizacion cliente')
                .sort({ titleStore: 1, _id: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
        ]);
        await writeAudit(req, { action: 'calendar.list', entity: 'calendar', summary: 'Consultó calendarios', metadata: { cliente: req.params.user, count: calendars.length } });
        res.json({ ok: true, calendars, pagination: { skip, limit, total, hasMore: skip + calendars.length < total } });
    } catch (error) {
        console.error('No se pudieron obtener los calendarios:', error.message);
        res.status(500).json({ ok: false, msg: 'No se pudieron obtener los calendarios.' });
    }
};

const getCalendar = async (req, res) => {
    try {
        const calendar = await Calendars.findOne({ _id: req.params.id, deletedAt: null });
        if (!calendar) return res.status(404).json({ ok: false, msg: 'Calendario no encontrado.' });
        if (calendar.cliente !== req.params.user) return res.status(404).json({ ok: false, msg: 'Calendario no encontrado.' });
        if (!(await canAccessCalendar(req.user, calendar))) return res.status(403).json({ ok: false, msg: 'No tienes acceso a este calendario.' });
        res.json({ ok: true, calendar });
    } catch (error) {
        console.error('No se pudo obtener el calendario:', error.message);
        res.status(500).json({ ok: false, msg: 'No se pudo obtener el calendario.' });
    }
};

const deleteCalendar = async (req, res) => {
    try {
        const existing = await Calendars.findOne({ _id: req.params.id, deletedAt: null });
        if (!existing) return res.status(404).json({ ok: false, message: 'Calendario no encontrado.' });
        if (!(await canAccessCalendar(req.user, existing))) return res.status(403).json({ ok: false, msg: 'No tienes acceso a este calendario.' });
        const calendar = await withAuditTransaction(async (session) => {
            const deleted = await Calendars.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { deletedAt: new Date(), deletedBy: req.uid } }, { new: true, session });
            if (!deleted) return null;
            await writeAudit(req, { action: 'calendar.delete', entity: 'calendar', entityId: deleted._id, summary: `Eliminó el calendario ${deleted.titleStore}`, metadata: { title: deleted.titleStore, cliente: deleted.cliente } }, session);
            return deleted;
        });
        if (!calendar) return res.status(404).json({ ok: false, message: 'Calendario no encontrado.' });
        res.json({ ok: true, message: 'Calendario eliminado (se puede restaurar).' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'No se pudo eliminar el calendario.' });
    }
};

const restoreCalendar = async (req, res) => {
    try {
        const deleted = await Calendars.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
        if (!deleted) return res.status(404).json({ ok: false, msg: 'No se encontró un calendario eliminado con ese ID.' });
        if (!(await canAccessCalendar(req.user, deleted))) return res.status(403).json({ ok: false, msg: 'No tienes acceso a este calendario.' });
        if (await Calendars.exists({ _id: { $ne: deleted._id }, titleStore: deleted.titleStore, cliente: deleted.cliente, deletedAt: null })) {
            return res.status(409).json({ ok: false, msg: 'No se puede restaurar: existe otro calendario activo con el mismo título.' });
        }
        const calendar = await withAuditTransaction(async (session) => {
            const restored = await Calendars.findOneAndUpdate({ _id: req.params.id, deletedAt: { $ne: null } }, { $set: { deletedAt: null, deletedBy: null, updatedBy: req.uid } }, { new: true, session });
            if (!restored) return null;
            await writeAudit(req, { action: 'calendar.restore', entity: 'calendar', entityId: restored._id, summary: `Restauró el calendario ${restored.titleStore}`, metadata: { cliente: restored.cliente } }, session);
            return restored;
        });
        if (!calendar) return res.status(404).json({ ok: false, msg: 'No se encontró un calendario eliminado con ese ID.' });
        res.json({ ok: true, calendar });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'No se pudo restaurar el calendario.' });
    }
};

module.exports = { createCalendar, getCalendars, getCalendar, deleteCalendar, updateCalendar, restoreCalendar };
