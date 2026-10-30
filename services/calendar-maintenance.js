const Calendars = require('../models/Calendars');
const Feriados = require('../models/Feriados');
const { writeAudit, withAuditTransaction } = require('../helpers/audit');

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});
const holidayCache = new Map();

const localDateParts = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(datePartsFormatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
    return { year: Number(parts.year), month: Number(parts.month) - 1, day: Number(parts.day) };
};

const argentinaYear = (date = new Date()) => localDateParts(date).year;
const dateOnlyKey = (value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parts = localDateParts(value);
    return parts && `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};
const monthDayKey = (value) => {
    const parts = localDateParts(value);
    return parts && `${parts.month}-${parts.day}`;
};

const dateInYear = (value, year) => {
    const parts = localDateParts(value);
    if (!parts) return new Date(Date.UTC(year, 0, 1, 3));
    const day = Math.min(parts.day, new Date(Date.UTC(year, parts.month + 1, 0)).getUTCDate());
    return new Date(Date.UTC(year, parts.month, day, 3));
};

const dateForMonthDay = (key, year) => {
    const [month, day] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month, day, 3));
    return date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
};

const datesForYear = (values, year, excluded = new Set()) => [...new Set(
    (values || []).map(monthDayKey).filter((key) => key && !excluded.has(key))
)].map((key) => dateForMonthDay(key, year)).filter(Boolean);

const hasConfiguredRules = (yearConfig) => (yearConfig?.capasStore || []).some((layer) => {
    const data = layer?.data || {};
    const root = layer?.dependienteDe === null || layer?.dependienteDe === undefined;
    return root && (data.allDays || Object.keys(data.byWeekday || {}).length > 0);
});

const hasManualDays = (yearConfig) =>
    (yearConfig?.aditionalDaysToAdd || []).length > 0
    || (yearConfig?.aditionalDaysToRemove || []).length > 0;

const cachedHolidayDateKeys = async (year) => {
    const cached = holidayCache.get(year);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    const promise = (async () => {
        let doc = await Feriados.findOne({ countryCode: 'AR', year }).lean();
        if (!doc) doc = await Feriados.findOne({ año: String(year), countryCode: { $exists: false } }).lean();
        if (Array.isArray(doc?.dates) && doc.dates.length) return doc.dates;
        return (doc?.feriados_ar || []).map((value) => {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
        }).filter(Boolean);
    })();
    holidayCache.set(year, { promise, expiresAt: Date.now() + 30000 });
    return promise;
};

const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const expandMonthdayRule = (ruleText) => String(ruleText || '').split(',').map((value) => value.trim()).filter(Boolean).flatMap((item) => {
    if (item.endsWith('+')) {
        const actual = Number(item.slice(0, -1));
        if (!Number.isFinite(actual)) return [];
        const values = [];
        if (actual < 0) for (let day = actual; day <= -1; day += 1) values.push(day);
        else for (let day = actual; day <= 31; day += 1) values.push(day);
        return values;
    }
    if (item.endsWith('-')) {
        const actual = Number(item.slice(0, -1));
        if (!Number.isFinite(actual)) return [];
        const values = [];
        if (actual < 0) for (let day = -31; day <= actual; day += 1) values.push(day);
        else for (let day = 1; day <= actual; day += 1) values.push(day);
        return values;
    }
    const day = Number(item);
    return Number.isFinite(day) && day !== 0 ? [day] : [];
});

const monthdaySelectors = (data) => String(data.byMonthdayStr || '').trim()
    ? expandMonthdayRule(data.byMonthdayStr)
    : (data.byMonthday || []).map(Number).filter((day) => Number.isFinite(day) && day !== 0);

const selectedWeekdays = (data) => {
    const weekdays = Object.values(data.byWeekday || {}).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    return weekdays.length || !data.allDays ? weekdays : [0, 1, 2, 3, 4, 5, 6];
};

const isSelectedMonthday = (day, monthLength, selectors) => selectors.length === 0 || selectors.some((selector) => (
    selector > 0 ? selector === day : monthLength + selector + 1 === day
));

const rootDays = (layer) => {
    const data = layer.data || {};
    const weekdays = selectedWeekdays(data);
    if (!weekdays.length) return [];

    const start = localDateParts(data.initCalendar);
    const finish = localDateParts(data.finishCalendar);
    if (!start || !finish) return [];
    const startTime = Date.UTC(start.year, start.month, start.day);
    const finishTime = Date.UTC(finish.year, finish.month, finish.day);
    if (startTime > finishTime) return [];

    const selectors = monthdaySelectors(data);
    const days = [];
    for (let time = startTime; time <= finishTime; time += 86400000) {
        const date = new Date(time);
        const weekday = (date.getUTCDay() + 6) % 7;
        if (!weekdays.includes(weekday)) continue;
        if (!isSelectedMonthday(date.getUTCDate(), daysInMonth(date.getUTCFullYear(), date.getUTCMonth()), selectors)) continue;
        days.push(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 3)));
    }
    return days;
};

const selectByMonthday = (days, indices) => {
    if (!indices.length) return days;
    const byMonth = new Map();
    for (const day of days) {
        const parts = localDateParts(day);
        const key = `${parts.year}-${parts.month}`;
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key).push(day);
    }
    const selected = [];
    for (const monthDays of byMonth.values()) {
        for (const index of indices) {
            if (Math.abs(index) > monthDays.length) continue;
            const selectedDay = index > 0 ? monthDays[index - 1] : monthDays[monthDays.length + index];
            if (selectedDay) selected.push(selectedDay);
        }
    }
    return [...new Map(selected.map((date) => [dateOnlyKey(date), date])).values()].sort((a, b) => a - b);
};

const dependentDays = (parentDays, layer) => {
    const data = layer.data || {};
    const start = dateOnlyKey(data.initCalendar);
    const finish = dateOnlyKey(data.finishCalendar);
    let days = parentDays.filter((day) => {
        const key = dateOnlyKey(day);
        return (!start || key >= start) && (!finish || key <= finish);
    });
    days = selectByMonthday(days, (data.byMonthday || []).map(Number).filter(Number.isFinite));
    const weekdays = selectedWeekdays(data);
    if (!weekdays.length) return [];
    const weekdaySet = new Set(weekdays);
    return days.filter((day) => weekdaySet.has((new Date(day).getUTCDay() + 6) % 7));
};

const applyGrouping = (days, layer, year) => {
    if (!layer.data?.agrupar) return days;
    const required = Object.keys(layer.data.byWeekday || {}).length || (layer.data.allDays ? 7 : 0);
    const active = new Set(days.map(dateOnlyKey));
    const result = [];
    for (let offset = 0; offset < 365; offset += 7) {
        const block = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(Date.UTC(year, 0, 1 + offset + index));
            return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 3));
        });
        const matching = block.filter((date) => active.has(dateOnlyKey(date)));
        if (matching.length >= required) result.push(...matching);
    }
    return result;
};

const calculateLayers = (layers, holidays, year) => {
    const state = new Map();
    const calculate = (index) => {
        if (state.get(index) === 'done') return layers[index].dias;
        if (state.get(index) === 'visiting') throw new Error(`Dependencia cíclica en capa ${index + 1}.`);
        const layer = layers[index];
        if (!layer) return [];
        state.set(index, 'visiting');
        const parentIndex = Number(layer.dependienteDe) - 1;
        let days = layer.dependienteDe !== null && layer.dependienteDe !== undefined
            ? dependentDays(calculate(parentIndex), layer)
            : rootDays(layer);
        if (layer.data?.withHolidays === false) {
            const holidayKeys = new Set(holidays);
            days = days.filter((date) => !holidayKeys.has(dateOnlyKey(date)));
        }
        days = applyGrouping(days, layer, year);
        layers[index] = { ...layer, dias: days };
        state.set(index, 'done');
        return days;
    };

    layers.forEach((_, index) => calculate(index));
    return layers;
};

const buildYear = (source, year, holidays, manualDays) => {
    const isClonedYear = Number(source.año) !== year;
    const layers = (source.capasStore || []).map((layer) => ({
        ...(isClonedYear ? Object.fromEntries(Object.entries(layer).filter(([key]) => key !== '_id')) : layer),
        data: {
            ...layer.data,
            initCalendar: dateInYear(layer.data?.initCalendar, year),
            finishCalendar: dateInYear(layer.data?.finishCalendar, year),
            byWeekday: { ...(layer.data?.byWeekday || {}) },
            byMonthday: [...(layer.data?.byMonthday || [])],
        },
        esPadre: [...(layer.esPadre || [])],
        dias: [],
    }));
    calculateLayers(layers, holidays, year);

    return {
        ...(isClonedYear ? Object.fromEntries(Object.entries(source).filter(([key]) => key !== '_id')) : source),
        año: year,
        capasStore: layers,
        capaActualStore: Math.min(source.capaActualStore || 0, Math.max(layers.length - 1, 0)),
        aditionalDaysToAdd: datesForYear(manualDays.add, year, manualDays.removeKeys),
        aditionalDaysToRemove: datesForYear(manualDays.remove, year),
        diasActivosStore: layers.filter((layer) => (layer.esPadre || []).length === 0).flatMap((layer) => layer.dias || []),
    };
};

const blankYear = (year, manualDays) => ({
    año: year,
    capasStore: [{
        id: 1,
        title: 'Capa 1',
        data: {
            initCalendar: new Date(Date.UTC(year, 0, 1, 3)),
            finishCalendar: new Date(Date.UTC(year, 11, 31, 3)),
            byWeekday: {},
            byMonthday: [],
            byMonthdayStr: '',
            allDays: false,
            agrupar: false,
            withHolidays: true,
        },
        dependienteDe: null,
        esPadre: [],
        dias: [],
    }],
    capaActualStore: 0,
    aditionalDaysToAdd: datesForYear(manualDays.add, year, manualDays.removeKeys),
    aditionalDaysToRemove: datesForYear(manualDays.remove, year),
    diasActivosStore: [],
});

const completeYears = async (calendar, currentYear = argentinaYear(), { recalculateYears = [] } = {}) => {
    const existingYears = Array.isArray(calendar.añosStore) ? calendar.añosStore : [];
    const years = [...existingYears];
    const wantedYears = [currentYear - 1, currentYear, currentYear + 1];
    const manualDays = {
        add: existingYears.flatMap((config) => config.aditionalDaysToAdd || []),
        remove: existingYears.flatMap((config) => config.aditionalDaysToRemove || []),
    };
    manualDays.removeKeys = new Set(manualDays.remove.map(monthDayKey).filter(Boolean));
    const sourceByYear = {};
    const yearsRebuilt = [];
    const yearsAdded = [];
    const yearsRecalculated = [];
    const recalculateSet = new Set(recalculateYears.map(Number));

    for (const year of wantedYears) {
        const index = years.findIndex((config) => Number(config.año) === year);
        const existing = index >= 0 ? years[index] : null;
        const shouldRecalculate = recalculateSet.has(year);

        if (existing && !shouldRecalculate && (hasConfiguredRules(existing) || hasManualDays(existing))) {
            const next = {
                ...existing,
                aditionalDaysToAdd: datesForYear(manualDays.add, year, manualDays.removeKeys),
                aditionalDaysToRemove: datesForYear(manualDays.remove, year),
            };
            if (JSON.stringify(existing) !== JSON.stringify(next)) yearsRecalculated.push(year);
            years[index] = next;
            continue;
        }

        let source = existing && (hasConfiguredRules(existing) || hasManualDays(existing)) ? existing : null;
        if (!source) {
            const candidates = years.filter((config) => Number(config.año) !== year && Array.isArray(config.capasStore) && config.capasStore.length);
            source = candidates.filter(hasConfiguredRules)
                .sort((a, b) => Math.abs(Number(a.año) - year) - Math.abs(Number(b.año) - year))[0]
                || candidates.filter(hasManualDays)
                    .sort((a, b) => Math.abs(Number(a.año) - year) - Math.abs(Number(b.año) - year))[0]
                || candidates.sort((a, b) => Math.abs(Number(a.año) - year) - Math.abs(Number(b.año) - year))[0]
                || existing;
        }

        const holidays = source && (shouldRecalculate || index < 0 || Number(source.año) !== year)
            ? await cachedHolidayDateKeys(year)
            : [];
        const next = source
            ? buildYear(source, year, holidays, manualDays)
            : blankYear(year, manualDays);
        if (source) sourceByYear[year] = Number(source.año);
        const yearChanged = !existing || JSON.stringify(existing) !== JSON.stringify(next);
        if (index < 0) yearsAdded.push(year);
        else if (yearChanged && existing && source && Number(source.año) !== year) yearsRebuilt.push(year);
        else if (yearChanged && existing) yearsRecalculated.push(year);
        if (index >= 0) years[index] = next;
        else years.push(next);
    }

    years.sort((a, b) => Number(a.año) - Number(b.año));
    const result = { ...calendar, añosStore: years };
    const changed = JSON.stringify(calendar.añosStore || []) !== JSON.stringify(result.añosStore);
    return { calendar: result, changed, yearsAdded, yearsRebuilt, yearsRecalculated, sourceByYear };
};

const writeSystemMaintenanceAudit = async (calendar, result, reason, session) => {
    const affected = result.yearsAdded.length || result.yearsRebuilt.length || result.yearsRecalculated.length;
    if (!affected) return;
    await writeAudit({ system: true, systemName: 'Sistema' }, {
        action: 'calendar.system_maintain',
        entity: 'calendar',
        entityId: calendar._id,
        summary: `El sistema actualizó los años del calendario ${calendar.titleStore}`,
        metadata: {
            cliente: calendar.cliente,
            reason,
            yearsAdded: result.yearsAdded,
            yearsRebuilt: result.yearsRebuilt,
            yearsRecalculated: result.yearsRecalculated,
            sourceByYear: result.sourceByYear,
        },
    }, session);
};

const ensureCalendarYears = async (calendarId, { reason = 'calendar_read', currentYear = argentinaYear(), recalculateYears = [] } = {}) => {
    const calendar = await Calendars.findOne({ _id: calendarId, deletedAt: null }).lean();
    if (!calendar) return { changed: false, calendar: null };
    const preliminary = await completeYears(calendar, currentYear, { recalculateYears });
    if (!preliminary.changed) return { ...preliminary, calendar };

    return withAuditTransaction(async (session) => {
        const latest = await Calendars.findOne({ _id: calendarId, deletedAt: null }).session(session).lean();
        if (!latest) return { changed: false, calendar: null };
        const result = await completeYears(latest, currentYear, { recalculateYears });
        if (!result.changed) return { ...result, calendar: latest };

        const saved = await Calendars.findOneAndUpdate(
            { _id: latest._id, deletedAt: null },
            { $set: { añosStore: result.calendar.añosStore } },
            { new: true, runValidators: true, session }
        );
        if (!saved) return { ...result, calendar: null };
        await writeSystemMaintenanceAudit(latest, result, reason, session);
        return { ...result, calendar: saved.toObject() };
    });
};

const maintainAllCalendars = async ({ reason = 'startup', currentYear = argentinaYear(), year = null, recalculateYears = [] } = {}) => {
    const filter = { deletedAt: null };
    const cursor = Calendars.find(filter).select('_id').lean().cursor();
    const summary = { checked: 0, updated: 0, failed: 0 };
    for await (const item of cursor) {
        summary.checked += 1;
        try {
            const result = year == null
                ? await ensureCalendarYears(item._id, { reason, currentYear, recalculateYears })
                : await ensureCalendarYearsForHolidayYear(item._id, year, { reason, currentYear });
            if (result.changed) summary.updated += 1;
        } catch (error) {
            summary.failed += 1;
            console.error(`No se pudo mantener el calendario ${item._id}:`, error.message);
        }
    }
    return summary;
};

const ensureCalendarYearsForHolidayYear = async (calendarId, year, { reason = 'holiday_update', currentYear = argentinaYear() } = {}) => {
    // Recalculate the full rolling range so cross-year dependencies and manual days stay consistent.
    return ensureCalendarYears(calendarId, { reason: `${reason}:${year}`, currentYear, recalculateYears: [year] });
};

const invalidateHolidayCache = (year) => holidayCache.delete(Number(year));

let rolloverTimer = null;
let lastRolloverYear = null;
const startCalendarMaintenanceScheduler = () => {
    if (rolloverTimer) return;
    lastRolloverYear = argentinaYear();
    rolloverTimer = setInterval(async () => {
        const year = argentinaYear();
        if (year === lastRolloverYear) return;
        lastRolloverYear = year;
        const summary = await maintainAllCalendars({ reason: 'year_rollover', currentYear: year });
        console.log('Mantenimiento anual de calendarios finalizado:', summary);
    }, 60 * 60 * 1000);
    rolloverTimer.unref?.();
};

module.exports = {
    argentinaYear,
    completeYears,
    ensureCalendarYears,
    ensureCalendarYearsForHolidayYear,
    maintainAllCalendars,
    startCalendarMaintenanceScheduler,
    invalidateHolidayCache,
    writeSystemMaintenanceAudit,
};
