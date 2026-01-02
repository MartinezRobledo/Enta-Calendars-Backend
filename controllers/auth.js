const { response } = require('express');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const { generarJWT } = require('../helpers/jwt');
const Rol = require('../models/Rol');
 
const crearUsuario = async(req, res = response ) => {

    const { name, password, roles } = req.body;

    try {
        let usuario = await Usuario.findOne({ name });

        if ( usuario ) {
            return res.status(400).json({
                ok: false,
                msg: 'El usuario ya existe'
            });
        }

        usuario = new Usuario( req.body );
    
        // Encriptar contraseña
        const salt = bcrypt.genSaltSync();
        usuario.password = bcrypt.hashSync( password, salt );

        // Asignar el rol
        if(roles) {
            const rolesEncontrados = await Rol.find({ name: {$in: roles}});
            usuario.roles = rolesEncontrados.map(rol => rol._id);
        } else {
            const rol = await Rol.findOne({name: "dev"});
            usuario.roles = [rol._id];
        }

        await usuario.save();

        // Generar JWT
        const token = await generarJWT( usuario.id, usuario.name );
    
        res.status(201).json({
            ok: true,
            uid: usuario.id,
            name: usuario.name,
            roles: usuario.roles,
            token
        })
        
    } catch (error) {
        console.log(error)
        res.status(500).json({
            ok: false,
            msg: 'Por favor hable con el administrador'
        });
    }
}


const loginUsuario = async(req, res = response ) => {
    console.log(req.body); // <-- Esto te mostrará qué está llegando

    const { name, password } = req.body;

    try {
        
        const usuario = await Usuario.findOne({ name });

        if ( !usuario ) {
            return res.status(400).json({
                ok: false,
                msg: 'El usuario no existe con ese email'
            });
        }

        // Confirmar los passwords
        const validPassword = bcrypt.compareSync( password, usuario.password );

        if ( !validPassword ) {
            return res.status(400).json({
                ok: false,
                msg: 'Password incorrecto'
            });
        }

        // Generar JWT
        const token = await generarJWT( usuario.id, usuario.name );

        res.json({
            ok: true,
            uid: usuario.id,
            name: usuario.name,
            picture: usuario.picture,
            token
        })


    } catch (error) {
        console.log(error);
        res.status(500).json({
            ok: false,
            msg: 'Por favor hable con el administrador'
        });
    }

}


const revalidarToken = async (req, res = response ) => {

    const { uid, name } = req;

    // Generar JWT
    const token = await generarJWT( uid, name );

    const usuario = await Usuario.findOne({ name });
    const { picture } = usuario;

    res.json({
        ok: true,
        token,
        name,
        uid,
        picture,
    })
}


module.exports = {
    crearUsuario,
    loginUsuario,
    revalidarToken
}