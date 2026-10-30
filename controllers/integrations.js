const UIPATH_API_HOST = 'https://cloud.uipath.com';
const AUTOMATION_ANYWHERE_HOST_SUFFIX = '.my.automationanywhere.digital';
const AA_PAGE_SIZE = 100;
const AA_MAX_ITEMS = 1000;
const Usuario = require('../models/Usuario');
const { writeAudit, withAuditTransaction } = require('../helpers/audit');

const fetchAutomationAnywhereJson = async (url, options) => {
    const response = await fetch(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        const error = new Error(`Automation Anywhere respondió HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
    }

    return response.json();
};

const listAutomationAnywhere = async (controlRoom, token, endpoint, body) => {
    try {
        const items = [];
        let offset = 0;
        let firstPage = null;
        let total = null;

        while (offset < AA_MAX_ITEMS) {
            const result = await fetchAutomationAnywhereJson(`${controlRoom.origin}${endpoint}`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Authorization': token,
                },
                body: JSON.stringify({ ...body, page: { offset, length: AA_PAGE_SIZE } }),
            });
            const pageItems = Array.isArray(result.list) ? result.list : [];
            firstPage = firstPage || result.page || null;
            total = Number(result.page?.totalFilter ?? result.page?.total ?? pageItems.length);
            items.push(...pageItems);
            offset += pageItems.length;

            if (!pageItems.length || pageItems.length < AA_PAGE_SIZE || offset >= total) break;
        }

        return {
            list: items,
            page: firstPage ? { ...firstPage, offset: 0, length: items.length } : null,
            available: true,
            truncated: total !== null && total > items.length,
        };
    } catch (error) {
        return {
            list: [],
            page: null,
            available: false,
            status: error.status || null,
        };
    }
};

const connectUiPath = async (req, res) => {
    const { organization, tenant, accessToken } = req.body || {};
    const safeOrganization = String(organization || '').trim();
    const safeTenant = String(tenant || '').trim();
    const safeToken = String(accessToken || '').trim();

    if (!safeOrganization || !safeTenant || !safeToken) {
        return res.status(400).json({ ok: false, msg: 'Completa la organización, el tenant y el token de UiPath.' });
    }

    const url = `${UIPATH_API_HOST}/${encodeURIComponent(safeOrganization)}/${encodeURIComponent(safeTenant)}/orchestrator_/odata/Folders?$top=1`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${safeToken}`, Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const status = response.status === 401 || response.status === 403 ? 401 : 502;
            const msg = status === 401
                ? 'UiPath rechazó el token. Revisa que el token y el acceso al tenant sean correctos.'
                : `No se pudo validar el acceso a UiPath (HTTP ${response.status}). Revisa organización y tenant.`;
            return res.status(status).json({ ok: false, msg });
        }

        return res.json({ ok: true, msg: 'Conexión validada con UiPath Orchestrator.' });
    } catch (error) {
        const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
        return res.status(timedOut ? 504 : 502).json({
            ok: false,
            msg: timedOut ? 'UiPath tardó demasiado en responder.' : 'No se pudo conectar con UiPath. Revisa la conexión e inténtalo de nuevo.',
        });
    }
};

const connectAutomationAnywhere = async (req, res) => {
    const { controlRoomUrl, username, apiKey } = req.body || {};
    const safeUsername = String(username || '').trim();
    const safeApiKey = String(apiKey || '');

    if (!controlRoomUrl || !safeUsername || !safeApiKey) {
        return res.status(400).json({ ok: false, msg: 'Completa la dirección del Control Room, el usuario y la API Key.' });
    }

    let controlRoom;
    try {
        controlRoom = new URL(controlRoomUrl);
    } catch {
        return res.status(400).json({ ok: false, msg: 'La dirección del Control Room no es válida.' });
    }

    if (
        controlRoom.protocol !== 'https:' ||
        !(controlRoom.hostname.endsWith(AUTOMATION_ANYWHERE_HOST_SUFFIX)) ||
        controlRoom.pathname !== '/' ||
        controlRoom.search ||
        controlRoom.hash
    ) {
        return res.status(400).json({ ok: false, msg: 'Usa la dirección HTTPS de tu Control Room de Automation Anywhere.' });
    }

    try {
        const response = await fetch(`${controlRoom.origin}/v2/authentication`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: safeUsername, apiKey: safeApiKey }),
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const status = response.status === 401 || response.status === 403 ? 401 : 502;
            const msg = status === 401
                ? 'Automation Anywhere rechazó el usuario o la API Key.'
                : `No se pudo validar el acceso a Automation Anywhere (HTTP ${response.status}).`;
            return res.status(status).json({ ok: false, msg });
        }

        return res.json({ ok: true, msg: 'Conexión validada con Automation Anywhere Control Room.' });
    } catch (error) {
        const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
        return res.status(timedOut ? 504 : 502).json({
            ok: false,
            msg: timedOut ? 'Automation Anywhere tardó demasiado en responder.' : 'No se pudo conectar con Automation Anywhere. Revisa la conexión e inténtalo de nuevo.',
        });
    }
};

