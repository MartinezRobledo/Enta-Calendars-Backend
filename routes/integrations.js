const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const {
    connectUiPath,
    connectAutomationAnywhere,
    getAutomationAnywhereOverview,
    updateAutomationAnywherePreferences,
} = require('../controllers/integrations');

const router = Router();

router.use(validarJWT);
router.post('/uipath/connect', connectUiPath);
router.post('/automation-anywhere/connect', connectAutomationAnywhere);
router.post('/automation-anywhere/overview', getAutomationAnywhereOverview);
router.put('/automation-anywhere/preferences', updateAutomationAnywherePreferences);

module.exports = router;
