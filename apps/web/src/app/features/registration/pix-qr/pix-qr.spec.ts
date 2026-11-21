import { TestBed } from '@angular/core/testing';
import { PixQr } from './pix-qr';

describe('PixQr', () => {
  async function render(payload: string) {
    const fixture = TestBed.createComponent(PixQr);
    fixture.componentRef.setInput('payload', payload);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('desenha o código com margem de 4 módulos e um quadrado por módulo escuro', async () => {
    const el = await render('00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
    const svg = el.querySelector('svg')!;
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(w).toBe(h);
    // Versão ≥ 1 (21 módulos) + 8 de margem; um BR Code assim fica bem acima disso.
    expect(w).toBeGreaterThan(29);
    const d = svg.querySelector('path')!.getAttribute('d')!;
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true); // canto do padrão de localização, logo depois da margem
    expect(svg.getAttribute('role')).toBe('img');
  });

  it('o mesmo texto gera sempre o mesmo desenho; texto diferente, outro', async () => {
    const a = (await render('pix-a')).querySelector('path')!.getAttribute('d');
    const b = (await render('pix-a')).querySelector('path')!.getAttribute('d');
    const c = (await render('pix-b')).querySelector('path')!.getAttribute('d');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
