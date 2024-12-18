const express = require('express');
const path = require('path')
require('dotenv').config();
const cors = require('cors');
const { dbConnection } = require('./database/config');

// Crear el servidor de express
const app = express();

// Base de datos
dbConnection();

// CORS
app.use(cors())

// Directorio Público
// app.use( express.static('public') );
app.use(express.static(path.join(__dirname, 'public')));

// Lectura y parseo del body
app.use( express.json() );

// Rutas
app.use('/api/auth', require('./routes/auth') );
app.use('/api/templates', require('./routes/templates') );
app.use('/api/holidays', require('./routes/holidays') );
app.use('/api/calendars', require('./routes/calendars'));

// Redirigir cualquier ruta a public.
app.use('*', (req, resp) => {
    resp.sendFile( path.join( __dirname, 'public/index.html'));
});


// Escuchar peticiones
app.listen( process.env.PORT, () => {
    console.log(`Servidor corriendo en puerto ${ process.env.PORT }`);
});






