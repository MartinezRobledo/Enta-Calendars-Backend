const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { requireRole } = require('../middlewares/require-role');
const { listUsers, createUser, updateUser, deactivateUser } = require('../controllers/users');

const router = Router();
router.use(validarJWT, requireRole('gerente'));
router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deactivateUser);
module.exports = router;
