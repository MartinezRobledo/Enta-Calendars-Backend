const { Router } = require("express");
const { obtenerFeriados, obtenerUltimoAño } = require("../controllers/holidays");

const router = Router();

// Obtener el año mayor
router.get('/last', obtenerUltimoAño)

// Obtener feriados Argentina (Año)
router.get('/:id(\\d+)', obtenerFeriados)

// Obtener feriados Argentina Todos los años
// router.get('/', obtenerFeriados)


module.exports = router;