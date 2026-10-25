const { Schema, model } = require('mongoose');

const FeriadosSchema = Schema({
    feriados_ar: {
        type: [Number],
        default: []
    },
    año: {
        type: String,
        required: true
    },
    countryCode: { type: String, uppercase: true, trim: true, index: true },
    countryName: { type: String, trim: true },
    year: { type: Number, index: true },
    // Fechas date-only YYYY-MM-DD evitan desplazamientos por zona horaria.
    dates: { type: [String], default: [] },
    lastModified: { type: Date, default: null },

});

FeriadosSchema.index({ countryCode: 1, year: 1 }, { unique: true, sparse: true });


FeriadosSchema.method('toJSON', function() {
    const { __v, _id, ...object } = this.toObject();
    object.id = _id;
    return object;
});



module.exports = model('Feriados', FeriadosSchema );

