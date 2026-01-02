const { Schema, model } = require('mongoose');

const RolSchema = Schema(
    {
        name: String,
    },
    {
        versionKey: false,
    }
);


module.exports = model('Role', RolSchema );