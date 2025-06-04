const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const emailjs = require('@emailjs/nodejs');
require('dotenv').config();

// Inicializar Firebase con tu clave
const serviceAccount = require('./firebaseConfig.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;

// Ruta para registrar correo
app.post('/register', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.endsWith('@gmail.com')) {
        return res.status(400).json({ message: 'Correo inválido. Solo se aceptan @gmail.com' });
    }

    try {
        const docRef = db.collection('emails').doc(email);
        await docRef.set({ email, registeredAt: new Date().toISOString() });
        return res.status(200).json({ message: 'Correo registrado exitosamente' });
    } catch (error) {
        console.error('Error al registrar:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Ruta para verificar índice UV y enviar alertas
app.post('/check-uv', async (req, res) => {
    const { lat, lon } = req.body;

    if (!lat || !lon) {
        return res.status(400).json({ message: 'Faltan latitud y longitud' });
    }

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,alerts&appid=${process.env.OPENWEATHERMAP_KEY}`
        );
        const data = await response.json();
        const uv = data.current.uvi;

        console.log(`Índice UV actual: ${uv}`);

        if (uv >= 8) {
            const snapshot = await db.collection('emails').get();
            const users = snapshot.docs.map(doc => doc.data().email);

            for (const email of users) {
                await emailjs.send(
                    process.env.EMAILJS_SERVICE_ID,
                    process.env.EMAILJS_TEMPLATE_ID,
                    {
                        user_email: email,
                        uv_value: uv,
                        mensaje: `¡Cuidado! El índice UV es ${uv}, lo cual es MUY ALTO.`,
                    },
                    {
                        publicKey: process.env.EMAILJS_USER_ID,
                    }
                );

                console.log(`🔔 Alerta UV enviada a ${email}`);
            }

            return res.status(200).json({ message: 'Alertas enviadas', uv });
        } else {
            return res.status(200).json({ message: 'UV bajo, sin alertas', uv });
        }
    } catch (error) {
        console.error('Error al verificar UV o enviar correos:', error);
        return res.status(500).json({ message: 'Error al consultar UV o enviar correos' });
    }
});

// ✅ Ruta para guardar registros climáticos
app.post('/api/climate', async (req, res) => {
    const { latitude, longitude, uv, temperature, timestamp } = req.body;

    if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        typeof uv !== 'number' ||
        typeof temperature !== 'number' ||
        !timestamp
    ) {
        return res.status(400).json({ message: 'Datos inválidos o incompletos' });
    }

    try {
        await db.collection('climate_logs').add({
            latitude,
            longitude,
            uv,
            temperature,
            timestamp,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.status(200).json({ message: 'Registro climático guardado correctamente' });
    } catch (error) {
        console.error('Error al guardar clima:', error);
        return res.status(500).json({ message: 'Error interno al guardar datos climáticos' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