const getAutomationAnywhereOverview = async (req, res) => {
    const { controlRoomUrl, username, apiKey } = req.body || {};
    const safeUsername = String(username || '').trim();
    const safeApiKey = String(apiKey || '');

    if (!controlRoomUrl || !safeUsername || !safeApiKey) {
        return res.status(400).json({ ok: false, msg: 'Completa la dirección del Control Room, el usuario y la API Key.' });
    }

    let controlRoom;
    try {
        controlRoom = new URL(controlRoomUrl);
    } catch {
        return res.status(400).json({ ok: false, msg: 'La dirección del Control Room no es válida.' });
    }

    if (
        controlRoom.protocol !== 'https:' ||
        !controlRoom.hostname.endsWith(AUTOMATION_ANYWHERE_HOST_SUFFIX) ||
        controlRoom.pathname !== '/' ||
        controlRoom.search ||
        controlRoom.hash
    ) {
        return res.status(400).json({ ok: false, msg: 'Usa la dirección HTTPS de tu Control Room de Automation Anywhere.' });
    }

    try {
        const authentication = await fetchAutomationAnywhereJson(`${controlRoom.origin}/v2/authentication`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: safeUsername, apiKey: safeApiKey }),
        });

        if (!authentication.token) {
            return res.status(502).json({ ok: false, msg: 'Automation Anywhere no devolvió un token de sesión.' });
        }

        const token = authentication.token;
        const page = {};
        const activityPage = {};

        const [schedules, pools, devices, activity] = await Promise.all([
            listAutomationAnywhere(controlRoom, token, '/v2/schedule/automations/list', page),
            listAutomationAnywhere(controlRoom, token, '/v2/devices/pools/list', page),
            listAutomationAnywhere(controlRoom, token, '/v2/devices/list', page),
            listAutomationAnywhere(controlRoom, token, '/v3/activity/list', activityPage),
        ]);

        if (!schedules.available) {
            const status = schedules.status === 401 || schedules.status === 403 ? 403 : 502;
            return res.status(status).json({
                ok: false,
                msg: status === 403
                    ? 'La API Key autenticó, pero no tiene permiso para consultar los schedules.'
                    : 'No se pudo consultar la lista de schedules de Automation Anywhere.',
            });
        }

        const user = await Usuario.findById(req.uid).select('automationAnywhereFixedScheduleIds').lean();
        const scheduleIds = new Set(schedules.list.map((item) => String(item.id || '')).filter(Boolean));
        const storedFixedIds = user?.automationAnywhereFixedScheduleIds || [];
        const fixedScheduleIds = schedules.truncated
            ? storedFixedIds.map(String)
            : storedFixedIds.map(String).filter((id) => scheduleIds.has(id));
        if (!schedules.truncated && fixedScheduleIds.length !== storedFixedIds.length) {
            await Usuario.findByIdAndUpdate(req.uid, { $set: { automationAnywhereFixedScheduleIds: fixedScheduleIds } });
        }

        return res.json({
            ok: true,
            snapshot: {
                retrievedAt: new Date().toISOString(),
                fixedScheduleIds,
                schedules: {
                    items: schedules.list.map((item) => ({
                        id: String(item.id || ''),
                        activityName: item.activityName || item.fileName || 'Automatización sin nombre',
                        fileId: String(item.fileId || ''),
                        scheduleType: item.scheduleType || '',
                        taskType: item.taskType || '',
                        status: item.status || '',
                        startDate: item.startDate || '',
                        endDate: item.endDate || '',
                        startTime: item.startTime || '',
                        timeZone: item.timeZone || '',
                        repeatEnabled: Boolean(item.repeatEnabled),
                        dailyRecurrence: item.dailyRecurrence || null,
                        weeklyRecurrence: item.weeklyRecurrence || null,
                        monthlyDateRecurrence: item.monthlyDateRecurrence || null,
                        monthlyWeekDayRecurrence: item.monthlyWeekDayRecurrence || null,
                        nextRun: item.zonedNextRunDateTime || '',
                        runAsUserIds: (item.runAsUserIds || []).map(String),
                        holidayCalendarIds: (item.holidayCalendarIds || []).map(String),
                        updatedOn: item.updatedOn || '',
                    })),
                    page: schedules.page,
                    truncated: schedules.truncated,
                },
                devices: {
                    available: devices.available,
                    items: devices.list.map((item) => ({
                        id: String(item.id || ''),
                        name: item.nickname || item.hostName || `Dispositivo ${item.id || ''}`,
                        status: item.status || '',
                        type: item.type || '',
                        poolName: item.poolName || '',
                        defaultUsers: (item.defaultUsers || []).map((user) => ({
                            id: String(user.id || ''),
                            username: user.username || '',
                        })),
                    })),
                    page: devices.page,
                    truncated: devices.truncated,
                },
                pools: {
                    available: pools.available,
                    items: pools.list.map((item) => ({
                        id: String(item.id || ''),
                        name: item.name || '',
                        status: item.status || '',
                        detailedStatus: item.detailedStatus || '',
                        deviceIds: (item.deviceIds || []).map(String),
                        deviceCount: Number(item.deviceCount || 0),
                    })),
                    page: pools.page,
                    truncated: pools.truncated,
                },
                activity: {
                    available: activity.available,
                    items: activity.list.map((item) => ({
                        automationId: String(item.automationId || ''),
                        fileId: String(item.fileId || ''),
                        status: item.status || '',
                        startDateTime: item.startDateTime || '',
                        endDateTime: item.endDateTime || '',
                        deviceId: String(item.deviceId || ''),
                        deviceName: item.deviceName || '',
                    })),
                    page: activity.page,
                    truncated: activity.truncated,
                },
            },
        });
    } catch (error) {
        const status = error.status === 401 || error.status === 403 ? 401 : 502;
        const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
        return res.status(timedOut ? 504 : status).json({
            ok: false,
            msg: timedOut
                ? 'Automation Anywhere tardó demasiado en responder.'
                : status === 401
                    ? 'Automation Anywhere rechazó el usuario o la API Key.'
                    : 'No se pudo consultar Automation Anywhere. Revisa la dirección e inténtalo nuevamente.',
        });
    }
};

