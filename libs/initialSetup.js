const Rol = require('../models/Rol');

const crearRoles = async () => {
    try {
        const count = await Rol.estimatedDocumentCount(); // Espera el conteo
        
        if (Number(count) > 0) {
            return; // Si ya hay roles, no continúa creando más
        }

        const values = await Promise.all([
            new Rol({ name: 'dev' }).save(),
            new Rol({ name: 'lead' }).save(),
            new Rol({ name: 'admin' }).save(),
        ]);

        console.log(values);
    } catch (error) {
        console.error(error);
    }
};

module.exports = {
    crearRoles
};
