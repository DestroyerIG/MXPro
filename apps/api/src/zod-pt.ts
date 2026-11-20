import { z } from 'zod';

/**
 * Mensagens padrão do Zod em português (o projeto é pt-BR, docs/arquitetura.md §6).
 * Importado uma vez no início (config.ts); vale para todas as validações da API.
 */
z.config(z.locales.pt());
