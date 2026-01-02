const { Schema, model } = require('mongoose');

const CalendariosNewSchema = Schema({
    _id: { // Usamos _id directamente para el hash
        type: String,
        required: true,
    },
    cliente: {
        type: String,
        required: true,
    },
    titleStore: {
        type: String,
        required: true,
        trim: true, // Elimina espacios en blanco al inicio y al final
    },
    añosStore: [{
        año: {
            type: Number,
            required: true,
        },
        capasStore: {
            type: [
                {
                    id: {
                        type: Number,
                        required: true,
                    },
                    title: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    data: {
                        type: {
                            initCalendar: {
                                type: Date,
                                required: true,
                            },
                            finishCalendar: {
                                type: Date,
                                required: true,
                            },
                            byWeekday: {
                                type: Object, // Usar Map para objetos con pares clave-valor dinámicos
                                default: {}, // Valor por defecto
                            },
                            byMonthday: {
                                type: [Number],
                                default: [],
                            },
                            byMonthdayStr: {
                                type: String,
                                default: '',
                            },
                            allDays: {
                                type: Boolean,
                                default: false,
                            },
                            agrupar: {
                                type: Boolean,
                                default: false,
                            },
                            withHolidays: {
                                type: Boolean,
                                default: true,
                            },
                        },
                        required: true,
                    },
                    dependienteDe: {
                        type: Number,
                        default: null,
                    },
                    esPadre: {
                        type: [Number],
                        default: [],
                    },
                    dias: {
                        type: [Date],
                        default: [],
                    },
                },
            ],
            required: true,
        },
        capaActualStore: {
            type: Number,
            default: 0,
        },
        aditionalDaysToAdd: {
            type: [Date],
            default: [],
        },
        aditionalDaysToRemove: {
            type: [Date],
            default: [],
        },
        diasActivosStore: {
            type: [Date],
            default: [],
        },
    }],
    fechaActualizacion: {
        type: Date,
        default: new Date()
    }
});

// Elimina __v del resultado y usa _id como id
CalendariosNewSchema.method('toJSON', function () {
    const { __v, ...object } = this.toObject();
    return object;
});

module.exports = model('Calendarios', CalendariosNewSchema);
