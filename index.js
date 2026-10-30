const express = require('express');
const path = require('path')
require('dotenv').config();
const cors = require('cors');
const { dbConnection } = require('./database/config');
const { crearRoles } = require('./libs/initialSetup');

// Crear el servidor de express
const app = express();

// CORS
app.use(cors())

// Directorio Público
app.use( express.static('dist') );
// app.use(express.static(path.join(__dirname, 'public')));

// Lectura y parseo del body
app.use( express.json() );

// Rutas
app.use('/api/auth', require('./routes/auth') );
app.use('/api/users', require('./routes/users'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/templates', require('./routes/templates') );
app.use('/api/holidays', require('./routes/holidays') );
app.use('/api/calendars', require('./routes/calendars'));
app.use('/api/integrations', require('./routes/integrations'));

// Redirigir cualquier ruta a public.
app.use('*', (req, resp) => {
    resp.sendFile( path.join( __dirname, 'dist/index.html'));
});

// Escuchar peticiones
const startServer = async () => {
    try {
        await dbConnection();
        await crearRoles();
        app.listen(process.env.PORT, () => console.log(`Servidor corriendo en puerto ${process.env.PORT}`));
    } catch (error) {
        console.error('No se pudo iniciar el servidor:', error.message);
        process.exit(1);
    }
};

startServer();






