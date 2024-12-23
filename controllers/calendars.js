const Calendars = require('../models/Calendars');

// Controlador para crear un calendario
const createCalendar = async (req, res) => {
    try {
        const { _id, titleStore, cliente } = req.body;

        // Verifica si existe un calendario con el mismo ID
        const existingById = await Calendars.findOne({ _id });
        if (existingById) {
            return res.status(400).json({
                ok: false,
                msg: 'Ya existe un calendario con el mismo ID.',
            });
        }

        // Verifica si existe un calendario con el mismo título y cliente
        const existingByTitle = await Calendars.findOne({ titleStore, cliente });
        if (existingByTitle) {
            return res.status(400).json({
                ok: false,
                msg: 'Ya existe un calendario con el mismo título.',
            });
        }

        // Crea el nuevo calendario
        const newCalendar = new Calendars(req.body);
        console.log("Nuevo calendario", newCalendar)
        await newCalendar.save();

        res.status(201).json({
            ok: true,
            calendar: newCalendar,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            msg: 'Error al guardar el calendario.',
        });
    }
};

const updateCalendar = async (req, res) => {
    try {
        const {_id, calendario} = req.body;

        // Validar que se realizaron cambios
        const calendarioPrevio = await Calendars.findById(_id)
        if(calendarioPrevio._id === calendario._id && calendarioPrevio.titleStore === calendario.titleStore){
            return res.status(404).json({ 
                ok: false,
                msg: "No realizó ninguna modificación.", 
            });
        }

        // Borrar en caso de haber habido cambios
        const calendarioBorrado = await Calendars.findByIdAndDelete(_id);
        if (!calendarioBorrado) {
            return res.status(404).json({ 
                ok: false,
                msg: "Ocurrió un error inesperado, no se pudo realizar el cambio.", 
            });
        }

        // Verifica si existe un calendario con el mismo ID
        const nuevoID = calendario._id
        const existingById = await Calendars.findOne({ nuevoID });
        if (existingById) {
            const restore = new Calendars(calendarioBorrado);
            await restore.save();
            return res.status(400).json({
                ok: false,
                msg: 'Ya existe un calendario con el mismo ID.\nCalendario existente: '+existingById.titleStore,
            });
        }

        // Verifica si existe un calendario con el mismo título y cliente
        const titleStore = calendario.titleStore
        const cliente = calendario.cliente
        const existingByTitle = await Calendars.findOne({ titleStore, cliente });
        if (existingByTitle) {
            const restore = new Calendars(calendarioBorrado);
            await restore.save();
            return res.status(400).json({
                ok: false,
                msg: 'Ya existe un calendario con el mismo título.',
            });
        }

        //Guardar nuevo calendario
        const nuevoCalendario = new Calendars(calendario)
        await nuevoCalendario.save();
        res.status(201).json({
            ok: true,
            calendar: nuevoCalendario,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            msg: 'Error al guardar el calendario.',
        });
    }
}

const getCalendars = async (req, res) => {
    const { user } = req.params;
    console.log("USUARIO", user)
    try {
        const calendars = await Calendars.find({ cliente: user });
        if(!calendars) {
            return res.status(200).json ({
                ok: true,
                msg: "No hay calendarios para mostrar.",
            });
        };

        return res.status(200).json({
            ok: true,
            calendars: calendars,
        });
    } catch (error) {
        console.error("No se pudo obtener los calendarios. Error: ", error.message); // Log para el servidor
        return res.status(500).json({
            ok: false,
            error: {
                message: error.message, // Envía solo el mensaje del error
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, // La pila solo en desarrollo
            },
        });
    }
    
}

const deleteCalendar = async (req, res) => {
    try {
        const { id } = req.params; // Obtener ID desde parámetros de la ruta

        // Elimina directamente y valida si existía
        const deletedCalendar = await Calendars.findByIdAndDelete(id);

        if (!deletedCalendar) {
            return res.status(404).json({ 
                ok: false,
                message: "Calendario no encontrado", 
            });
        }

        res.status(200).json({ 
            ok: true,
            message: "Calendario eliminado exitosamente",
        });
    } catch (error) {
        console.error(`Error eliminando el calendario: ${error.message}`);
        res.status(500).json({ 
            ok: false,
            error: error,
        });
    }
};

module.exports = {
    createCalendar,
    getCalendars,
    deleteCalendar,
    updateCalendar,
};
