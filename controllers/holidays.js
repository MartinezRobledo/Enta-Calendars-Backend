const { response } = require('express');
const Feriados = require('../models/Feriados');
const HolidayCountry = require('../models/HolidayCountry');
const { writeAudit, withAuditTransaction } = require('../helpers/audit');

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const countryKeyFromName = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
const validCode = (value) => /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value);
const isYear = (value) => /^\d{4}$/.test(String(value)) && Number(value) >= 1900 && Number(value) <= 2200;
const legacyMillis = (date) => new Date(`${date}T12:00:00.000Z`).getTime();
const dateOnly = (date) => {
    const value = new Date(date);
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
};
const normalizeDates = (dates, year) => {
    if (!Array.isArray(dates)) return null;
    const normalized = [];
    for (const date of dates) {
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        const parsed = new Date(`${date}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime()) || dateOnly(parsed) !== date || parsed.getUTCFullYear() !== Number(year)) return null;
        normalized.push(date);
    }
    return [...new Set(normalized)].sort();
};
const legacyDates = (doc, year) => (doc.feriados_ar || []).map((value) => dateOnly(value)).filter((value) => Number(value.slice(0, 4)) === Number(year));
const toLegacyPayload = (doc, year) => ({
    id: doc._id,
    countryCode: doc.countryCode || 'AR',
    countryName: doc.countryName || 'Argentina',
    year: Number(doc.year || doc.año || year),
    año: String(doc.year || doc.año || year),
    dates: doc.dates?.length ? doc.dates : legacyDates(doc, year),
    feriados_ar: !doc.countryCode && Array.isArray(doc.feriados_ar)
        ? doc.feriados_ar
        : (doc.dates?.length ? doc.dates : legacyDates(doc, year)).map(legacyMillis),
    lastModified: doc.lastModified || null,
});

const ensureArgentina = async () => {
    await HolidayCountry.updateOne({ countryCode: 'AR' }, { $setOnInsert: { countryCode: 'AR', name: 'Argentina', lastModified: null } }, { upsert: true });
};

const listCountries = async (_req, res = response) => {
    try {
        await ensureArgentina();
        const countries = await HolidayCountry.find({}).sort({ name: 1 }).lean();
        const currentYear = new Date().getFullYear();
        res.json({ ok: true, countries: countries.map(({ countryCode, name, lastModified }) => ({ countryCode, name, lastModified, updatedThisYear: Boolean(lastModified && new Date(lastModified).getFullYear() === currentYear) })) });
    } catch (error) { res.status(500).json({ ok: false, msg: 'No se pudieron cargar los países.' }); }
};

const createCountry = async (req, res = response) => {
    const name = String(req.body.name || '').trim();
    const countryCode = countryKeyFromName(name);
    if (!validCode(countryCode) || !name || name.length > 100) return res.status(400).json({ ok: false, msg: 'Indica un nombre de país válido.' });
    try {
        const existingCountries = await HolidayCountry.find({}).select('name').lean();
        if (existingCountries.some((country) => countryKeyFromName(country.name) === countryCode)) {
            return res.status(409).json({ ok: false, msg: 'Ya existe un país con ese nombre.' });
        }
        const country = await HolidayCountry.create({ countryCode, name, lastModified: null });
        await writeAudit(req, { action: 'holiday.country.create', entity: 'holiday-country', entityId: countryCode, summary: `Creó el país ${name}`, metadata: { countryCode, name } });
        res.status(201).json({ ok: true, country });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ ok: false, msg: 'Ya existe un país con ese nombre.' });
        res.status(500).json({ ok: false, msg: 'No se pudo crear el país.' });
    }
};

const getCountryYear = async (req, res = response) => {
    const countryCode = normalizeCode(req.params.countryCode);
    const year = Number(req.params.year);
    if (!validCode(countryCode) || !isYear(year)) return res.status(400).json({ ok: false, msg: 'País o año no válido.' });
    try {
        const country = await HolidayCountry.findOne({ countryCode }).lean();
        if (!country) return res.status(404).json({ ok: false, msg: 'No existe ese país.' });
        let doc = await Feriados.findOne({ countryCode, year }).lean();
        // Compatibilidad/migración progresiva con documentos históricos feriados_ar/año.
        if (!doc && countryCode === 'AR') doc = await Feriados.findOne({ año: String(year), countryCode: { $exists: false } }).lean();
        res.json({ ok: true, holiday: { countryCode, countryName: country.name, year, dates: doc ? (doc.dates?.length ? doc.dates : legacyDates(doc, year)) : [], lastModified: doc?.lastModified || null }, feriados: doc ? toLegacyPayload(doc, year) : { countryCode, countryName: country.name, year, año: String(year), dates: [], feriados_ar: [], lastModified: null } });
    } catch (error) { res.status(500).json({ ok: false, msg: 'No se pudieron cargar los feriados.' }); }
};

const saveCountryYear = async (req, res = response) => {
    const countryCode = normalizeCode(req.params.countryCode);
    const year = Number(req.params.year);
    const dates = normalizeDates(req.body.dates, year);
    if (!validCode(countryCode) || !isYear(year) || !dates) return res.status(400).json({ ok: false, msg: 'País, año o lista de fechas no válida.' });
    try {
        const country = await HolidayCountry.findOne({ countryCode });
        if (!country) return res.status(404).json({ ok: false, msg: 'Crea el país antes de cargar sus feriados.' });
        const now = new Date();
        const doc = await withAuditTransaction(async (session) => {
            let saved = await Feriados.findOne({ countryCode, year }).session(session);
            if (!saved && countryCode === 'AR') saved = await Feriados.findOne({ año: String(year), countryCode: { $exists: false } }).session(session);
            if (saved) {
                saved.countryCode = countryCode;
                saved.countryName = country.name;
                saved.year = year;
                saved.año = String(year);
                saved.dates = dates;
                saved.feriados_ar = dates.map(legacyMillis);
                saved.lastModified = now;
                await saved.save({ session });
            } else {
                [saved] = await Feriados.create([{ countryCode, countryName: country.name, year, año: String(year), dates, feriados_ar: dates.map(legacyMillis), lastModified: now }], { session });
            }
            await HolidayCountry.updateOne({ countryCode }, { $set: { lastModified: now } }, { session });
            await writeAudit(req, { action: 'holiday.save', entity: 'holiday-year', entityId: `${countryCode}-${year}`, summary: `Actualizó los feriados de ${country.name} para ${year}`, metadata: { countryCode, countryName: country.name, year, dates } }, session);
            return saved;
        });
        res.json({ ok: true, holiday: { countryCode, countryName: country.name, year, dates, lastModified: doc.lastModified } });
    } catch (error) { console.error(error); res.status(500).json({ ok: false, msg: 'No se pudieron guardar los feriados.' }); }
};

// API histórica para la app de calendarios (feriados de Argentina).
const obtenerFeriados = async (req, res = response) => {
    const year = Number(req.params.id);
    if (!isYear(year)) return res.status(400).json({ ok: false, msg: 'Año no válido.' });
    try {
        const country = await HolidayCountry.findOne({ countryCode: 'AR' }).lean();
        if (!country) return res.status(404).json({ ok: false, msg: 'No hay feriados de Argentina configurados.' });
        let doc = await Feriados.findOne({ countryCode: 'AR', year }).lean();
        if (!doc) doc = await Feriados.findOne({ año: String(year), countryCode: { $exists: false } }).lean();
        const feriados = doc ? toLegacyPayload(doc, year) : { countryCode: 'AR', countryName: 'Argentina', year, año: String(year), dates: [], feriados_ar: [], lastModified: null };
        res.json({ ok: true, feriados });
    } catch (error) { res.status(500).json({ ok: false, msg: 'No se pudieron cargar los feriados.' }); }
};

const obtenerUltimoAño = async (req, res = response) => {
    try {
        await ensureArgentina();
        const result = await Feriados.findOne({ $or: [{ countryCode: 'AR' }, { countryCode: { $exists: false } }] }).sort({ año: -1 }).lean();
        const year = result ? Number(result.year || result.año) : new Date().getFullYear();
        const country = await HolidayCountry.findOne({ countryCode: 'AR' }).lean();
        if (!country) return res.status(404).json({ ok: false, msg: 'No hay feriados de Argentina configurados.' });
        res.json({ ok: true, feriados: result ? toLegacyPayload(result, year) : { countryCode: 'AR', countryName: country.name, year, año: String(year), dates: [], feriados_ar: [], lastModified: null } });
    } catch (error) { res.status(500).json({ ok: false, msg: 'No se pudieron cargar los feriados.' }); }
};

module.exports = { listCountries, createCountry, getCountryYear, saveCountryYear, obtenerFeriados, obtenerUltimoAño };