const updateAutomationAnywherePreferences = async (req, res) => {
    const { fixedScheduleIds } = req.body || {};
    if (!Array.isArray(fixedScheduleIds) || fixedScheduleIds.length > AA_MAX_ITEMS) {
        return res.status(400).json({ ok: false, msg: 'La lista de schedules inamovibles no es válida.' });
    }

    const ids = [...new Set(fixedScheduleIds.map((id) => String(id).trim()).filter((id) => /^[\w-]{1,128}$/.test(id)))];
    if (ids.length !== fixedScheduleIds.length) {
        return res.status(400).json({ ok: false, msg: 'La lista contiene identificadores de schedule inválidos.' });
    }

    try {
        await withAuditTransaction(async (session) => {
            const user = await Usuario.findByIdAndUpdate(
                req.uid,
                { $set: { automationAnywhereFixedScheduleIds: ids } },
                { new: true, session },
            );
            if (!user) throw new Error('No se encontró el usuario de la sesión.');
            await writeAudit(req, {
                action: 'automation-anywhere.fixed-schedules.update',
                entity: 'user-settings',
                entityId: req.uid,
                summary: 'Actualizó los schedules inamovibles de Automation Anywhere',
                metadata: { fixedScheduleCount: ids.length },
            }, session);
        });
        return res.json({ ok: true, fixedScheduleIds: ids });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: 'No se pudo guardar la preferencia de schedules inamovibles.' });
    }
};

module.exports = { connectUiPath, connectAutomationAnywhere, getAutomationAnywhereOverview, updateAutomationAnywherePreferences };
