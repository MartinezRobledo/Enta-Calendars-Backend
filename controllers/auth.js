const { response } = require('express');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');
const { generarJWT } = require('../helpers/jwt');
const { canonical } = require('../helpers/roles');
const { writeAudit } = require('../helpers/audit');

const getUserRoles = async (user) => {
    const values = user.roles || [];
    const ids = values.filter((value) => /^[a-f\d]{24}$/i.test(String(value)));
    const docs = ids.length ? await Rol.find({ _id: { $in: ids } }).lean() : [];
    return [...new Set(values.map((value) => canonical(docs.find((role) => String(role._id) === String(value))?.name || value)))];
};

const publicUser = async (user) => ({ uid: String(user._id), name: user.name, picture: user.picture, roles: await getUserRoles(user) });

const loginUsuario = async (req, res = response) => {
    const { name, password } = req.body;
    try {
        const usuario = await Usuario.findOne({ name });
        if (!usuario || usuario.active === false || !bcrypt.compareSync(password, usuario.password)) {
            return res.status(401).json({ ok: false, msg: 'Usuario o contraseña incorrectos, o cuenta desactivada.' });
        }
        const userInfo = await publicUser(usuario);
        const token = await generarJWT(usuario.id, usuario.name);
        await writeAudit({ uid: usuario.id, user: usuario }, { action: 'login', entity: 'session', summary: 'Inicio de sesión' });
        res.json({ ok: true, ...userInfo, token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'No se pudo iniciar sesión.' });
    }
};

const revalidarToken = async (req, res = response) => {
    const token = await generarJWT(req.uid, req.name);
    res.json({ ok: true, ...(await publicUser(req.user)), token });
};

const logoutUsuario = async (req, res = response) => {
    await writeAudit(req, { action: 'logout', entity: 'session', summary: 'Cerró sesión' });
    res.json({ ok: true });
};

module.exports = { loginUsuario, revalidarToken, logoutUsuario };
