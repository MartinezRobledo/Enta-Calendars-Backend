// Calendar ownership represents a customer, not an application user. All
// authenticated team members can work across the existing customer accounts.
const getAccessibleCalendarOwners = async () => null;

const canAccessCalendar = async (user, calendar) => {
    const owners = await getAccessibleCalendarOwners(user);
    return owners === null || owners.includes(calendar.cliente);
};

module.exports = { getAccessibleCalendarOwners, canAccessCalendar };
