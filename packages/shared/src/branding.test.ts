import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { updateBrandingSchema } from './branding.js';

const valid = { brandName: 'MXPRO', brandNameAccent: 'MX', primaryColor: '#E8590C' };

describe('updateBrandingSchema', () => {
  it('aceita a marca padrão e preenche os opcionais', () => {
    expect(updateBrandingSchema.parse(valid)).toEqual({ ...valid, logoUrl: null, publicNameDisplay: 'FULL_NAME' });
  });

  it('campos de texto vazios viram "sem valor" (null)', () => {
    expect(updateBrandingSchema.parse({ ...valid, brandNameAccent: '', logoUrl: '  ' })).toMatchObject({
      brandNameAccent: null,
      logoUrl: null,
    });
  });

  it.each([
    [{ primaryColor: 'laranja' }, 'primaryColor', 'Use uma cor no formato #RRGGBB, ex.: #E8590C.'],
    [{ primaryColor: '#E85' }, 'primaryColor', 'Use uma cor no formato #RRGGBB, ex.: #E8590C.'],
    [{ brandName: '   ' }, 'brandName', 'Informe o nome.'],
    [{ brandNameAccent: 'PRO' }, 'brandNameAccent', 'O destaque precisa ser o começo do nome (ex.: "MX" em "MXPRO").'],
    [{ logoUrl: 'http://site.com/logo.png' }, 'logoUrl', 'Use um endereço que comece com https://.'],
    [{ logoUrl: 'javascript:alert(1)' }, 'logoUrl', 'Use um endereço que comece com https://.'],
  ])('recusa %o com mensagem em português', (patch, field, message) => {
    const r = updateBrandingSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(z.flattenError(r.error!).fieldErrors).toEqual({ [field]: [message] });
  });
});
