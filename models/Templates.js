const { Schema, model } = require('mongoose');

const TemplateSchema = Schema({

    template_calendarbp: {
        type: Object,
        // required: true
    },

});

TemplateSchema.method('toJSON', function() {
    const { __v, _id, ...object } = this.toObject();
    object.id = _id;
    return object;
});



module.exports = model('Template', TemplateSchema );

