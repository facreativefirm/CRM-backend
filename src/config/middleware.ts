import { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import express from 'express';

export const configureMiddleware = (app: Express) => {
    app.use(helmet({
        contentSecurityPolicy: false, // Disabled globally to prevent documentation route issues
        crossOriginEmbedderPolicy: false,
    }));
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://127.0.0.1:3000'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
};
