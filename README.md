# Enta Tools · Backend del módulo Calendarios
# Usuarios, roles y auditoría

El registro público está deshabilitado. Para crear el primer gerente en una base de datos nueva, desde esta carpeta ejecuta `npm run bootstrap-manager` en una terminal interactiva. El comando pide el nombre y una contraseña oculta (mínimo 12 caracteres) y se niega a crear otro gerente si ya existe uno activo.

Luego los gerentes crean usuarios desde **Usuarios** en la aplicación y pueden cambiarles el rol o desactivarlos. Los roles son `gerente`, `lider` y `desarrollador`; no se asignan relaciones individuales entre usuarios.

Gerentes y líderes consultan toda la auditoría. Los desarrolladores no tienen acceso a ella. Los gerentes pueden acceder a todos los calendarios; líderes y desarrolladores, solo a los calendarios asociados a su usuario. Los calendarios eliminados se conservan y se pueden restaurar desde **Auditoría**.
