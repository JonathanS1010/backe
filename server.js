import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMAILS_PATH = path.join(__dirname, 'data', 'emails.json');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Funciones para leer y escribir JSON
async function readJson(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Configura el transporte con nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAILJS_USER,
        pass: process.env.EMAILJS_PASSWORD
    }
});

// Ruta para registrar correos
app.post('/register', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.endsWith('@gmail.com')) {
        return res.status(400).json({ success: false, message: 'Correo inválido' });
    }

    const emails = await readJson(EMAILS_PATH);
    if (!emails.includes(email)) {
        emails.push(email);
        await writeJson(EMAILS_PATH, emails);
    }

    res.json({ success: true });
});

// Ruta para obtener clima y enviar alerta si UV es alto
app.get('/check-uv', async (req, res) => {
    try {
        const lat = 19.4326; // CDMX
        const lon = -99.1332;
        const apiKey = process.env.OPENWEATHER_API_KEY;

        const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=hourly,minutely,alerts&appid=${cb5c962133d27b281b097d2c40993bb1}`);
        const weatherData = await weatherRes.json();

        const uv = weatherData.current.uvi;
        const temp = weatherData.current.temp;
        const forecast = weatherData.daily;

        if (uv >= 11) {
            const emails = await readJson(EMAILS_PATH);

            for (const email of emails) {
                try {
                    await transporter.sendMail({
                        from: process.env.EMAIL_FROM,
                        to: email,
                        subject: 'Alerta UV Extrema',
                        text: `⚠️ Alerta UV: El índice UV actual es extremadamente alto (${uv}). ¡Protégete del sol!`
                    });
                    console.log(`Correo enviado a: ${email}`);
                } catch (err) {
                    console.error(`Error enviando a ${email}:`, err.message);
                }
            }
        }

        res.json({ uv, temp, forecast });
    } catch (err) {
        console.error('Error al obtener clima:', err.message);
        res.status(500).json({ error: 'Error al obtener datos del clima' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
