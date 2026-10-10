import base from './playwright.relatorios.config.js';
export default { ...base, testMatch: 'horario-brasilia.spec.js', use: { ...base.use, timezoneId: 'Asia/Tokyo' } };
