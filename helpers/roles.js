const aliases = { admin: 'gerente', manager: 'gerente', lead: 'lider', leader: 'lider', dev: 'desarrollador', developer: 'desarrollador' };
const canonical = (role) => aliases[String(role || '').toLowerCase()] || String(role || '').toLowerCase();
const roleNames = (user) => (user?.roles || []).map((role) => canonical(typeof role === 'string' ? role : role?.name));
module.exports = { canonical, roleNames };
