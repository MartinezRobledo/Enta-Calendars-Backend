const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

const withAuditTransaction = async (operation) => {
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            result = await operation(session);
        });
        return result;
    } finally {
        await session.endSession();
    }
};

const writeAudit = async (req, { action, entity, entityId = null, summary, metadata = {} }, session = null) => {
    if (!req?.user && !req?.system) {
        if (session) throw new Error('No se puede confirmar una mutación sin su actor de auditoría.');
        return;
    }
    const entry = { actorId: req.system ? null : req.uid, actorName: req.system ? (req.systemName || 'Sistema (bootstrap)') : req.user.name, action, entity, entityId: entityId == null ? null : String(entityId), summary, metadata };
    if (session) await AuditLog.create([entry], { session });
    else await AuditLog.create(entry);
};

module.exports = { writeAudit, withAuditTransaction };
