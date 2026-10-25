const Rol = require('../models/Rol');

const crearRoles = async () => {
    try {
        await Promise.all(['gerente', 'lider', 'desarrollador'].map((name) => Rol.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true })));
    } catch (error) {
        console.error(error);
        throw error;
    }
};

module.exports = {
    crearRoles
};
