const { roleNames } = require('./roles');

const getAccessibleCalendarOwners = async (user) => {
    const roles = roleNames(user);
    if (roles.includes('gerente')) return null;
    return [user.name];
};

const canAccessCalendar = async (user, calendar) => {
    const owners = await getAccessibleCalendarOwners(user);
    return owners === null || owners.includes(calendar.cliente);
};

module.exports = { getAccessibleCalendarOwners, canAccessCalendar };
