const { roleNames } = require('../helpers/roles');

const requireRole = (...allowed) => (req, res, next) => {
    const roles = roleNames(req.user);
    if (!allowed.some((role) => roles.includes(role))) return res.status(403).json({ ok: false, msg: 'No tienes permisos para esta acción.' });
    next();
};

module.exports = { requireRole };
