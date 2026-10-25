require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');
const { canonical } = require('../helpers/roles');
const { withAuditTransaction, writeAudit } = require('../helpers/audit');

const ask = (rl, label) => new Promise((resolve) => rl.question(label, resolve));
const readPassword = (rl, label) => new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || !stdin.setRawMode) return reject(new Error('Ejecuta este comando en una terminal interactiva para ingresar la contraseña de forma segura.'));
    const wasPaused = stdin.isPaused();
    stdin.setRawMode(true); stdin.resume();
    process.stdout.write(label);
    let value = '';
    const onData = (chunk) => {
        const key = chunk.toString('utf8');
        if (key === '\u0003') { stdin.setRawMode(false); process.exit(130); }
        if (key === '\r' || key === '\n') {
            stdin.removeListener('data', onData); stdin.setRawMode(false); if (wasPaused) stdin.pause();
            process.stdout.write('\n'); resolve(value); return;
        }
        if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
        else if (!key.startsWith('\u001b')) value += key;
    };
    stdin.on('data', onData);
});

(async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        await mongoose.connect(process.env.DB_CNN);
        const users = await Usuario.find({ active: { $ne: false } }).select('name roles').lean();
        const roleDocs = await Rol.find().select('name').lean();
        const existing = users.find((user) => user.roles.some((value) => {
            const roleDoc = roleDocs.find((role) => String(role._id) === String(value));
            return canonical(roleDoc?.name || value) === 'gerente';
        }));
        if (existing) throw new Error(`Ya hay un gerente activo (${existing.name}). No se creó otro.`);
        const name = (await ask(rl, 'Usuario del gerente: ')).trim();
        rl.close();
        const password = await readPassword(rl, 'Contraseña (mínimo 12 caracteres): ');
        if (!name || password.length < 12) throw new Error('Nombre vacío o contraseña menor a 12 caracteres.');
        if (await Usuario.exists({ name })) throw new Error('Ese usuario ya existe.');
        const role = await Rol.findOneAndUpdate({ name: 'gerente' }, { $setOnInsert: { name: 'gerente' } }, { upsert: true, new: true });
        const user = await withAuditTransaction(async (session) => {
            const created = new Usuario({ name, password: bcrypt.hashSync(password, bcrypt.genSaltSync(12)), roles: [String(role._id)], active: true });
            await created.save({ session });
            await writeAudit({ system: true }, {
                action: 'user.bootstrap_create',
                entity: 'user',
                entityId: created.id,
                summary: `Creó el gerente inicial ${created.name}`,
                metadata: { role: 'gerente' },
            }, session);
            return created;
        });
        console.log(`Gerente inicial creado: ${user.name}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        rl.close(); await mongoose.disconnect();
    }
})();
