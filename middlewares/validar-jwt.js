const { response } = require('express');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');
const { canonical } = require('../helpers/roles');

const validarJWT = async ( req, res = response, next ) => {

    // x-token headers
    const token = req.header('x-token');

    if ( !token ) {
        return res.status(401).json({
            ok: false,
            msg: 'No hay token en la petición'
        });
    }

    try {
        
        const { uid } = jwt.verify(
            token,
            process.env.SECRET_JWT_SEED
        );

        const user = await Usuario.findById(uid).lean();
        if (!user || user.active === false) return res.status(401).json({ ok: false, msg: 'La cuenta no existe o está desactivada.' });
        const roleIds = (user.roles || []).filter((value) => /^[a-f\d]{24}$/i.test(String(value)));
        const roleDocs = roleIds.length ? await Rol.find({ _id: { $in: roleIds } }).lean() : [];
        const resolved = (user.roles || []).map((value) => {
            const doc = roleDocs.find((role) => String(role._id) === String(value));
            return canonical(doc?.name || value);
        });
        req.uid = String(user._id);
        req.name = user.name;
        req.user = { ...user, roles: [...new Set(resolved)] };


    } catch (error) {
        return res.status(401).json({
            ok: false,
            msg: 'Token no válido'
        });
    }



    next();
}


module.exports = {
    validarJWT
}
