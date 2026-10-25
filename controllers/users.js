const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');
const { canonical } = require('../helpers/roles');
const { writeAudit, withAuditTransaction } = require('../helpers/audit');

const rolesToNames = async (values = []) => {
    const ids = values.filter((value) => /^[a-f\d]{24}$/i.test(String(value)));
    const docs = ids.length ? await Rol.find({ _id: { $in: ids } }).lean() : [];
    return [...new Set(values.map((value) => canonical(docs.find((role) => String(role._id) === String(value))?.name || value)))];
};
const serializeUser = async (user) => ({
    uid: String(user._id), name: user.name, picture: user.picture,
    role: (await rolesToNames(user.roles))[0] || 'desarrollador',
    active: user.active !== false,
});
const resolveRoleId = async (name) => {
    const role = await Rol.findOne({ name: canonical(name) });
    if (!role) throw new Error('No está configurado el rol solicitado.');
    return String(role._id);
};

const listUsers = async (req, res) => {
    const users = await Usuario.find().select('-password').sort({ name: 1 }).lean();
    await writeAudit(req, { action: 'user.list', entity: 'user', summary: 'Consultó la administración de usuarios' });
    res.json({ ok: true, users: await Promise.all(users.map(serializeUser)) });
};

const createUser = async (req, res) => {
    try {
        const { name, password, role } = req.body;
        if (!name?.trim() || !password || password.length < 8) return res.status(400).json({ ok: false, msg: 'Indica usuario y contraseña de al menos 8 caracteres.' });
        if (!['gerente', 'lider', 'desarrollador'].includes(canonical(role))) return res.status(400).json({ ok: false, msg: 'Rol inválido.' });
        if (await Usuario.exists({ name: name.trim() })) return res.status(409).json({ ok: false, msg: 'Ya existe un usuario con ese nombre.' });
        const assignedRole = canonical(role);
        const roleId = await resolveRoleId(assignedRole);
        const user = await withAuditTransaction(async (session) => {
            const created = new Usuario({ name: name.trim(), password: bcrypt.hashSync(password, bcrypt.genSaltSync(10)), roles: [roleId], active: true });
            await created.save({ session });
            await writeAudit(req, { action: 'user.create', entity: 'user', entityId: created.id, summary: `Creó el usuario ${created.name}`, metadata: { role: assignedRole } }, session);
            return created;
        });
        res.status(201).json({ ok: true, user: await serializeUser(user) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: error.message || 'No se pudo crear el usuario.' });
    }
};

const updateUser = async (req, res) => {
    try {
        const user = await Usuario.findById(req.params.id);
        if (!user) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado.' });
        if (String(user._id) === String(req.uid)) return res.status(400).json({ ok: false, msg: 'No puedes cambiar tu propio rol.' });
        const { role } = req.body;
        const assignedRole = canonical(role);
        if (!['gerente', 'lider', 'desarrollador'].includes(assignedRole)) return res.status(400).json({ ok: false, msg: 'Rol inválido.' });
        const oldRoles = await rolesToNames(user.roles);
        const roleId = await resolveRoleId(assignedRole);
        const updatedUser = await withAuditTransaction(async (session) => {
            const savedUser = await Usuario.findByIdAndUpdate(user._id, {
                $set: { roles: [roleId] },
            }, { new: true, runValidators: true, session });
            if (!savedUser) throw new Error('El usuario dejó de estar disponible durante la actualización.');
            await writeAudit(req, {
                action: 'user.role_change',
                entity: 'user',
                entityId: savedUser.id,
                summary: `Cambió el rol de ${savedUser.name}`,
                metadata: { from: oldRoles[0], to: assignedRole },
            }, session);
            return savedUser;
        });
        res.json({ ok: true, user: await serializeUser(updatedUser) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: error.message || 'No se pudo actualizar el usuario.' });
    }
};

const deactivateUser = async (req, res) => {
    if (String(req.params.id) === String(req.uid)) return res.status(400).json({ ok: false, msg: 'No puedes desactivar tu propia cuenta.' });
    const user = await Usuario.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado.' });
    const roles = await rolesToNames(user.roles);
    if (roles.includes('gerente')) {
        const otherManagers = await Usuario.find({ _id: { $ne: user._id }, active: { $ne: false } }).select('roles').lean();
        const hasAnotherManager = (await Promise.all(otherManagers.map((candidate) => rolesToNames(candidate.roles)))).some((candidateRoles) => candidateRoles.includes('gerente'));
        if (!hasAnotherManager) return res.status(409).json({ ok: false, msg: 'No puedes desactivar al último gerente activo.' });
    }
    const deactivatedUser = await withAuditTransaction(async (session) => {
        const savedUser = await Usuario.findByIdAndUpdate(user._id, { $set: { active: false } }, { new: true, session });
        if (!savedUser) throw new Error('El usuario dejó de estar disponible durante la desactivación.');
        await writeAudit(req, { action: 'user.deactivate', entity: 'user', entityId: savedUser.id, summary: `Desactivó el usuario ${savedUser.name}`, metadata: { role: roles[0] || null } }, session);
        return savedUser;
    });
    res.json({ ok: true, user: await serializeUser(deactivatedUser) });
};

module.exports = { listUsers, createUser, updateUser, deactivateUser };
