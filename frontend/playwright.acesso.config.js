import { defineConfig } from '@playwright/test';
import base from './playwright.relatorios.config.js';
export default defineConfig({ ...base, testMatch: 'acesso-renovado.spec.js' });
