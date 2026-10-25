const { Schema, model } = require('mongoose');

const AuditLogSchema = new Schema({
    actorId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, default: null },
    summary: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditLogSchema.index({ createdAt: -1 });
module.exports = model('AuditLog', AuditLogSchema);
