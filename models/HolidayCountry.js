const { Schema, model } = require('mongoose');

const HolidayCountrySchema = new Schema({
    countryCode: { type: String, required: true, uppercase: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    // Se cambia únicamente cuando alguien guarda manualmente un año.
    lastModified: { type: Date, default: null },
});

module.exports = model('HolidayCountry', HolidayCountrySchema);
