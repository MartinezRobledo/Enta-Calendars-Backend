const { Schema, model } = require('mongoose');

const UsuarioSchema = Schema({
    name: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    picture: {
        type: String,
    },
    roles: {
        type: [String],
        required: true,
    }
});


module.exports = model('Usuario', UsuarioSchema );

